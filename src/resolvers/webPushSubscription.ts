import { WebPushSubscription } from "@prisma/client"
import {
	validateUuid,
	validateEndpointLength,
	validateP256dhLength,
	validateAuthLength
} from "../services/validationService.js"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	getSessionFromToken,
	throwValidationError
} from "../utils.js"

export async function retrieveWebPushSubscription(
	parent: any,
	args: {
		uuid: string
	},
	context: ResolverContext
): Promise<WebPushSubscription> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the web push subscription
	const webPushSubscription =
		await context.prisma.webPushSubscription.findFirst({
			where: { uuid: args.uuid }
		})

	if (webPushSubscription == null) {
		return null
	}

	// Check if the web push subscription belongs to the session
	if (webPushSubscription.sessionId != session.id) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	return webPushSubscription
}

export async function createWebPushSubscription(
	parent: any,
	args: {
		uuid?: string
		endpoint: string
		p256dh: string
		auth: string
	},
	context: ResolverContext
): Promise<WebPushSubscription> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Validate the args
	let errors = []

	if (args.uuid != null) {
		errors.push(validateUuid(args.uuid))
	}

	errors.push(
		validateEndpointLength(args.endpoint),
		validateP256dhLength(args.p256dh),
		validateAuthLength(args.auth)
	)

	throwValidationError(...errors)

	// Create the web push subscription
	const uuid = args.uuid ?? crypto.randomUUID()

	// Check if the uuid is already taken
	let existingWebPushSubscription =
		await context.prisma.webPushSubscription.findFirst({
			where: { uuid }
		})

	if (existingWebPushSubscription != null) {
		throwApiError(apiErrors.uuidAlreadyInUse)
	}

	return await context.prisma.webPushSubscription.create({
		data: {
			uuid,
			sessionId: session.id,
			endpoint: args.endpoint,
			p256dh: args.p256dh,
			auth: args.auth
		}
	})
}
