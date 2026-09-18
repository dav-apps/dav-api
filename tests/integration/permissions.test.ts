import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { createIntegrationApp } from "../helpers/integration.js"
import { seedTenants } from "../helpers/fixtures.js"

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
	await harness.reset()
})
afterAll(async () => {
	await harness?.close()
})

it("returns only the owner's objects in a table, including nested properties", async () => {
	const { owner, other, table, make, session } = tenants
	const own = await make.object(owner.id, table.id)
	await make.object(other.id, table.id)
	await harness.prisma.tableObjectProperty.create({
		data: { tableObjectId: own.id, name: "title", value: "Mine" }
	})
	const result = await harness.execute(
		`query($name: String!) {
		retrieveTable(name: $name) { tableObjects { total items { uuid properties } } }
	}`,
		{ name: table.name },
		session.token
	)
	expect(result.errors).toBeUndefined()
	expect(result.data.retrieveTable).toEqual({
		tableObjects: {
			total: 1,
			items: [{ uuid: own.uuid, properties: { title: "Mine" } }]
		}
	})
})

it.each(["other-user", "other-app"])("rejects reads by %s", async scenario => {
	const object = await tenants.make.object(tenants.owner.id, tenants.table.id)
	const token =
		scenario === "other-user"
			? tenants.otherSession.token
			: tenants.foreignSession.token
	const result = await harness.execute(
		"query($uuid: String!) { retrieveTableObject(uuid: $uuid) { uuid properties } }",
		{ uuid: object.uuid },
		token
	)
	expect(result.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
})

it.each([
	["update", "other-user"],
	["update", "other-app"],
	["delete", "other-user"],
	["delete", "other-app"]
])(
	"rejects %s by %s without database, cache or file changes",
	async (operation, scenario) => {
		const object = await tenants.make.object(
			tenants.owner.id,
			tenants.table.id,
			{ file: true, etag: "original" }
		)
		await harness.redis.set(`table_object:${object.uuid}`, "original-cache")
		const users = await harness.prisma.user.findMany({
			orderBy: { id: "asc" }
		})
		const token =
			scenario === "other-user"
				? tenants.otherSession.token
				: tenants.foreignSession.token
		const mutation =
			operation === "update"
				? 'updateTableObject(uuid: $uuid, ext: "pdf")'
				: "deleteTableObject(uuid: $uuid)"
		const result = await harness.execute(
			`mutation($uuid: String!) { ${mutation} { uuid } }`,
			{ uuid: object.uuid },
			token
		)
		expect(result.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
		expect(
			await harness.prisma.tableObject.findUnique({
				where: { id: object.id }
			})
		).toEqual(object)
		expect(await harness.prisma.tableObjectProperty.count()).toBe(0)
		expect(await harness.prisma.tableEtag.count()).toBe(0)
		expect(
			await harness.prisma.user.findMany({ orderBy: { id: "asc" } })
		).toEqual(users)
		expect(await harness.redis.get(`table_object:${object.uuid}`)).toBe(
			"original-cache"
		)
		expect(harness.files.remove).not.toHaveBeenCalled()
		expect(harness.files.upload).not.toHaveBeenCalled()
	}
)

it("rejects creation in another app without leaving rows or cache entries", async () => {
	const result = await harness.execute(
		'mutation($table: Int!) { createTableObject(tableId: $table, properties: {title: "Test"}) { uuid } }',
		{ table: Number(tenants.foreignTable.id) },
		tenants.session.token
	)
	expect(result.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
	expect(await harness.prisma.tableObject.count()).toBe(0)
	expect(await harness.prisma.tableObjectProperty.count()).toBe(0)
	expect(await harness.prisma.tableEtag.count()).toBe(0)
	expect(await harness.redis.dbSize()).toBe(0)
})

it("honours an existing read grant and table alias without allowing writes", async () => {
	const object = await tenants.make.object(tenants.owner.id, tenants.table.id)
	const alias = await tenants.make.table(tenants.app.id)
	await harness.prisma.tableObjectUserAccess.create({
		data: {
			userId: tenants.other.id,
			tableObjectId: object.id,
			tableAlias: alias.id
		}
	})
	const result = await harness.execute(
		"query($uuid: String!) { retrieveTableObject(uuid: $uuid) { uuid table { id } } }",
		{ uuid: object.uuid },
		tenants.otherSession.token
	)
	expect(result.errors).toBeUndefined()
	expect(result.data.retrieveTableObject).toEqual({
		uuid: object.uuid,
		table: { id: Number(alias.id) }
	})
	const denied = await harness.execute(
		'mutation($uuid: String!) { updateTableObject(uuid: $uuid, properties: {title: "Changed"}) { uuid } }',
		{ uuid: object.uuid },
		tenants.otherSession.token
	)
	expect(denied.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
	expect(await harness.prisma.tableObjectProperty.count()).toBe(0)
})
