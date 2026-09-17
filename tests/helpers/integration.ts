import { PrismaClient } from "@prisma/client"
import { createClient, RedisClientType } from "redis"
import { createApp } from "../../src/app.js"
import { createTestDependencies } from "./dependencies.js"
import {
	getTestDatabaseUrl,
	getTestRedisUrl
} from "../../scripts/test-services.mjs"

export async function createIntegrationApp() {
	// Resolve and validate both URLs before opening either connection.
	const databaseUrl = getTestDatabaseUrl()
	const redisUrl = getTestRedisUrl()
	const prisma = new PrismaClient({
		datasources: { db: { url: databaseUrl } }
	})
	const redis: RedisClientType = createClient({
		url: redisUrl,
		socket: { reconnectStrategy: false, connectTimeout: 3000 }
	})
	redis.on("error", () => {}) // Command/connect promises still reject.
	const doubles = createTestDependencies()
	let application: Awaited<ReturnType<typeof createApp>>
	try {
		await prisma.$connect()
		await redis.connect()
		application = await createApp({ ...doubles.dependencies, prisma, redis })
	} catch (error) {
		if (redis.isOpen) await redis.disconnect()
		await prisma.$disconnect()
		throw error
	}

	async function reset() {
		// Defence in depth before resetting this dedicated test database.
		const [identity] = await prisma.$queryRaw<
			{ database: string; username: string }[]
		>`
			SELECT current_database() AS database, current_user AS username`
		if (
			identity.database !== "dav_test" ||
			identity.username !== "dav_test"
		) {
			throw new Error("Refusing to reset a non-test database")
		}
		await prisma.$executeRaw`TRUNCATE TABLE public.users, public.devs, public.apps,
			public.tables, public.redis_table_object_operations, public.user_snapshots
			RESTART IDENTITY CASCADE`
		await redis.flushDb()
	}

	async function execute(
		query: string,
		variables: Record<string, unknown> = {},
		authorization?: string
	) {
		const response = await application.server.executeOperation(
			{ query, variables },
			{
				contextValue: {
					...doubles.dependencies,
					prisma,
					redis,
					authorization
				}
			}
		)
		if (response.body.kind !== "single")
			throw new Error("Unexpected incremental GraphQL response")
		return response.body.singleResult
	}

	async function close() {
		try {
			await application.server.stop()
		} finally {
			try {
				if (redis.isOpen) await redis.quit()
			} finally {
				await prisma.$disconnect()
			}
		}
	}
	return {
		...application,
		prisma,
		redis,
		files: doubles.files,
		execute,
		reset,
		close
	}
}
