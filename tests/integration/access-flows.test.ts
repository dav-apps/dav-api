import { expect, it } from "vitest"
import { businessSuite } from "../helpers/business.js"
import { developerToken } from "../helpers/fixtures.js"
const s = businessSuite()

it.each(["website", "app", "wrong-key", "developer"])(
	"exchanges tokens only for an authorized website session: %s",
	async mode => {
		const { h, t } = s
		const website = await t.make.session(t.owner.id, t.website.id)
		const count = await h.prisma.session.count()
		const r = await h.execute(
			`mutation($token: String!, $app: Int!, $key: String!) {
		createSessionFromAccessToken(accessToken: $token, appId: $app, apiKey: $key) { accessToken }
	}`,
			{
				token: mode === "app" ? t.session.token : website.token,
				app: Number(t.app.id),
				key: mode === "wrong-key" ? t.admin.apiKey : t.dev.apiKey
			},
			developerToken(mode === "developer" ? t.dev : t.admin)
		)
		if (mode === "website") {
			expect(r.errors).toBeUndefined()
			const token = (
				r.data.createSessionFromAccessToken as { accessToken: string }
			).accessToken
			expect(
				await h.prisma.session.findUnique({ where: { token } })
			).toMatchObject({ userId: t.owner.id, appId: t.app.id })
		} else {
			expect(r.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
			expect(await h.prisma.session.count()).toBe(count)
		}
	}
)

it("adds an existing object by UUID to a local alias once and revokes the grant", async () => {
	const { h, t } = s
	// Pocketlib deliberately uses a known file UUID as the read capability.
	const object = await t.make.object(t.owner.id, t.table.id)
	const alias = await t.make.table(t.app.id)
	const query = `mutation($uuid: String!, $alias: Int) { createTableObjectUserAccess(tableObjectUuid: $uuid, tableAlias: $alias) { tableAlias } }`
	for (let i = 0; i < 2; i++)
		expect(
			(
				await h.execute(
					query,
					{ uuid: object.uuid, alias: Number(alias.id) },
					t.otherSession.token
				)
			).errors
		).toBeUndefined()
	expect(await h.prisma.tableObjectUserAccess.count()).toBe(1)
	expect(
		await h.prisma.tableEtag.findFirst({
			where: { userId: t.other.id, tableId: alias.id }
		})
	).not.toBeNull()
	expect(
		(
			await h.execute(
				`mutation($uuid: String!) { deleteTableObjectUserAccess(tableObjectUuid: $uuid) { tableAlias } }`,
				{ uuid: object.uuid },
				t.otherSession.token
			)
		).errors
	).toBeUndefined()
	expect(
		(
			await h.execute(
				`query($uuid: String!) { retrieveTableObject(uuid: $uuid) { uuid } }`,
				{ uuid: object.uuid },
				t.otherSession.token
			)
		).errors?.[0].extensions.code
	).toBe("ACTION_NOT_ALLOWED")
})

it("rejects an alias belonging to another app without granting access", async () => {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id)
	const r = await h.execute(
		`mutation($uuid: String!, $alias: Int) { createTableObjectUserAccess(tableObjectUuid: $uuid, tableAlias: $alias) { tableAlias } }`,
		{ uuid: object.uuid, alias: Number(t.foreignTable.id) },
		t.otherSession.token
	)
	expect(r.errors?.[0].extensions.code).toBe("ACTION_NOT_ALLOWED")
	expect(await h.prisma.tableObjectUserAccess.count()).toBe(0)
})
