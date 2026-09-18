const localHosts = ["127.0.0.1", "localhost", "[::1]"]

export function getTestDatabaseUrl(value = process.env.TEST_DATABASE_URL) {
	const url = new URL(
		value ?? "postgresql://dav_test:dav_test@127.0.0.1:55434/dav_test"
	)
	if (
		!["postgresql:", "postgres:"].includes(url.protocol) ||
		!localHosts.includes(url.hostname) ||
		url.username !== "dav_test" ||
		url.password !== "dav_test" ||
		url.pathname !== "/dav_test" ||
		url.search ||
		url.hash
	)
		throw new Error(
			"Tests require a local dav_test database and dav_test credentials, without URL parameters."
		)
	return url.toString()
}

export function getTestRedisUrl(value = process.env.TEST_REDIS_URL) {
	const url = new URL(value ?? "redis://:dav_test@127.0.0.1:56381/14")
	if (
		url.protocol !== "redis:" ||
		!localHosts.includes(url.hostname) ||
		url.username !== "" ||
		url.password !== "dav_test" ||
		url.pathname !== "/14" ||
		url.search ||
		url.hash
	)
		throw new Error(
			"Tests require local Redis database 14 with the dav_test password, without URL parameters."
		)
	return url.toString()
}
