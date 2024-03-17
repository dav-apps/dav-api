import { Notification } from "@prisma/client"
import * as crypto from "crypto"
import { DateTime } from "luxon"
import {
	validateUuid,
	validateTitleLength,
	validateBodyLength,
	validateInterval,
	validateIcon,
	validateImage,
	validateHref
} from "../services/validationService.js"
import {
	throwApiError,
	throwValidationError,
	getDevByAuthToken
} from "../utils.js"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"

export async function createNotification(
	parent: any,
	args: {
		uuid?: string
		userId: number
		appId: number
		time: number
		interval: number
		title: string
		body: string
		icon?: string
		image?: string
		href?: string
	},
	context: ResolverContext
): Promise<Notification> {
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
		where: { id: args.userId }
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Get the app
	const app = await context.prisma.app.findFirst({
		where: { id: args.appId }
	})

	// Validate the args
	let validations = []

	if (args.uuid != null) {
		validations.push(validateUuid(args.uuid))
	}

	validations.push(
		validateTitleLength(args.title),
		validateBodyLength(args.body),
		validateInterval(args.interval)
	)

	if (args.icon != null) {
		validations.push(validateIcon(args.icon))
	}

	if (args.image != null) {
		validations.push(validateImage(args.image))
	}

	if (args.href != null) {
		validations.push(validateHref(args.href))
	}

	throwValidationError(...validations)

	// Create the notification
	const uuid = args.uuid ?? crypto.randomUUID()

	return await context.prisma.notification.create({
		data: {
			userId: user.id,
			appId: app.id,
			uuid,
			time: DateTime.fromSeconds(args.time).toUTC().toString(),
			interval: args.interval,
			title: args.title,
			body: args.body,
			icon: args.icon,
			image: args.image,
			href: args.href
		}
	})
}
