import { TableObject, Order, ShippingAddress, User } from "@prisma/client"
import {
	throwApiError,
	getDevByAuthToken,
	getSessionFromToken,
	throwValidationError
} from "../utils.js"
import { ResolverContext, OrderStatus, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { validateDhlTrackingCode } from "../services/validationService.js"

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
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	const where = { userId: session.userId }

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
	args: { uuid: string; status?: OrderStatus; dhlTrackingCode?: string },
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

	if (args.status == null && args.dhlTrackingCode == null) {
		return order
	}

	const data: any = {}

	if (args.status != null) {
		data.status = args.status
	}

	// Validate the dhlTrackingCode
	if (args.dhlTrackingCode != null) {
		throwValidationError(validateDhlTrackingCode(args.dhlTrackingCode))
		data.dhlTrackingCode = args.dhlTrackingCode
	}

	return await context.prisma.order.update({
		where: { id: order.id },
		data
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
