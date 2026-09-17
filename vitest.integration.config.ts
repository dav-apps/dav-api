import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/integration/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		fileParallelism: false,
		restoreMocks: true,
		hookTimeout: 15000,
		testTimeout: 10000
	}
})
