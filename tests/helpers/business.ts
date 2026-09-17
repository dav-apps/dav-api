import { beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import Stripe from "stripe"
import { createIntegrationApp } from "./integration.js"
import { seedTenants } from "./fixtures.js"

export function businessSuite() {
	let h: Awaited<ReturnType<typeof createIntegrationApp>>
	let t: Awaited<ReturnType<typeof seedTenants>>
	const stripe = new Stripe("sk_test_placeholder")
	beforeAll(async () => {
		h = await createIntegrationApp({ stripe })
	})
	beforeEach(async () => {
		vi.clearAllMocks()
		await h.reset()
		t = await seedTenants(h.prisma)
		vi.mocked(h.dependencies.resend.emails.send).mockResolvedValue({
			data: { id: "email_test" },
			error: null
		})
	})
	afterEach(async () => {
		vi.unstubAllEnvs()
		await h.reset()
	})
	afterAll(async () => {
		await h?.close()
	})
	return {
		get h() {
			return h
		},
		get t() {
			return t
		},
		stripe
	}
}
