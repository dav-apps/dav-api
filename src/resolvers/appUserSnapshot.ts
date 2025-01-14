import { AppUserSnapshot } from "@prisma/client"
import { DateTime } from "luxon"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function listAppUserSnapshots(
	parent: any,
	args: {
		appId: number
		start?: number
		end?: number
	},
	context: ResolverContext
): Promise<List<AppUserSnapshot>> {
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
		where: { id: args.appId }
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

	// Find the snapshots
	let start = DateTime.now().minus({ months: 1 })
	let end = DateTime.now()

	if (args.start != null) {
		start = DateTime.fromSeconds(args.start)
	}

	if (args.end != null) {
		end = DateTime.fromSeconds(args.end)
	}

	let where = {
		appId: args.appId,
		time: {
			gte: start.toJSDate(),
			lte: end.toJSDate()
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.appUserSnapshot.count({ where }),
		context.prisma.appUserSnapshot.findMany({
			where,
			orderBy: { time: "desc" }
		})
	])

	return {
		total,
		items
	}
}

export function time(appUserSnapshot: AppUserSnapshot): string {
	return appUserSnapshot.time.toISOString()
}
