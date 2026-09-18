import { afterEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import Stripe from "stripe"
import { createApp } from "../../src/app.js"
import { apiErrors } from "../../src/errors.js"
import { createTestDependencies } from "../helpers/dependencies.js"

const applications: Awaited<ReturnType<typeof createApp>>[] = []
async function start(dependencies = createTestDependencies().dependencies) {
	const application = await createApp(dependencies)
	applications.push(application)
	return application
}
afterEach(async () => {
	await Promise.all(applications.splice(0).map(({ server }) => server.stop()))
})

describe("application factory", () => {
	it("creates a working schema without listening or managing injected clients", async () => {
		const { dependencies, prisma, redis } = createTestDependencies()
		const { server, httpServer } = await start(dependencies)
		expect(httpServer.listening).toBe(false)
		const result = await server.executeOperation({ query: "{ __typename }" })
		expect(result.body.kind).toBe("single")
		if (result.body.kind !== "single")
			throw new Error("Unexpected incremental response")
		expect(result.body.singleResult.errors).toBeUndefined()
		expect(result.body.singleResult.data).toEqual({ __typename: "Query" })
		await server.stop()
		expect(prisma.$connect).not.toHaveBeenCalled()
		expect(redis.connect).not.toHaveBeenCalled()
		expect(prisma.$disconnect).not.toHaveBeenCalled()
		expect(redis.quit).not.toHaveBeenCalled()
	})

	it("passes HTTP authorization to the real resolvers and isolates app dependencies", async () => {
		const first = createTestDependencies()
		const second = createTestDependencies()
		first.prisma.session.findFirst.mockResolvedValue({ userId: 11n })
		second.prisma.session.findFirst.mockResolvedValue({ userId: 22n })
		first.prisma.user.findFirst.mockResolvedValue({
			id: 11n,
			firstName: "First"
		})
		second.prisma.user.findFirst.mockResolvedValue({
			id: 22n,
			firstName: "Second"
		})
		const a = await start(first.dependencies)
		const b = await start(second.dependencies)
		for (const [app, token, id, name] of [
			[a.app, "first-token", 11, "First"],
			[b.app, "second-token", 22, "Second"],
			[a.app, "first-token", 11, "First"]
		] as const) {
			const response = await request(app)
				.post("/")
				.set("Authorization", `Bearer ${token}`)
				.send({ query: "{ retrieveUser { id firstName } }" })
				.expect(200)
			expect(response.body).toEqual({
				data: { retrieveUser: { id, firstName: name } }
			})
		}
		expect(first.prisma.session.findFirst).toHaveBeenCalledWith({
			where: { token: "first-token" }
		})
		expect(second.prisma.session.findFirst).toHaveBeenCalledWith({
			where: { token: "second-token" }
		})
	})

	it("keeps GraphQL authentication errors and never queries the database for anonymous requests", async () => {
		const { dependencies, prisma } = createTestDependencies()
		const { app } = await start(dependencies)
		const response = await request(app)
			.post("/")
			.send({ query: "{ retrieveUser { id } }" })
			.expect(200)
		expect(response.body.errors[0].extensions.code).toBe(
			apiErrors.notAuthenticated.code
		)
		expect(prisma.session.findFirst).not.toHaveBeenCalled()
	})

	it("uses the injected file service for nested GraphQL fields", async () => {
		const { dependencies, prisma, files } = createTestDependencies()
		prisma.session.findFirst.mockResolvedValue({ userId: 1n, appId: 1n })
		prisma.tableObject.findFirst.mockResolvedValue({
			uuid: "object-1",
			userId: 1n,
			table: { appId: 1n }
		})
		prisma.tableObjectUserAccess.findFirst.mockResolvedValue(null)
		files.getFileUrl.mockResolvedValue("https://files.example/test")
		const { app } = await start(dependencies)
		const response = await request(app)
			.post("/")
			.set("Authorization", "Bearer token")
			.send({
				query: '{ retrieveTableObject(uuid: "object-1") { fileUrl } }'
			})
			.expect(200)
		expect(response.body).toEqual({
			data: {
				retrieveTableObject: { fileUrl: "https://files.example/test" }
			}
		})
		expect(files.getFileUrl).toHaveBeenCalledWith("object-1")
	})

	it.each(["/user/profileImage", "/tableObject/test/file"])(
		"registers the raw upload route %s with injected authentication",
		async path => {
			const { dependencies, prisma, files } = createTestDependencies()
			prisma.session.findFirst.mockResolvedValue(null)
			vi.spyOn(console, "error").mockImplementation(() => {})
			const { app } = await start(dependencies)
			const response = await request(app)
				.put(path)
				.set("Authorization", "Bearer invalid")
				.set("Content-Type", "image/png")
				.send(Buffer.from("test"))
				.expect(apiErrors.sessionDoesNotExist.status)
			expect(response.body.code).toBe(apiErrors.sessionDoesNotExist.code)
			expect(prisma.session.findFirst).toHaveBeenCalledWith({
				where: { token: "invalid" }
			})
			expect(files.upload).not.toHaveBeenCalled()
		}
	)

	it("preserves raw webhook bytes and keeps signing secrets local to each app", async () => {
		const first = createTestDependencies()
		const second = createTestDependencies()
		const stripe = new Stripe("sk_test_placeholder")
		first.dependencies.stripe = stripe
		second.dependencies.stripe = stripe
		second.dependencies.stripeWebhookSecret = "whsec_other"
		const a = await start(first.dependencies)
		const b = await start(second.dependencies)
		const payload =
			'{ "id": "evt_test", "type": "unhandled.event", "data": { "object": {} } }'
		const signature = stripe.webhooks.generateTestHeaderString({
			payload,
			secret: "whsec_test"
		})
		vi.spyOn(console, "log").mockImplementation(() => {})
		await request(a.app)
			.post("/webhooks/stripe")
			.set("Content-Type", "application/json")
			.set("stripe-signature", signature)
			.send(payload)
			.expect(200)
		await request(b.app)
			.post("/webhooks/stripe")
			.set("Content-Type", "application/json")
			.set("stripe-signature", signature)
			.send(payload)
			.expect(400)
	})
})
