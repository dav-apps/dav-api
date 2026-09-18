import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { createServer } from "node:net"
import Stripe from "stripe"
import request from "supertest"
import { createIntegrationApp } from "../helpers/integration.js"
import { seedTenants } from "../helpers/fixtures.js"
import {
	getTestDatabaseUrl,
	getTestRedisUrl
} from "../../scripts/test-services.mjs"

const root = fileURLToPath(new URL("../../", import.meta.url))
let h: Awaited<ReturnType<typeof createIntegrationApp>>
let t: Awaited<ReturnType<typeof seedTenants>>
type Exit = { code: number | null; signal: string | null }
interface ServerProcess {
	child: ChildProcess
	exited: Promise<Exit>
	readonly output: string
	readonly finished: boolean
	ready(): Promise<string>
	waitForExit(): Promise<Exit>
}
const children: ServerProcess[] = []

function launch(overrides: Record<string, string> = {}): ServerProcess {
	const child = spawn(
		process.execPath,
		["--import", "./tests/system/network-guard.mjs", "dist/server.js"],
		{
			cwd: root,
			// Deliberate allowlist: never inherit credentials, NODE_OPTIONS or production ENV.
			env: {
				PATH: process.env.PATH,
				ENV: "test",
				NODE_ENV: "test",
				HOST: "127.0.0.1",
				PORT: "0",
				DATABASE_URL: getTestDatabaseUrl(),
				REDIS_URL: getTestRedisUrl(),
				DAV_APPS_APP_ID: "1",
				STRIPE_SECRET_KEY: "sk_test_placeholder",
				STRIPE_WEBHOOKS_SECRET: "whsec_test",
				RESEND_API_KEY: "re_test_placeholder",
				SPACES_ACCESS_KEY: "test",
				SPACES_SECRET_KEY: "test",
				...overrides
			},
			stdio: ["ignore", "pipe", "pipe"]
		}
	)
	let output = ""
	let finished = false
	const exited = new Promise<{ code: number | null; signal: string | null }>(
		resolve => {
			child.once("error", error => {
				output += String(error)
			})
			child.once("close", (code, signal) => {
				finished = true
				resolve({ code, signal })
			})
		}
	)
	child.stdout.on("data", data => {
		output += data.toString()
	})
	child.stderr.on("data", data => {
		output += data.toString()
	})
	const running = {
		child,
		exited,
		get output() {
			return output
		},
		get finished() {
			return finished
		},
		async ready() {
			const deadline = Date.now() + 15000
			while (Date.now() < deadline && !finished) {
				const match = output.match(
					/Server ready at http:\/\/localhost:(\d+)\//
				)
				if (match) return `http://127.0.0.1:${match[1]}`
				await delay(25)
			}
			throw new Error(`Server failed to become ready:\n${output}`)
		},
		async waitForExit() {
			let timer: ReturnType<typeof setTimeout>
			try {
				return await Promise.race([
					exited,
					new Promise<never>((_, reject) => {
						timer = setTimeout(
							() => reject(new Error(`Server did not exit:\n${output}`)),
							12000
						)
					})
				])
			} finally {
				clearTimeout(timer)
			}
		}
	}
	children.push(running)
	return running
}

beforeAll(async () => {
	h = await createIntegrationApp()
})
beforeEach(async () => {
	await h.reset()
	t = await seedTenants(h.prisma)
})
afterEach(async () => {
	for (const running of children.splice(0)) {
		if (!running.finished) running.child.kill("SIGTERM")
		try {
			await running.waitForExit()
		} finally {
			if (!running.finished) {
				running.child.kill("SIGKILL")
				await running.exited
			}
		}
	}
	await h.reset()
})
afterAll(async () => {
	await h?.close()
})

it("serves the compiled API with real PostgreSQL/Redis, raw routes and authentication", async () => {
	const running = launch()
	const url = await running.ready()
	const anonymous = await request(url)
		.post("/")
		.send({ query: "{ retrieveUser { id } }" })
		.expect(200)
	expect(anonymous.body.errors[0].extensions.code).toBe("NOT_AUTHENTICATED")
	const created = await request(url)
		.post("/")
		.set("Authorization", `Bearer ${t.session.token}`)
		.send({
			query: `mutation($table: Int!) { createTableObject(tableId: $table, properties: {title: "Smoke"}) { uuid etag } }`,
			variables: { table: Number(t.table.id) }
		})
		.expect(200)
	expect(created.body.errors).toBeUndefined()
	const { uuid, etag } = created.body.data.createTableObject
	expect(
		await h.prisma.tableObject.findUnique({ where: { uuid } })
	).toMatchObject({ etag, userId: t.owner.id })
	expect(JSON.parse(await h.redis.get(`table_object:${uuid}`))).toMatchObject({
		etag,
		properties: { title: "Smoke" }
	})
	await request(url)
		.put("/user/profileImage")
		.set("Content-Type", "image/png")
		.send(Buffer.from("invalid"))
		.expect(401)
	const payload =
		'{ "id": "evt_smoke", "type": "unhandled.event", "data": { "object": {} } }'
	const stripe = new Stripe("sk_test_placeholder")
	await request(url)
		.post("/webhooks/stripe")
		.set("Content-Type", "application/json")
		.set(
			"stripe-signature",
			stripe.webhooks.generateTestHeaderString({
				payload,
				secret: "whsec_test"
			})
		)
		.send(payload)
		.expect(200)
	await request(url)
		.post("/webhooks/stripe")
		.set("Content-Type", "application/json")
		.set("stripe-signature", "invalid")
		.send(payload)
		.expect(400)
})

it.each(["SIGTERM", "SIGINT"] as const)(
	"closes the compiled server cleanly on %s",
	async signal => {
		const running = launch()
		const url = await running.ready()
		await request(url)
			.post("/")
			.send({ query: "{ listApps { total } }" })
			.expect(200)
		running.child.kill(signal)
		expect(await running.waitForExit(), running.output).toEqual({
			code: 0,
			signal: null
		})
		await expect(
			fetch(url, { signal: AbortSignal.timeout(1000) })
		).rejects.toThrow()
	}
)

it("exits with an error and releases clients when its port is occupied", async () => {
	const occupied = createServer()
	await new Promise<void>(resolve => occupied.listen(0, "127.0.0.1", resolve))
	try {
		const address = occupied.address()
		if (typeof address !== "object" || !address)
			throw new Error("No test port")
		const running = launch({ PORT: String(address.port) })
		expect(await running.waitForExit(), running.output).toEqual({
			code: 1,
			signal: null
		})
		expect(running.output).toContain("EADDRINUSE")
		expect(running.output).not.toContain("Server ready")
	} finally {
		await new Promise<void>((resolve, reject) =>
			occupied.close(error => (error ? reject(error) : resolve()))
		)
	}
})

it("rejects an invalid port before opening clients", async () => {
	const running = launch({ PORT: "invalid" })
	expect(await running.waitForExit(), running.output).toEqual({
		code: 1,
		signal: null
	})
	expect(running.output).toContain("PORT must be an integer")
})
