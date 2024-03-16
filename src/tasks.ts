import nodeCron from "node-cron"
import webPush from "web-push"
import { DateTime } from "luxon"
import { prisma, redis } from "../server.js"
import { userWasActive, saveTableObjectInRedis } from "./utils.js"

const timezone = "Etc/UTC"

webPush.setVapidDetails(
	"mailto:support@dav-apps.tech",
	process.env.WEBPUSH_PUBLIC_KEY,
	process.env.WEBPUSH_PRIVATE_KEY
)

export async function setupTasks() {
	nodeCron.schedule("0 1 * * *", updateRedisCaches, { timezone })
	nodeCron.schedule("0 0 0 * * *", createUserSnapshots, { timezone })
	nodeCron.schedule("0 0 0 * * *", createAppUserSnapshots, { timezone })
	nodeCron.schedule("0 3 * * 0", deleteSessions, { timezone })
	nodeCron.schedule("*/10 * * * *", sendNotifications, { timezone })
}

async function updateRedisCaches() {
	const operations = await prisma.redisTableObjectOperation.findMany()

	for (let objOperation of operations) {
		if (objOperation.operation == "delete") {
			try {
				// Remove the table object and properties from redis
				await redis.del(`table_object:${objOperation.tableObjectUuid}`)

				let propertyKeys = await redis.keys(
					`table_object_property:*:*:${objOperation.tableObjectUuid}:*`
				)

				for (let key of propertyKeys) {
					await redis.del(key)
				}

				await prisma.redisTableObjectOperation.delete({
					where: { id: objOperation.id }
				})
			} catch (error) {}
		} else {
			let tableObject = await prisma.tableObject.findFirst({
				where: { uuid: objOperation.tableObjectUuid }
			})

			if (tableObject != null) {
				// Update the table object in redis
				await saveTableObjectInRedis(tableObject)
			}

			await prisma.redisTableObjectOperation.delete({
				where: { id: objOperation.id }
			})
		}
	}
}

async function createUserSnapshots() {
	const users = await prisma.user.findMany()

	let dailyActive = 0
	let weeklyActive = 0
	let monthlyActive = 0
	let yearlyActive = 0
	let freePlan = 0
	let plusPlan = 0
	let proPlan = 0
	let emailConfirmed = 0
	let emailUnconfirmed = 0

	for (let user of users) {
		if (userWasActive(user.lastActive, "day")) {
			dailyActive++
		}

		if (userWasActive(user.lastActive, "week")) {
			weeklyActive++
		}

		if (userWasActive(user.lastActive, "month")) {
			monthlyActive++
		}

		if (userWasActive(user.lastActive, "year")) {
			yearlyActive++
		}

		switch (user.plan) {
			case 1:
				plusPlan++
				break
			case 2:
				proPlan++
				break
			default:
				freePlan++
				break
		}

		if (user.confirmed) {
			emailConfirmed++
		} else {
			emailUnconfirmed++
		}
	}

	await prisma.userSnapshot.create({
		data: {
			time: DateTime.now().setZone("utc").startOf("day").toJSDate(),
			dailyActive,
			weeklyActive,
			monthlyActive,
			yearlyActive,
			freePlan,
			plusPlan,
			proPlan,
			emailConfirmed,
			emailUnconfirmed
		}
	})
}

async function createAppUserSnapshots() {
	const apps = await prisma.app.findMany()

	for (let app of apps) {
		const appUsers = await prisma.appUser.findMany({
			where: { appId: app.id },
			include: { user: true }
		})

		let dailyActive = 0
		let weeklyActive = 0
		let monthlyActive = 0
		let yearlyActive = 0
		let freePlan = 0
		let plusPlan = 0
		let proPlan = 0
		let emailConfirmed = 0
		let emailUnconfirmed = 0

		for (let appUser of appUsers) {
			if (userWasActive(appUser.lastActive, "day")) {
				dailyActive++
			}

			if (userWasActive(appUser.lastActive, "week")) {
				weeklyActive++
			}

			if (userWasActive(appUser.lastActive, "month")) {
				monthlyActive++
			}

			if (userWasActive(appUser.lastActive, "year")) {
				yearlyActive++
			}

			switch (appUser.user.plan) {
				case 1:
					plusPlan++
					break
				case 2:
					proPlan++
					break
				default:
					freePlan++
					break
			}

			if (appUser.user.confirmed) {
				emailConfirmed++
			} else {
				emailUnconfirmed++
			}
		}

		await prisma.appUserSnapshot.create({
			data: {
				appId: app.id,
				time: DateTime.now().setZone("utc").startOf("day").toJSDate(),
				dailyActive,
				weeklyActive,
				monthlyActive,
				yearlyActive,
				freePlan,
				plusPlan,
				proPlan,
				emailConfirmed,
				emailUnconfirmed
			}
		})
	}
}

async function deleteSessions() {
	// Delete sessions which were not used in the last 3 months
	let minDate = DateTime.now().minus({ months: 4 }).toJSDate()

	let sessions = await prisma.session.findMany({
		where: { updatedAt: { lt: minDate } }
	})

	for (let session of sessions) {
		await prisma.session.delete({ where: { id: session.id } })
	}
}

async function sendNotifications() {
	const notifications = await prisma.notification.findMany({
		where: { time: { lte: new Date() } },
		include: {
			user: {
				include: { sessions: { include: { webPushSubscriptions: true } } }
			}
		}
	})

	for (let notification of notifications) {
		if (notification.title == null || notification.body == null) {
			await prisma.notification.delete({ where: { id: notification.id } })
			continue
		}

		// Send the notification to all web push subscriptions of the user
		for (let session of notification.user.sessions) {
			if (session.appId != notification.appId) continue

			for (let webPushSubscription of session.webPushSubscriptions) {
				try {
					await webPush.sendNotification(
						{
							endpoint: webPushSubscription.endpoint,
							keys: {
								p256dh: webPushSubscription.p256dh,
								auth: webPushSubscription.auth
							}
						},
						JSON.stringify({
							title: notification.title,
							body: notification.body
						})
					)
				} catch (error) {
					// Delete the web push subscription
					await prisma.webPushSubscription.delete({
						where: { id: webPushSubscription.id }
					})
				}
			}
		}

		if (notification.interval > 0) {
			// Update the notification time
			let newNotificationTime = DateTime.fromJSDate(notification.time)
				.plus({ seconds: notification.interval })
				.toJSDate()

			await prisma.notification.update({
				where: { id: notification.id },
				data: { time: newNotificationTime }
			})
		} else {
			await prisma.notification.delete({ where: { id: notification.id } })
		}
	}
}
