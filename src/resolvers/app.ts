import { App } from "@prisma/client"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	throwValidationError,
	getSessionFromToken
} from "../utils.js"
import {
	validateNameLength,
	validateDescriptionLength,
	validateWebLink,
	validateGooglePlayLink,
	validateMicrosoftStoreLink
} from "../services/validationService.js"

export async function retrieveApp(
	parent: any,
	args: { id: number },
	context: ResolverContext
): Promise<App> {
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

	// Get the app
	const app = await context.prisma.app.findFirst({
		where: { id: args.id }
	})

	if (app == null) {
		return null
	}

	// Check if the app belongs to the dev of the user
	const dev = await context.prisma.dev.findFirst({
		where: { userId: session.userId }
	})

	if (dev == null || app.devId != dev.id) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	return app
}

export async function listApps(
	parent: any,
	args: {
		published?: boolean
		limit?: number
		offset?: number
	},
	context: ResolverContext
): Promise<List<App>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	let where = {}

	if (args.published != null) {
		where = {
			published: args.published
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.app.count({ where }),
		context.prisma.app.findMany({
			where,
			take,
			skip
		})
	])

	return {
		total,
		items
	}
}

export async function updateApp(
	parent: any,
	args: {
		id: number
		name?: string
		description?: string
		published?: boolean
		webLink?: string
		googlePlayLink?: string
		microsoftStoreLink?: string
	},
	context: ResolverContext
): Promise<App> {
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

	if (
		args.name == null &&
		args.description == null &&
		args.published == null &&
		args.webLink == null &&
		args.googlePlayLink == null &&
		args.microsoftStoreLink == null
	) {
		return null
	}

	// Get the app
	const app = await context.prisma.app.findFirst({
		where: { id: args.id }
	})

	if (app == null) {
		throwApiError(apiErrors.appDoesNotExist)
	}

	// Check if the app belongs to the dev of the user
	const dev = await context.prisma.dev.findFirst({
		where: { userId: session.userId }
	})

	if (dev == null || app.devId != dev.id) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Validate the args
	let errors: string[] = []

	if (args.name != null) {
		errors.push(validateNameLength(args.name))
	}

	if (args.description != null) {
		errors.push(validateDescriptionLength(args.description))
	}

	if (args.webLink != null) {
		errors.push(validateWebLink(args.webLink))
	}

	if (args.googlePlayLink != null) {
		errors.push(validateGooglePlayLink(args.googlePlayLink))
	}

	if (args.microsoftStoreLink != null) {
		errors.push(validateMicrosoftStoreLink(args.microsoftStoreLink))
	}

	throwValidationError(...errors)

	// Update the app
	let data = {}

	if (args.name != null) {
		data["name"] = args.name
	}

	if (args.description != null) {
		data["description"] = args.description
	}

	if (args.published != null) {
		data["published"] = args.published
	}

	if (args.webLink != null) {
		data["webLink"] = args.webLink
	}

	if (args.googlePlayLink != null) {
		data["googlePlayLink"] = args.googlePlayLink
	}

	if (args.microsoftStoreLink != null) {
		data["microsoftStoreLink"] = args.microsoftStoreLink
	}

	return await context.prisma.app.update({
		where: { id: app.id },
		data
	})
}

export function id(app: App, args: any, context: ResolverContext): number {
	return Number(app.id)
}
