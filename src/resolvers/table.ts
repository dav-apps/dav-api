import { Table, TableObject } from "@prisma/client"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function retrieveTable(
	parent: any,
	args: {
		name: string
	},
	context: ResolverContext
): Promise<Table> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table
	const table = await context.prisma.table.findFirst({
		where: {
			name: args.name
		}
	})

	if (table == null) {
		return null
	}

	// Check if the table belongs to the app of the session
	if (table.appId != session.appId) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// TODO: Save that the user was active

	return table
}

export function id(table: Table, args: {}, context: ResolverContext): number {
	return Number(table.id)
}

export async function etag(
	table: Table,
	args: {},
	context: ResolverContext
): Promise<string> {
	const accessToken = context.authorization

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the correct table etag
	let tableEtag = await context.prisma.tableEtag.findFirst({
		where: {
			userId: session.userId,
			tableId: table.id
		}
	})

	return tableEtag?.etag
}

export async function tableObjects(
	table: Table,
	args: {
		limit?: number
		offset?: number
	},
	context: ResolverContext
): Promise<List<TableObject>> {
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

	const where = {
		tableId: table.id,
		userId: session.userId
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.tableObject.count({ where }),
		context.prisma.tableObject.findMany({
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
