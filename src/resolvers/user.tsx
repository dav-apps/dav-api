import { User, Dev, Provider } from "@prisma/client"
import bcrypt from "bcrypt"
import { createId } from "@paralleldrive/cuid2"
import EmailConfirmationEmail from "../emails/emailConfirmation.js"
import ChangeEmailEmail from "../emails/changeEmail.js"
import ChangePasswordEmail from "../emails/changePassword.js"
import PasswordResetEmail from "../emails/passwordReset.js"
import ResetEmailEmail from "../emails/resetEmail.js"
import { ResolverContext, CreateUserResult } from "../types.js"
import { apiErrors, validationErrors } from "../errors.js"
import {
	noReplyEmailAddress,
	unconfirmedStorage,
	freePlanStorage,
	plusPlanStorage,
	proPlanStorage
} from "../constants.js"
import {
	throwApiError,
	getDevByAuthToken,
	getSessionFromToken,
	throwValidationError,
	updateEmailOfStripeCustomer,
	getWebsiteBaseUrl,
	generateHex
} from "../utils.js"
import {
	validateEmail,
	validateFirstNameLength,
	validatePasswordLength
} from "../services/validationService.js"

export async function retrieveUser(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<User> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	return await context.prisma.user.findFirst({
		where: {
			id: session.userId
		}
	})
}

export async function retrieveUserById(
	parent: any,
	args: {
		id: number
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	return await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})
}

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
			password: await bcrypt.hash(args.password, 10),
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

	// Send user confirmation email
	await context.resend.emails.send({
		from: noReplyEmailAddress,
		to: user.email,
		subject: "Welcome to dav",
		react: (
			<EmailConfirmationEmail
				name={user.firstName}
				link={`${getWebsiteBaseUrl()}/email-link?type=confirmUser&userId=${user.id}&emailConfirmationToken=${user.emailConfirmationToken}`}
			/>
		)
	})

	return result
}

export async function updateUser(
	parent: any,
	args: {
		email?: string
		firstName?: string
		password?: string
	},
	context: ResolverContext
): Promise<User> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Make sure this was called from the website
	if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: session.userId
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	if (args.email == null && args.firstName == null && args.password == null) {
		return user
	}

	// Validate the args
	let errors: string[] = []

	if (args.email != null) {
		errors.push(validateEmail(args.email))

		// Check if the email is already in use
		if (
			(await context.prisma.user.findFirst({
				where: { email: args.email }
			})) != null
		) {
			errors.push(validationErrors.emailAlreadyInUse)
		}
	}

	if (args.firstName != null) {
		errors.push(validateFirstNameLength(args.firstName))
	}

	if (args.password != null) {
		errors.push(validatePasswordLength(args.password))
	}

	throwValidationError(...errors)

	// Update the user
	let data = {}

	if (args.email != null) {
		data["newEmail"] = args.email
		data["emailConfirmationToken"] = generateHex(20)
	}

	if (args.firstName != null) {
		data["firstName"] = args.firstName
	}

	if (args.password != null) {
		data["newPassword"] = await bcrypt.hash(args.password, 10)
		data["passwordConfirmationToken"] = generateHex(20)
	}

	user = await context.prisma.user.update({
		where: {
			id: user.id
		},
		data
	})

	if (args.email != null) {
		// Send change email email
		await context.resend.emails.send({
			from: noReplyEmailAddress,
			to: user.newEmail,
			subject: "Confirm your new email address - dav",
			react: (
				<ChangeEmailEmail
					name={user.firstName}
					link={`${getWebsiteBaseUrl()}/email-link?type=changeEmail&userId=${user.id}&emailConfirmationToken=${user.emailConfirmationToken}`}
				/>
			)
		})
	}

	if (args.password != null) {
		// Send change password email
		await context.resend.emails.send({
			from: noReplyEmailAddress,
			to: user.email,
			subject: "Confirm your new password - dav",
			react: (
				<ChangePasswordEmail
					name={user.firstName}
					link={`${getWebsiteBaseUrl()}/email-link?type=changePassword&userId=${user.id}&passwordConfirmationToken=${user.passwordConfirmationToken}`}
				/>
			)
		})
	}

	return user
}

export async function sendConfirmationEmailForUser(
	parent: any,
	args: {
		id: number
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Generate the email confirmation token
	user = await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			emailConfirmationToken: generateHex(20)
		}
	})

	// Send the confirmation email
	await context.resend.emails.send({
		from: noReplyEmailAddress,
		to: user.email,
		subject: "Confirm your email address - dav",
		react: (
			<EmailConfirmationEmail
				name={user.firstName}
				link={`${getWebsiteBaseUrl()}/email-link?type=confirmUser&userId=${user.id}&emailConfirmationToken=${user.emailConfirmationToken}`}
			/>
		)
	})

	return user
}

