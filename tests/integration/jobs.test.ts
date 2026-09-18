import { expect, it, vi } from "vitest"
import { Settings, DateTime } from "luxon"
import { createTasks } from "../../src/tasks.js"
import { businessSuite } from "../helpers/business.js"
const s = businessSuite()
function tasks(
	sendNotification = vi.fn().mockResolvedValue({ statusCode: 201 })
) {
	return {
		jobs: createTasks({
			prisma: s.h.prisma,
			redis: s.h.redis,
			webPush: { sendNotification }
		}),
		sendNotification
	}
}
async function pushFixture() {
	const { h, t } = s
	const subscription = await h.prisma.webPushSubscription.create({
		data: {
			sessionId: t.session.id,
			endpoint: "https://push.example/one",
			p256dh: "key",
			auth: "auth"
		}
	})
	await h.prisma.webPushSubscription.create({
		data: {
			sessionId: t.foreignSession.id,
			endpoint: "https://push.example/foreign",
			p256dh: "key",
			auth: "auth"
		}
	})
	const notification = await h.prisma.notification.create({
		data: {
			userId: t.owner.id,
			appId: t.app.id,
			time: new Date(0),
			interval: 0,
			title: "Title",
			body: "Body"
		}
	})
	return { subscription, notification }
}

it("sends due notifications only to the matching app and removes one-off notifications", async () => {
	await pushFixture()
	const { h, t } = s
	await h.prisma.notification.create({
		data: {
			userId: t.owner.id,
			appId: t.app.id,
			time: new Date("2100-01-01"),
			interval: 0,
			title: "Future",
			body: "Body"
		}
	})
	const { jobs, sendNotification } = tasks()
	await jobs.sendNotifications()
	expect(sendNotification).toHaveBeenCalledTimes(1)
	expect(sendNotification).toHaveBeenCalledWith(
		expect.objectContaining({ endpoint: "https://push.example/one" }),
		expect.stringContaining('"title":"Title"')
	)
	expect(await h.prisma.notification.count()).toBe(1)
})

it.each([404, 410, 503])(
	"handles push status %s without deleting valid subscriptions on transient failure",
	async statusCode => {
		const { subscription, notification } = await pushFixture()
		const { jobs } = tasks(vi.fn().mockRejectedValue({ statusCode }))
		await jobs.sendNotifications()
		const remaining = await s.h.prisma.webPushSubscription.findUnique({
			where: { id: subscription.id }
		})
		if (statusCode === 503) {
			expect(remaining).not.toBeNull()
			expect(
				await s.h.prisma.notification.findUnique({
					where: { id: notification.id }
				})
			).not.toBeNull()
		} else expect(remaining).toBeNull()
	}
)

it("advances repeated notifications by their interval", async () => {
	const { notification } = await pushFixture()
	await s.h.prisma.notification.update({
		where: { id: notification.id },
		data: { interval: 60 }
	})
	await tasks().jobs.sendNotifications()
	expect(
		(
			await s.h.prisma.notification.findUnique({
				where: { id: notification.id }
			})
		).time
	).toEqual(new Date(60000))
})

it("counts activity windows and plans globally and per app at the UTC day boundary", async () => {
	const { h, t } = s
	const now = Date.UTC(2026, 8, 18, 12)
	vi.spyOn(Settings, "now").mockReturnValue(now)
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { lastActive: new Date(now - 3600000), plan: 2 }
	})
	await h.prisma.user.update({
		where: { id: t.other.id },
		data: { lastActive: new Date(now - 86400000), confirmed: false }
	})
	await h.prisma.appUser.create({
		data: {
			userId: t.owner.id,
			appId: t.app.id,
			lastActive: new Date(now - 3600000)
		}
	})
	const { jobs } = tasks()
	await jobs.createUserSnapshots()
	await jobs.createAppUserSnapshots()
	expect(await h.prisma.userSnapshot.findFirst()).toMatchObject({
		dailyActive: 1,
		weeklyActive: 2,
		proPlan: 1,
		freePlan: 1,
		emailConfirmed: 1,
		emailUnconfirmed: 1,
		time: new Date(Date.UTC(2026, 8, 18))
	})
	expect(
		await h.prisma.appUserSnapshot.findFirst({ where: { appId: t.app.id } })
	).toMatchObject({ dailyActive: 1, proPlan: 1 })
	expect(
		await h.prisma.appUserSnapshot.findFirst({
			where: { appId: t.foreignApp.id }
		})
	).toMatchObject({ dailyActive: 0, proPlan: 0 })
})

it("deletes only sessions older than four calendar months, including their subscriptions", async () => {
	const { h, t } = s
	const now = Date.UTC(2026, 8, 18, 12)
	vi.spyOn(Settings, "now").mockReturnValue(now)
	const boundary = DateTime.fromMillis(now).minus({ months: 4 }).toJSDate()
	await h.prisma.session.update({
		where: { id: t.session.id },
		data: { updatedAt: new Date(boundary.getTime() - 1) }
	})
	await h.prisma.session.update({
		where: { id: t.otherSession.id },
		data: { updatedAt: boundary }
	})
	await h.prisma.webPushSubscription.create({
		data: { sessionId: t.session.id }
	})
	await tasks().jobs.deleteSessions()
	expect(
		await h.prisma.session.findUnique({ where: { id: t.session.id } })
	).toBeNull()
	expect(
		await h.prisma.session.findUnique({ where: { id: t.otherSession.id } })
	).not.toBeNull()
	expect(await h.prisma.webPushSubscription.count()).toBe(0)
})

it("supports partial notification updates and rejects another app without changing data", async () => {
	const { h, t } = s
	const created = await h.execute(
		'mutation { createNotification(time: 1000, interval: 60, title: "Title", body: "Body") { uuid } }',
		{},
		t.session.token
	)
	expect(created.errors).toBeUndefined()
	const { uuid } = created.data.createNotification as { uuid: string }
	const query =
		'mutation($uuid: String!) { updateNotification(uuid: $uuid, title: "Updated") { title body interval } }'
	expect(
		(await h.execute(query, { uuid }, t.foreignSession.token)).errors?.[0]
			.extensions.code
	).toBe("ACTION_NOT_ALLOWED")
	const result = await h.execute(query, { uuid }, t.session.token)
	expect(result.errors).toBeUndefined()
	expect(result.data.updateNotification).toEqual({
		title: "Updated",
		body: "Body",
		interval: 60
	})
})
