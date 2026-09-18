import { PrismaClient, createPrismaClient } from "../../src/prisma.js"
import { createRedisClient } from "../../src/redis.js"
import { createApp } from "../../src/app.js"
import { createTestDependencies } from "./dependencies.js"
import type { AppDependencies } from "../../src/appDependencies.js"
import {
	getTestDatabaseUrl,
	getTestRedisUrl
} from "../../scripts/test-services.mjs"

// Mirrors what $use exposed: the model and operation of a query plus its
// arguments. Throwing from an interceptor fails that query.
export type QueryInterceptor = (operation: {
	model?: string
	operation: string
	args: unknown
}) => void

export async function createIntegrationApp(
	overrides: Partial<AppDependencies> = {}
) {
	// Resolve and validate both URLs before opening either connection.
	const databaseUrl = getTestDatabaseUrl()
	const redisUrl = getTestRedisUrl()
	// Prisma 6 removed $use. A query extension is the supported replacement and,
	// unlike wrapping a delegate method, it also covers queries a $transaction
	// callback issues through its own client.
	const interceptors = new Set<QueryInterceptor>()
	const prisma = createPrismaClient(databaseUrl).$extends({
		query: {
			$allModels: {
				$allOperations({ model, operation, args, query }) {
					for (const intercept of interceptors) {
						intercept({ model, operation, args })
					}
					return query(args)
				}
			}
		}
	}) as unknown as PrismaClient

	// Returns a function that removes the interceptor again.
	function intercept(interceptor: QueryInterceptor) {
		interceptors.add(interceptor)
		return () => interceptors.delete(interceptor)
	}
	const redis = createRedisClient({
		url: redisUrl,
		socket: { reconnectStrategy: false, connectTimeout: 3000 }
	})
	redis.on("error", () => {}) // Command/connect promises still reject.
	const doubles = createTestDependencies()
	const dependencies = { ...doubles.dependencies, ...overrides, prisma, redis }
	let application: Awaited<ReturnType<typeof createApp>>
	try {
		await prisma.$connect()
		await redis.connect()
		application = await createApp(dependencies)
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
			public.tables, public.redis_table_object_operations, public.user_snapshots,
			public.webhook_events, public.webhook_effects
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
					...dependencies,
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
		dependencies,
		intercept,
		execute,
		reset,
		close
	}
}
