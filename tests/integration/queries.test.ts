import { expect, it } from "vitest"
import { businessSuite } from "../helpers/business.js"
import { developerToken } from "../helpers/fixtures.js"
const s = businessSuite()

it("scopes property searches to the requested app even without a table name", async () => {
	const { h, t } = s
	const own = await t.make.object(t.owner.id, t.table.id)
	const foreign = await t.make.object(t.owner.id, t.foreignTable.id)
	await h.prisma.tableObjectProperty.createMany({
		data: [own, foreign].map(o => ({
			tableObjectId: o.id,
			name: "title",
			value: "Book one"
		}))
	})
	const q = `query($app: Int!, $table: String, $user: Int, $exact: Boolean, $value: String!) {
		listTableObjectsByProperty(appId: $app, tableName: $table, userId: $user, propertyName: "title", propertyValue: $value, exact: $exact) { total items { uuid } }
	}`
	for (const exact of [true, false]) {
		const r = await h.execute(
			q,
			{ app: Number(t.app.id), exact, value: exact ? "Book one" : "Book" },
			developerToken(t.admin)
		)
		expect(r.errors).toBeUndefined()
		expect(r.data.listTableObjectsByProperty).toEqual({
			total: 1,
			items: [{ uuid: own.uuid }]
		})
	}
	for (const filter of [{ table: "missing" }, { user: 99999 }]) {
		const r = await h.execute(
			q,
			{ app: Number(t.app.id), value: "Book one", ...filter },
			developerToken(t.admin)
		)
		expect(r.errors).toBeUndefined()
		expect(r.data.listTableObjectsByProperty).toEqual({ total: 0, items: [] })
	}
	expect(
		(
			await h.execute(
				q,
				{ app: Number(t.app.id), value: "Book one" },
				developerToken(t.dev)
			)
		).errors?.[0].extensions.code
	).toBe("ACTION_NOT_ALLOWED")
})

it("finds a same-named table in the session's app", async () => {
	const { h, t } = s
	await h.prisma.table.updateMany({ data: { name: "SharedName" } })
	const r = await h.execute(
		'{ retrieveTable(name: "SharedName") { id } }',
		{},
		t.foreignSession.token
	)
	expect(r.errors).toBeUndefined()
	expect(r.data.retrieveTable).toEqual({ id: Number(t.foreignTable.id) })
})

it("paginates and filters orders while keeping foreign users out", async () => {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id)
	for (let i = 0; i < 3; i++)
		await h.prisma.order.create({
			data: {
				userId: t.owner.id,
				tableObjectId: object.id,
				status: "SHIPPED",
				createdAt: new Date(1000 * i)
			}
		})
	await h.prisma.order.create({
		data: { userId: t.owner.id, tableObjectId: object.id, status: "CREATED" }
	})
	await h.prisma.order.create({
		data: { userId: t.other.id, tableObjectId: object.id, status: "SHIPPED" }
	})
	const r = await h.execute(
		"{ listOrders(status: [SHIPPED], limit: 1, offset: 1) { total items { uuid status user { id } } } }",
		{},
		t.session.token
	)
	expect(r.errors).toBeUndefined()
	expect(r.data.listOrders).toMatchObject({
		total: 3,
		items: [{ status: "SHIPPED", user: { id: Number(t.owner.id) } }]
	})
	const orders = await h.prisma.order.findMany({
		where: { userId: t.owner.id, status: "SHIPPED" },
		orderBy: { createdAt: "desc" }
	})
	expect((r.data.listOrders as any).items[0].uuid).toBe(orders[1].uuid)
})

it("limits shipping address queries to the requested user and privileged developer", async () => {
	const { h, t } = s
	await h.prisma.shippingAddress.createMany({
		data: [
			{ userId: t.owner.id, uuid: "one", city: "Berlin" },
			{ userId: t.other.id, uuid: "two", city: "Paris" }
		]
	})
	const q =
		"query($id: Int!) { listShippingAddresses(userId: $id, limit: 1) { total items { uuid city } } }"
	const vars = { id: Number(t.owner.id) }
	expect(
		(await h.execute(q, vars, developerToken(t.admin))).data
			.listShippingAddresses
	).toEqual({ total: 1, items: [{ uuid: "one", city: "Berlin" }] })
	expect(
		(await h.execute(q, vars, developerToken(t.dev))).errors?.[0].extensions
			.code
	).toBe("ACTION_NOT_ALLOWED")
})

it("filters app listings and applies offset without changing the total", async () => {
	const { h, t } = s
	await h.prisma.app.updateMany({
		where: { id: { in: [t.app.id, t.foreignApp.id] } },
		data: { published: true }
	})
	const r = await h.execute(
		"{ listApps(published: true, limit: 1, offset: 1) { total items { published } } }"
	)
	expect(r.errors).toBeUndefined()
	expect(r.data.listApps).toEqual({ total: 2, items: [{ published: true }] })
})

it("restricts global statistics to the website administrator and app statistics to the app developer", async () => {
	const { h, t } = s
	const adminWebsite = await t.make.session(t.owner.id, t.website.id)
	const devWebsite = await t.make.session(t.other.id, t.website.id)
	await h.prisma.userSnapshot.create({
		data: { time: new Date(100000), dailyActive: 3 }
	})
	await h.prisma.userSnapshot.create({
		data: { time: new Date(300000), dailyActive: 4 }
	})
	const q =
		"{ listUserSnapshots(start: 50, end: 200) { total items { dailyActive } } }"
	expect(
		(await h.execute(q, {}, adminWebsite.token)).data.listUserSnapshots
	).toEqual({ total: 1, items: [{ dailyActive: 3 }] })
	for (const token of [t.session.token, devWebsite.token])
		expect((await h.execute(q, {}, token)).errors?.[0].extensions.code).toBe(
			"ACTION_NOT_ALLOWED"
		)
	await h.prisma.appUserSnapshot.create({
		data: { appId: t.app.id, time: new Date(100000), dailyActive: 2 }
	})
	const aq =
		"query($app: Int!) { listAppUserSnapshots(appId: $app, start: 50, end: 200) { total items { dailyActive } } }"
	expect(
		(await h.execute(aq, { app: Number(t.app.id) }, devWebsite.token)).data
			.listAppUserSnapshots
	).toEqual({ total: 1, items: [{ dailyActive: 2 }] })
	expect(
		(await h.execute(aq, { app: Number(t.app.id) }, adminWebsite.token))
			.errors?.[0].extensions.code
	).toBe("ACTION_NOT_ALLOWED")
})
