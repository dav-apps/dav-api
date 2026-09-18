import { vi } from "vitest"
import type { AppDependencies } from "../../src/appDependencies.js"

// Partial doubles are cast only here. Every unconfigured operation fails loudly.
export function createTestDependencies() {
	const unexpected = async (..._args: any[]): Promise<any> => {
		throw new Error("Unexpected external operation")
	}
	const prisma = {
		$connect: vi.fn(unexpected),
		$disconnect: vi.fn(unexpected),
		session: { findFirst: vi.fn(unexpected) },
		user: { findFirst: vi.fn(unexpected) },
		tableObject: { findFirst: vi.fn(unexpected) },
		tableObjectUserAccess: { findFirst: vi.fn(unexpected) }
	}
	const redis = { connect: vi.fn(unexpected), quit: vi.fn(unexpected) }
	const files = {
		check: vi.fn(unexpected),
		upload: vi.fn(unexpected),
		remove: vi.fn(unexpected),
		getFileUrl: vi.fn(unexpected)
	}
	const dependencies: AppDependencies = {
		prisma: prisma as unknown as AppDependencies["prisma"],
		redis: redis as unknown as AppDependencies["redis"],
		stripe: {} as AppDependencies["stripe"],
		resend: {
			emails: { send: vi.fn(unexpected) }
		} as unknown as AppDependencies["resend"],
		files,
		webhookHttp: { request: vi.fn(unexpected) },
		stripeWebhookSecret: "whsec_test"
	}
	return { dependencies, prisma, redis, files }
}
