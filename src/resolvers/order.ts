import { TableObject, Order, ShippingAddress } from "@prisma/client"
import { throwApiError, getDevByAuthToken } from "../utils.js"
import { ResolverContext, OrderStatus } from "../types.js"
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

export async function updateOrder(
	parent: any,
	args: { uuid: string; status?: OrderStatus },
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

	// Try to get the order
	const order = await context.prisma.order.findFirst({
		where: { uuid: args.uuid }
	})

	if (order == null) {
		throwApiError(apiErrors.orderDoesNotExist)
	}

	if (args.status == null) return order

	return await context.prisma.order.update({
		where: { uuid: order.uuid },
		data: { status: args.status }
	})
}

export function userId(order: Order): number {
	if (order == null) return null

	return Number(order.userId)
}

export async function tableObject(
	order: Order,
	args: any,
	context: ResolverContext
): Promise<TableObject> {
	if (order.tableObjectId == null) {
		return null
	}

	return await context.prisma.tableObject.findFirst({
		where: { id: order.tableObjectId }
	})
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
