import { App } from "@prisma/client"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError } from "../utils.js"

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

export function id(app: App, args: any, context: ResolverContext): number {
	return Number(app.id)
}
