import { ResolverContext, CustomerPortalSession } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function createCustomerPortalSession(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<CustomerPortalSession> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	const user = await context.prisma.user.findFirst({
		where: { id: session.userId }
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Make sure this was called from the website
	if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	if (user.stripeCustomerId == null) {
		// Create a stripe customer for the user
		const createCustomerResponse = await context.stripe.customers.create({
			email: user.email,
			name: user.firstName
		})

		user.stripeCustomerId = createCustomerResponse.id

		await context.prisma.user.update({
			where: { id: user.id },
			data: { stripeCustomerId: createCustomerResponse.id }
		})
	}

	// Create the customer portal session
	const portalSession = await context.stripe.billingPortal.sessions.create({
		customer: user.stripeCustomerId
	})

	return {
		url: portalSession.url
	}
}
