import { User } from "@prisma/client"
import { createId } from "@paralleldrive/cuid2"
import { ResolverContext, CreateUserResult } from "../types.js"
import { apiErrors, validationErrors } from "../errors.js"
import { throwApiError, getDevByAuthToken, generateHex } from "../utils.js"
import {
	validateEmail,
	validateFirstNameLength,
	validatePasswordLength
} from "../services/validationService.js"

export async function createUser(
	parent: any,
	args: {
		email: string
		firstName: string
		password: string
		appId: number
		apiKey: string
		deviceName?: string
		deviceOs?: string
	},
	context: ResolverContext
): Promise<CreateUserResult> {
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

	// Validate the args
	let errors: string[] = []

	errors.push(validateEmail(args.email))

	// Check if the email is already in use
	if (
		(await context.prisma.user.findFirst({ where: { email: args.email } })) !=
		null
	) {
		errors.push(validationErrors.emailAlreadyInUse)
	}

	errors.push(validateFirstNameLength(args.firstName))
	errors.push(validatePasswordLength(args.password))

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

	// Create the user
	const user = await context.prisma.user.create({
		data: {
			email: args.email,
			firstName: args.firstName,
			password: args.password,
			emailConfirmationToken: generateHex(20)
		}
	})

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

	let result: CreateUserResult = {
		user,
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

	// TODO: Send user confirmation email

	return result
}

export function id(user: User, args: any, context: ResolverContext): number {
	return Number(user.id)
}
