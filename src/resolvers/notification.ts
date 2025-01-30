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
	getDevByAuthToken,
	getSessionFromToken
} from "../utils.js"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"

export async function retrieveNotification(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<Notification> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the notification
	const notification = await context.prisma.notification.findFirst({
		where: { uuid: args.uuid }
	})

	if (notification == null) {
		return null
	}

	// Check if the user can access the notification
	if (
		notification.userId != session.userId ||
		notification.appId != session.appId
	) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	return notification
}

export async function createNotification(
	parent: any,
	args: {
		uuid?: string
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
		validateTitleLength(args.title),
		validateBodyLength(args.body),
		validateInterval(args.interval)
	)

	if (args.icon != null) {
		errors.push(validateIcon(args.icon))
	}

	if (args.image != null) {
		errors.push(validateImage(args.image))
	}

	if (args.href != null) {
		errors.push(validateHref(args.href))
	}

	throwValidationError(...errors)

	// Create the notification
	const uuid = args.uuid ?? crypto.randomUUID()

	return await context.prisma.notification.create({
		data: {
			userId: session.userId,
			appId: session.appId,
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

export async function createNotificationForUser(
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
	let errors = []

	if (args.uuid != null) {
		errors.push(validateUuid(args.uuid))
	}

	errors.push(
		validateTitleLength(args.title),
		validateBodyLength(args.body),
		validateInterval(args.interval)
	)

	if (args.icon != null) {
		errors.push(validateIcon(args.icon))
	}

	if (args.image != null) {
		errors.push(validateImage(args.image))
	}

	if (args.href != null) {
		errors.push(validateHref(args.href))
	}

	throwValidationError(...errors)

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

export async function updateNotification(
	parent: any,
	args: {
		uuid: string
		time?: number
		interval?: number
		title?: string
		body?: string
		icon?: string
		image?: string
		href?: string
	},
	context: ResolverContext
): Promise<Notification> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the notification
	const notification = await context.prisma.notification.findFirst({
		where: { uuid: args.uuid }
	})

	if (notification == null) {
		throwApiError(apiErrors.notificationDoesNotExist)
	}

	// Check if the user can access the notification
	if (
		notification.userId != session.userId ||
		notification.appId != session.appId
	) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Validate the args
	let errors = []

	errors.push(
		validateTitleLength(args.title),
		validateBodyLength(args.body),
		validateInterval(args.interval)
	)

	if (args.icon != null) {
		errors.push(validateIcon(args.icon))
	}

	if (args.image != null) {
		errors.push(validateImage(args.image))
	}

	if (args.href != null) {
		errors.push(validateHref(args.href))
	}

	throwValidationError(...errors)

	// Update the notification
	let data = {}

	if (args.time != null) {
		data["time"] = DateTime.fromSeconds(args.time).toUTC().toString()
	}

	if (args.interval != null) {
		data["interval"] = args.interval
	}

	if (args.title != null) {
		data["title"] = args.title
	}

	if (args.body != null) {
		data["body"] = args.body
	}

	if (args.icon != null) {
		data["icon"] = args.icon
	}

	if (args.image != null) {
		data["image"] = args.image
	}

	if (args.href != null) {
		data["href"] = args.href
	}

	return await context.prisma.notification.update({
		where: { uuid: args.uuid },
		data
	})
}

export async function deleteNotification(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<Notification> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the notification
	const notification = await context.prisma.notification.findFirst({
		where: { uuid: args.uuid }
	})

	if (notification == null) {
		throwApiError(apiErrors.notificationDoesNotExist)
	}

	// Check if the user can access the notification
	if (
		notification.userId != session.userId ||
		notification.appId != session.appId
	) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Delete the notification
	return await context.prisma.notification.delete({
		where: { uuid: args.uuid }
	})
}
