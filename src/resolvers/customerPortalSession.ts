import { ResolverContext, CustomerPortalSession } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError } from "../utils.js"

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
	const session = await context.prisma.session.findFirst({
		where: { token: accessToken },
		include: { user: true }
	})

	if (session == null) {
		throwApiError(apiErrors.sessionDoesNotExist)
	}

	// Make sure this was called from the website
	if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	if (session.user.stripeCustomerId == null) {
		// Create a stripe customer for the user
		const createCustomerResponse = await context.stripe.customers.create({
			email: session.user.email,
			name: session.user.firstName
		})

		session.user.stripeCustomerId = createCustomerResponse.id

		await context.prisma.user.update({
			where: { id: session.user.id },
			data: { stripeCustomerId: createCustomerResponse.id }
		})
	}

	// Create the customer portal session
	const portalSession = await context.stripe.billingPortal.sessions.create({
		customer: session.user.stripeCustomerId
	})

	return {
		url: portalSession.url
	}
}
