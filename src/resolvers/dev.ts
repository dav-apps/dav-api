import { Dev, App } from "@prisma/client"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function retrieveDev(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<Dev> {
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

	// Return the dev of the user
	return await context.prisma.dev.findFirst({
		where: { userId: session.userId }
	})
}

export function id(dev: Dev): number {
	return Number(dev.id)
}

export async function apps(
	dev: Dev,
	args: {},
	context: ResolverContext
): Promise<List<App>> {
	const where = {
		devId: dev.id
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.app.count({ where }),
		context.prisma.app.findMany({
			where,
			orderBy: { createdAt: "desc" }
		})
	])

	return {
		total,
		items
	}
}
