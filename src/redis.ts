import { createClient } from "redis"

// The bare RedisClientType widens replies such as GET to string | {}, so the
// shared type is derived from an actual createClient call instead.
export type RedisClient = ReturnType<typeof createRedisClient>

export function createRedisClient(options: Parameters<typeof createClient>[0]) {
	return createClient(options)
}