export async function sendPasswordResetEmailForUser(
	parent: any,
	args: {
		email: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			email: args.email
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Generate the password confirmation token
	user = await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			passwordConfirmationToken: generateHex(20)
		}
	})

	// Send the password reset email
	await context.resend.emails.send({
		from: noReplyEmailAddress,
		to: user.email,
		subject: "Reset your password - dav",
		react: (
			<PasswordResetEmail
				name={user.firstName}
				link={`${getWebsiteBaseUrl()}/reset-password?userId=${user.id}&passwordConfirmationToken=${user.passwordConfirmationToken}`}
			/>
		)
	})

	return user
}

export async function confirmUser(
	parent: any,
	args: {
		id: number
		emailConfirmationToken: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Check if the user is already confirmed
	if (user.confirmed) {
		throwApiError(apiErrors.userIsAlreadyConfirmed)
	}

	// Check the email confirmation token
	if (user.emailConfirmationToken != args.emailConfirmationToken) {
		throwApiError(apiErrors.emailConfirmationTokenIncorrect)
	}

	// Update the user
	return await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			confirmed: true,
			emailConfirmationToken: null
		}
	})
}

export async function saveNewEmailOfUser(
	parent: any,
	args: {
		id: number
		emailConfirmationToken: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Check if the user has a new email
	if (user.newEmail == null) {
		throwApiError(apiErrors.newEmailOfUserIsEmpty)
	}

	// Check the email confirmation token
	if (user.emailConfirmationToken != args.emailConfirmationToken) {
		throwApiError(apiErrors.emailConfirmationTokenIncorrect)
	}

	// Update the user
	user = await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			oldEmail: user.email,
			email: user.newEmail,
			newEmail: null,
			emailConfirmationToken: generateHex(20)
		}
	})

	await updateEmailOfStripeCustomer(user, context.stripe)

	// Send reset email email
	await context.resend.emails.send({
		from: noReplyEmailAddress,
		to: user.oldEmail,
		subject: "Your email address has changed - dav",
		react: (
			<ResetEmailEmail
				name={user.firstName}
				newEmail={user.email}
				link={`${getWebsiteBaseUrl()}/email-link?type=resetEmail&userId=${user.id}&emailConfirmationToken=${user.emailConfirmationToken}`}
			/>
		)
	})

	return user
}

export async function saveNewPasswordOfUser(
	parent: any,
	args: {
		id: number
		passwordConfirmationToken: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	const user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Check if the user has a new password
	if (user.newPassword == null) {
		throwApiError(apiErrors.newPasswordOfUserIsEmpty)
	}

	// Check the password confirmation token
	if (user.passwordConfirmationToken != args.passwordConfirmationToken) {
		throwApiError(apiErrors.passwordConfirmationTokenIncorrect)
	}

	// Update the user
	return await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			password: user.newPassword,
			newPassword: null,
			passwordConfirmationToken: null
		}
	})
}

export async function resetEmailOfUser(
	parent: any,
	args: {
		id: number
		emailConfirmationToken: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Check if the user has an old email
	if (user.oldEmail == null) {
		throwApiError(apiErrors.oldEmailOfUserIsEmpty)
	}

	// Check the email confirmation token
	if (user.emailConfirmationToken != args.emailConfirmationToken) {
		throwApiError(apiErrors.emailConfirmationTokenIncorrect)
	}

	// Update the user
	user = await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			email: user.oldEmail,
			oldEmail: null,
			emailConfirmationToken: null
		}
	})

	await updateEmailOfStripeCustomer(user, context.stripe)

	return user
}

export async function setPasswordOfUser(
	parent: any,
	args: {
		id: number
		password: string
		passwordConfirmationToken: string
	},
	context: ResolverContext
): Promise<User> {
	const authToken = context.authorization

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the user
	let user = await context.prisma.user.findFirst({
		where: {
			id: args.id
		}
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Validate the password
	throwValidationError(validatePasswordLength(args.password))

	// Check the password confirmation token
	if (user.passwordConfirmationToken != args.passwordConfirmationToken) {
		throwApiError(apiErrors.passwordConfirmationTokenIncorrect)
	}

	// Update the user
	return await context.prisma.user.update({
		where: {
			id: user.id
		},
		data: {
			password: await bcrypt.hash(args.password, 10),
			passwordConfirmationToken: null
		}
	})
}

export function id(user: User, args: {}, context: ResolverContext): number {
	return Number(user.id)
}

export function totalStorage(
	user: User,
	args: {},
	context: ResolverContext
): number {
	if (!user.confirmed) {
		return unconfirmedStorage
	} else if (user.plan == 1) {
		// User is on dav Plus
		return plusPlanStorage
	} else if (user.plan == 2) {
		// User is on dav Pro
		return proPlanStorage
	} else {
		return freePlanStorage
	}
}

export function usedStorage(
	user: User,
	args: {},
	context: ResolverContext
): number {
	return Number(user.usedStorage)
}

export function dev(
	user: User,
	args: {},
	context: ResolverContext
): Promise<Dev> {
	return context.prisma.dev.findFirst({
		where: {
			userId: user.id
		}
	})
}

export function provider(
	user: User,
	args: {},
	context: ResolverContext
): Promise<Provider> {
	return context.prisma.provider.findFirst({
		where: {
			userId: user.id
		}
	})
}
