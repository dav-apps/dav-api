import { Order, ShippingAddress } from "@prisma/client"
import { throwApiError, getDevByAuthToken } from "../utils.js"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"

export async function retrieveOrder(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<Order> {
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

	return await context.prisma.order.findFirst({ where: { uuid: args.uuid } })
}

export async function shippingAddress(
	order: Order,
	args: any,
	context: ResolverContext
): Promise<ShippingAddress> {
	if (order.shippingAddressId == null) {
		return null
	}

	return await context.prisma.shippingAddress.findFirst({
		where: { id: order.shippingAddressId }
	})
}
