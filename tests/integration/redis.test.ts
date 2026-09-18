import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	it,
	vi
} from "vitest"
import { createIntegrationApp } from "../helpers/integration.js"
import { seedTenants } from "../helpers/fixtures.js"
import { saveTableObjectInRedis } from "../../src/utils.js"
import { createTasks } from "../../src/tasks.js"

let harness: Awaited<ReturnType<typeof createIntegrationApp>>
let tenants: Awaited<ReturnType<typeof seedTenants>>
beforeAll(async () => {
	harness = await createIntegrationApp()
})
beforeEach(async () => {
	await harness.reset()
	tenants = await seedTenants(harness.prisma)
})
afterEach(async () => {
	if (!harness.redis.isOpen) await harness.redis.connect()
	await harness.reset()
})
afterAll(async () => {
	await harness?.close()
})

it("keeps GraphQL writes, typed Redis properties and ETags consistent across create, update and delete", async () => {
	const created = await harness.execute(
		`mutation($table: Int!) {
		createTableObject(tableId: $table, properties: {title: "First", active: true, count: 3}) { uuid etag }
	}`,
		{ table: Number(tenants.table.id) },
		tenants.session.token
	)
	expect(created.errors).toBeUndefined()
	const { uuid, etag } = created.data.createTableObject as {
		uuid: string
		etag: string
	}
	const stored = await harness.prisma.tableObject.findUnique({
		where: { uuid }
	})
	expect(etag).toBe(stored.etag)
	const cached = JSON.parse(
		String(await harness.redis.get(`table_object:${uuid}`))
	)
	expect(cached).toMatchObject({
		id: String(stored.id),
		etag: stored.etag,
		properties: { title: "First", active: true, count: 3 }
	})
	const prefix = `table_object_property:${tenants.owner.id}:${tenants.table.id}:${uuid}`
	expect(await harness.redis.get(`${prefix}:active:1`)).toBe("true")
	expect(await harness.redis.get(`${prefix}:count:2`)).toBe("3")
	expect(await harness.prisma.redisTableObjectOperation.count()).toBe(0)
	const updated = await harness.execute(
		`mutation($uuid: String!) {
		updateTableObject(uuid: $uuid, properties: {title: "Second", active: false, count: null}) { uuid etag }
	}`,
		{ uuid },
		tenants.session.token
	)
	expect(updated.errors).toBeUndefined()
	expect(await harness.redis.get(`${prefix}:title:0`)).toBe("Second")
	expect(await harness.redis.get(`${prefix}:active:1`)).toBe("false")
	expect(await harness.redis.get(`${prefix}:count:2`)).toBeNull()
	const changed = await harness.prisma.tableObject.findUnique({
		where: { uuid }
	})
	expect(changed.etag).not.toBe(etag)
	expect(updated.data.updateTableObject).toEqual({ uuid, etag: changed.etag })
	expect(
		JSON.parse(String(await harness.redis.get(`table_object:${uuid}`))).etag
	).toBe(changed.etag)
	const deleted = await harness.execute(
		"mutation($uuid: String!) { deleteTableObject(uuid: $uuid) { uuid } }",
		{ uuid },
		tenants.session.token
	)
	expect(deleted.errors).toBeUndefined()
	expect(await harness.prisma.tableObject.count()).toBe(0)
	expect(await harness.prisma.tableObjectProperty.count()).toBe(0)
	expect(await harness.redis.dbSize()).toBe(0)
})

it("persists failed Redis writes and replays them after reconnecting", async () => {
	const object = await tenants.make.object(
		tenants.owner.id,
		tenants.table.id,
		{ etag: "etag" }
	)
	await harness.prisma.tableObjectProperty.create({
		data: { tableObjectId: object.id, name: "title", value: "Retry" }
	})
	await harness.redis.quit()
	await saveTableObjectInRedis(harness.prisma, harness.redis, object)
	expect(await harness.prisma.redisTableObjectOperation.findMany()).toEqual([
		expect.objectContaining({
			tableObjectUuid: object.uuid,
			operation: "save"
		})
	])
	await harness.redis.connect()
	await createTasks({
		prisma: harness.prisma,
		redis: harness.redis,
		webPush: { sendNotification: vi.fn() }
	}).updateRedisCaches()
	expect(
		JSON.parse(String(await harness.redis.get(`table_object:${object.uuid}`)))
	).toMatchObject({ etag: "etag", properties: { title: "Retry" } })
	expect(await harness.prisma.redisTableObjectOperation.count()).toBe(0)
})
