import { UserSnapshot } from "@prisma/client"
import { DateTime } from "luxon"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function listUserSnapshots(
	parent: any,
	args: {
		start?: number
		end?: number
	},
	context: ResolverContext
): Promise<List<UserSnapshot>> {
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

	// Make sure the user is the first dev
	if (session.userId != BigInt(1)) {
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
		time: {
			gte: start.toJSDate(),
			lte: end.toJSDate()
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.userSnapshot.count({ where }),
		context.prisma.userSnapshot.findMany({
			where,
			orderBy: { time: "desc" }
		})
	])

	return {
		total,
		items
	}
}

export function time(userSnapshot: UserSnapshot): string {
	return userSnapshot.time.toISOString()
}
