import { afterEach, expect, it, vi } from "vitest"
import {
	getTestDatabaseUrl,
	getTestRedisUrl
} from "../../scripts/test-services.mjs"

afterEach(() => vi.unstubAllEnvs())

it("ignores deployment URLs and defaults to isolated local services", () => {
	vi.stubEnv("DATABASE_URL", "postgresql://production/production")
	vi.stubEnv("REDIS_URL", "redis://production/1")
	vi.stubEnv("TEST_DATABASE_URL", undefined)
	vi.stubEnv("TEST_REDIS_URL", undefined)
	expect(getTestDatabaseUrl()).toBe(
		"postgresql://dav_test:dav_test@127.0.0.1:55434/dav_test"
	)
	expect(getTestRedisUrl()).toBe("redis://:dav_test@127.0.0.1:56381/14")
})

it.each([
	"postgresql://dav_test:dav_test@remote/dav_test",
	"postgresql://dav_test:dav_test@127.0.0.1/production",
	"postgresql://postgres:dav_test@127.0.0.1/dav_test",
	"postgresql://dav_test:wrong@127.0.0.1/dav_test",
	"postgresql://dav_test:dav_test@127.0.0.1/dav_test?schema=public",
	"postgresql://dav_test:dav_test@127.0.0.1/dav_test#fragment",
	"https://dav_test:dav_test@localhost/dav_test",
	"not a URL"
])("rejects unsafe database target %s", value =>
	expect(() => getTestDatabaseUrl(value)).toThrow()
)

it.each([
	"redis://:dav_test@remote/14",
	"redis://:dav_test@localhost/0",
	"redis://:dav_test@localhost/3",
	"redis://:dav_test@localhost/15",
	"redis://:wrong@localhost/14",
	"redis://user:dav_test@localhost/14",
	"redis://:dav_test@localhost/14?db=1",
	"redis://:dav_test@localhost/14#fragment",
	"https://:dav_test@localhost/14",
	"not a URL"
])("rejects unsafe Redis target %s", value =>
	expect(() => getTestRedisUrl(value)).toThrow()
)

it("allows explicitly configured local test ports", () => {
	expect(
		getTestDatabaseUrl(
			"postgresql://dav_test:dav_test@localhost:55435/dav_test"
		)
	).toContain(":55435/")
	expect(getTestRedisUrl("redis://:dav_test@[::1]:56382/14")).toContain(
		":56382/"
	)
})
