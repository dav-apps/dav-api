import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { getTestDatabaseUrl, getTestRedisUrl } from "./test-services.mjs"

// Validate both targets before allowing schema changes. Never use DATABASE_URL.
const databaseUrl = getTestDatabaseUrl()
getTestRedisUrl()
const result = spawnSync(
	process.execPath,
	[
		fileURLToPath(
			new URL("../node_modules/prisma/build/index.js", import.meta.url)
		),
		"db",
		"push",
		"--skip-generate",
		"--schema",
		fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url))
	],
	{
		cwd: fileURLToPath(new URL("..", import.meta.url)),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		stdio: "inherit"
	}
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
