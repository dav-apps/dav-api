import { Dev } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError } from "../utils.js"

export async function retrieveDev(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<Dev> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await context.prisma.session.findFirst({
		where: { token: accessToken }
	})

	if (session == null) {
		throwApiError(apiErrors.sessionDoesNotExist)
	}

	// Make sure this was called from the website
	if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Return the dev of the user
	return await context.prisma.dev.findFirst({
		where: { userId: session.userId }
	})
}
