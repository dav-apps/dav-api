import { afterEach, expect, it, vi } from "vitest"
import nodeCron from "node-cron"
import webPush from "web-push"
import { createTasks, setupTasks } from "../../src/tasks.js"
import { createTestDependencies } from "../helpers/dependencies.js"

afterEach(() => vi.unstubAllEnvs())

it("creates jobs even in production without registering cron or configuring VAPID", () => {
	vi.stubEnv("ENV", "production")
	const schedule = vi.spyOn(nodeCron, "schedule")
	const configure = vi.spyOn(webPush, "setVapidDetails")
	const { dependencies } = createTestDependencies()
	createTasks({ ...dependencies, webPush })
	expect(schedule).not.toHaveBeenCalled()
	expect(configure).not.toHaveBeenCalled()
})

it("runs a job directly using its injected database", async () => {
	const { dependencies } = createTestDependencies()
	const findMany = vi.fn().mockResolvedValue([])
	const tasks = createTasks({
		...dependencies,
		prisma: {
			...dependencies.prisma,
			redisTableObjectOperation: { findMany }
		} as unknown as typeof dependencies.prisma,
		webPush: { sendNotification: vi.fn() }
	})
	await tasks.updateRedisCaches()
	expect(findMany).toHaveBeenCalledOnce()
})

it("registers the existing schedules only explicitly and exposes cleanup", () => {
	const stop = vi.fn()
	const schedule = vi
		.spyOn(nodeCron, "schedule")
		.mockReturnValue({ stop } as unknown as ReturnType<
			typeof nodeCron.schedule
		>)
	const { dependencies } = createTestDependencies()
	const stopTasks = setupTasks({ ...dependencies, webPush })
	expect(schedule.mock.calls.map(([expression]) => expression)).toEqual([
		"0 1 * * *",
		"0 0 0 * * *",
		"0 0 0 * * *",
		"0 3 * * 0",
		"*/10 * * * *"
	])
	stopTasks()
	expect(stop).toHaveBeenCalledTimes(5)
})
