import { WebsocketConnection } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken, generateHex } from "../utils.js"

export async function createWebsocketConnection(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<WebsocketConnection> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Create the websocket connection
	return await context.prisma.websocketConnection.create({
		data: {
			userId: session.userId,
			appId: session.appId,
			token: generateHex(10)
		}
	})
}
