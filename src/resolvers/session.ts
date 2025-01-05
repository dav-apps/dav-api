import bcrypt from "bcrypt"
import { createId } from "@paralleldrive/cuid2"
import { ResolverContext, SessionResult } from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	getDevByAuthToken,
	getSessionFromToken
} from "../utils.js"

export async function createSession(
	parent: any,
	args: {
		email: string
		password: string
		appId: number
		apiKey: string
		deviceName?: string
		deviceOs?: string
	},
	context: ResolverContext
): Promise<SessionResult> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	// Make sure the dev is the first dev
	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Cut the device name and device os if they are too long
	let deviceName = null
	let deviceOs = null

	if (args.deviceName != null) {
		deviceName = args.deviceName

		if (deviceName.length > 30) {
			deviceName = deviceName.substring(0, 30)
		}
	}

	if (args.deviceOs != null) {
		deviceOs = args.deviceOs

		if (deviceOs.length > 30) {
			deviceOs = deviceOs.substring(0, 30)
		}
	}

	// Get the app
	const app = await context.prisma.app.findFirst({
		where: { id: args.appId }
	})

	if (app == null) {
		throwApiError(apiErrors.appDoesNotExist)
	}

	// Check if the app belongs to the dev with the api key
	const appDev = await context.prisma.dev.findFirst({
		where: { apiKey: args.apiKey }
	})

	if (appDev == null) {
		throwApiError(apiErrors.devDoesNotExist)
	}

	if (app.devId != appDev.id) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get and validate the user
	const user = await context.prisma.user.findFirst({
		where: { email: args.email }
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	if (!(await bcrypt.compare(args.password, user.password))) {
		throwApiError(apiErrors.passwordIncorrect)
	}

	// Create the session
	const session = await context.prisma.session.create({
		data: {
			userId: user.id,
			appId: app.id,
			token: createId(),
			deviceName,
			deviceOs
		}
	})

	const websiteAppId = BigInt(process.env.DAV_APPS_APP_ID)

	let result: SessionResult = {
		accessToken: session.token
	}

	if (app.id != websiteAppId) {
		// If the session is for another app than the website, create a session for the website
		const websiteSession = await context.prisma.session.create({
			data: {
				userId: user.id,
				appId: websiteAppId,
				token: createId(),
				deviceName,
				deviceOs
			}
		})

		result.websiteAccessToken = websiteSession.token
	}

	return result
}

export async function createSessionFromAccessToken(
	parent: any,
	args: {
		accessToken: string
		appId: number
		apiKey: string
		deviceName?: string
		deviceOs?: string
	},
	context: ResolverContext
): Promise<SessionResult> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	// Make sure the dev is the first dev
	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Cut the device name and device os if they are too long
	let deviceName = null
	let deviceOs = null

	if (args.deviceName != null) {
		deviceName = args.deviceName

		if (deviceName.length > 30) {
			deviceName = deviceName.substring(0, 30)
		}
	}

	if (args.deviceOs != null) {
		deviceOs = args.deviceOs

		if (deviceOs.length > 30) {
			deviceOs = deviceOs.substring(0, 30)
		}
	}

	// Get the session
	const session = await getSessionFromToken({
		token: args.accessToken,
		prisma: context.prisma
	})

	// Make sure the session is for the website
	if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the app
	const app = await context.prisma.app.findFirst({
		where: { id: args.appId }
	})

	if (app == null) {
		throwApiError(apiErrors.appDoesNotExist)
	}

	// Check if the app belongs to the dev with the api key
	const appDev = await context.prisma.dev.findFirst({
		where: { apiKey: args.apiKey }
	})

	if (appDev == null) {
		throwApiError(apiErrors.devDoesNotExist)
	}

	if (app.devId != appDev.id) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Create the session
	const newSession = await context.prisma.session.create({
		data: {
			userId: session.userId,
			appId: app.id,
			token: createId(),
			deviceName,
			deviceOs
		}
	})

	return {
		accessToken: newSession.token
	}
}

export async function renewSession(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<SessionResult> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	let session = await getSessionFromToken({
		token: accessToken,
		checkRenew: false,
		prisma: context.prisma
	})

	// Move the current token to old_token and generate a new token
	session = await context.prisma.session.update({
		where: { id: session.id },
		data: {
			oldToken: session.token,
			token: createId()
		}
	})

	return {
		accessToken: session.token
	}
}
