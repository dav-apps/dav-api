import { TableObject, Order, ShippingAddress, User } from "@prisma/client"
import { throwApiError, getDevByAuthToken } from "../utils.js"
import { ResolverContext, OrderStatus, List } from "../types.js"
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

export async function listOrders(
	parent: any,
	args: { status?: OrderStatus[]; limit?: number; offset?: number },
	context: ResolverContext
): Promise<List<Order>> {
	const accessToken = context.authorization

	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await context.prisma.session.findFirst({
		where: { token: accessToken },
		include: { user: true }
	})

	if (session == null) {
		throwApiError(apiErrors.sessionDoesNotExist)
	}

	const where = { userId: session.user.id }

	if (args.status != null) {
		const or = []

		for (let status of args.status) {
			or.push({ status })
		}

		where["OR"] = or
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.order.count({ where }),
		context.prisma.order.findMany({
			where,
			take,
			skip,
			orderBy: { createdAt: "desc" }
		})
	])

	return {
		total,
		items
	}
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

export async function user(
	order: Order,
	args: any,
	context: ResolverContext
): Promise<User> {
	if (order.userId == null) {
		return null
	}

	return await context.prisma.user.findFirst({
		where: { id: order.userId }
	})
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
