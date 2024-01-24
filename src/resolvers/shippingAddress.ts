import { ShippingAddress } from "@prisma/client"
import { throwApiError, getDevByAuthToken } from "../utils.js"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"

export async function listShippingAddresses(
	parent: any,
	args: { userId: number; limit?: number; offset?: number },
	context: ResolverContext
): Promise<List<ShippingAddress>> {
	const authToken = context.authorization

	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

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

	const where = { userId: user.id }

	const [total, items] = await context.prisma.$transaction([
		context.prisma.shippingAddress.count({ where }),
		context.prisma.shippingAddress.findMany({
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
