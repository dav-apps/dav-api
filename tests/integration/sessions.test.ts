import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	it,
	vi
} from "vitest"
import { Settings } from "luxon"
import { createIntegrationApp } from "../helpers/integration.js"
import {
	seedTenants,
	developerToken,
	fixturePassword
} from "../helpers/fixtures.js"

let harness: Awaited<ReturnType<typeof createIntegrationApp>>
let tenants: Awaited<ReturnType<typeof seedTenants>>
const retrieve = "{ retrieveUser { id email } }"
beforeAll(async () => {
	harness = await createIntegrationApp()
})
beforeEach(async () => {
	await harness.reset()
	tenants = await seedTenants(harness.prisma)
})
afterEach(async () => {
	vi.unstubAllEnvs()
	await harness.reset()
})
afterAll(async () => {
	await harness?.close()
})

it("logs in with a real password hash and creates app and website sessions", async () => {
	const { owner, app, dev, admin, website } = tenants
	const response = await harness.execute(
		`mutation($email: String!, $password: String!, $app: Int!, $key: String!) {
		createSession(email: $email, password: $password, appId: $app, apiKey: $key) { accessToken websiteAccessToken }
	}`,
		{
			email: owner.email.toUpperCase(),
			password: fixturePassword,
			app: Number(app.id),
			key: dev.apiKey
		},
		developerToken(admin)
	)
	expect(response.errors).toBeUndefined()
	const result = response.data.createSession as {
		accessToken: string
		websiteAccessToken: string
	}
	const stored = await harness.prisma.session.findMany({
		where: { token: { in: [result.accessToken, result.websiteAccessToken] } }
	})
	expect(stored.map(s => s.appId).sort()).toEqual([app.id, website.id].sort())
	expect(stored.every(s => s.userId === owner.id)).toBe(true)
	const user = await harness.execute(
		retrieve,
		{},
		`Bearer ${result.accessToken}`
	)
	expect(user.errors).toBeUndefined()
	expect(user.data.retrieveUser).toEqual({
		id: Number(owner.id),
		email: owner.email
	})
})

it.each(["password", "signature", "developer", "app-key"])(
	"rejects invalid login %s without creating sessions",
	async scenario => {
		const { owner, app, dev, admin } = tenants
		const before = await harness.prisma.session.findMany({
			orderBy: { id: "asc" }
		})
		const response = await harness.execute(
			`mutation($email: String!, $password: String!, $app: Int!, $key: String!) {
		createSession(email: $email, password: $password, appId: $app, apiKey: $key) { accessToken }
	}`,
			{
				email: owner.email,
				password: scenario === "password" ? "wrong" : fixturePassword,
				app: Number(app.id),
				key: scenario === "app-key" ? admin.apiKey : dev.apiKey
			},
			scenario === "signature"
				? `${admin.apiKey},invalid`
				: developerToken(scenario === "developer" ? dev : admin)
		)
		expect(response.errors?.[0].extensions.code).toBe(
			{
				password: "PASSWORD_INCORRECT",
				signature: "AUTHENTICATION_FAILED",
				developer: "ACTION_NOT_ALLOWED",
				"app-key": "ACTION_NOT_ALLOWED"
			}[scenario]
		)
		expect(
			await harness.prisma.session.findMany({ orderBy: { id: "asc" } })
		).toEqual(before)
	}
)

it("rotates tokens and revokes the session when the old token is reused", async () => {
	const { session } = tenants
	const response = await harness.execute(
		"mutation { renewSession { accessToken } }",
		{},
		session.token
	)
	expect(response.errors).toBeUndefined()
	const token = (response.data.renewSession as { accessToken: string })
		.accessToken
	expect(token).not.toBe(session.token)
	expect(
		await harness.prisma.session.findUnique({ where: { id: session.id } })
	).toMatchObject({ token, oldToken: session.token })
	expect((await harness.execute(retrieve, {}, token)).errors).toBeUndefined()
	expect(
		(await harness.execute(retrieve, {}, session.token)).errors?.[0]
			.extensions.code
	).toBe("OLD_ACCESS_TOKEN_USED")
	expect(
		await harness.prisma.session.findUnique({ where: { id: session.id } })
	).toBeNull()
	expect(
		(await harness.execute(retrieve, {}, token)).errors?.[0].extensions.code
	).toBe("SESSION_DOES_NOT_EXIST")
})

it.each([
	[-1, false],
	[0, false],
	[1, true]
])(
	"checks production expiry at 24 hours plus %s ms",
	async (delta, expired) => {
		vi.stubEnv("ENV", "production")
		const now = Date.UTC(2026, 8, 18, 12)
		vi.spyOn(Settings, "now").mockReturnValue(now)
		await harness.prisma.session.update({
			where: { id: tenants.session.id },
			data: { updatedAt: new Date(now - 86400000 - delta) }
		})
		const response = await harness.execute(
			retrieve,
			{},
			tenants.session.token
		)
		if (expired)
			expect(response.errors?.[0].extensions.code).toBe("SESSION_EXPIRED")
		else expect(response.errors).toBeUndefined()
	}
)

it("allows renewal of an expired session and logout invalidates it", async () => {
	vi.stubEnv("ENV", "production")
	await harness.prisma.session.update({
		where: { id: tenants.session.id },
		data: { updatedAt: new Date(0) }
	})
	const response = await harness.execute(
		"mutation { renewSession { accessToken } }",
		{},
		tenants.session.token
	)
	expect(response.errors).toBeUndefined()
	const token = (response.data.renewSession as { accessToken: string })
		.accessToken
	expect(
		(
			await harness.execute(
				"mutation { deleteSession { accessToken } }",
				{},
				token
			)
		).errors
	).toBeUndefined()
	expect(
		await harness.prisma.session.findUnique({
			where: { id: tenants.session.id }
		})
	).toBeNull()
})
