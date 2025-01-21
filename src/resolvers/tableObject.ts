import { User, TableObject } from "@prisma/client"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	getDevByAuthToken,
	getSessionFromToken
} from "../utils.js"

export async function retrieveTableObject(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<TableObject> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.uuid },
		include: { table: true }
	})

	if (tableObject == null) {
		return null
	}

	// Check if the user can access the table object
	const userAccess = await context.prisma.tableObjectUserAccess.findFirst({
		where: { userId: session.userId, tableObjectId: tableObject.id }
	})
	let tableId = tableObject.tableId

	if (userAccess == null) {
		// Make sure the table object belongs to the user and app
		if (
			tableObject.userId != session.userId ||
			tableObject.table.appId != session.appId
		) {
			throwApiError(apiErrors.actionNotAllowed)
		}
	} else {
		if (userAccess.tableAlias != null) {
			tableId = userAccess.tableAlias
		}

		tableObject.tableId = tableId
	}

	return tableObject
}

export async function listTableObjectsByProperty(
	parent: any,
	args: {
		userId?: number
		appId: number
		tableName?: string
		propertyName: string
		propertyValue: string
		exact?: boolean
		limit?: number
		offset?: number
	},
	context: ResolverContext
): Promise<List<TableObject>> {
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

	// Find the table
	let table = null

	if (args.tableName != null) {
		table = await context.prisma.table.findFirst({
			where: { appId: args.appId, name: args.tableName }
		})
	}

	// Find the user
	let user = null

	if (args.userId != null) {
		user = await context.prisma.user.findFirst({ where: { id: args.userId } })
	}

	let exact = args.exact ?? true

	let where = {
		tableId: table?.id,
		userId: user?.id,
		tableObjectProperties: {
			some: {
				name: args.propertyName,
				value: exact ? args.propertyValue : { contains: args.propertyValue }
			}
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.tableObject.count({ where }),
		context.prisma.tableObject.findMany({ where, take, skip })
	])

	return {
		total,
		items
	}
}

export async function createTableObject(
	parent: any,
	args: {
		uuid?: string
		tableId: number
	},
	context: ResolverContext
): Promise<TableObject> {
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
		where: { id: args.tableId }
	})

	if (table == null) {
		throwApiError(apiErrors.tableDoesNotExist)
	}

	// Check if the table belongs to the app of the session
	if (table.appId != session.appId) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Create the table object
	let uuid = args.uuid

	if (uuid == null) {
		uuid = crypto.randomUUID()
	}

	// Check if the uuid is already taken
	let existingTableObject = await context.prisma.tableObject.findFirst({
		where: { uuid }
	})

	if (existingTableObject != null) {
		throwApiError(apiErrors.uuidAlreadyInUse)
	}

	const tableObject = await context.prisma.tableObject.create({
		data: {
			uuid,
			userId: session.userId,
			tableId: args.tableId
		}
	})

	// TODO: Calculate the etag of the table object
	// TODO: Save the table object in redis
	// TODO: Save that the user was active
	// TODO: Save that the user uses the app
	// TODO: Update the etag of the table
	// TODO: Notify connected clients

	return tableObject
}

export async function user(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<User> {
	return await context.prisma.user.findFirst({
		where: { id: tableObject.userId }
	})
}

export async function properties(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<{ [key: string]: string | number | boolean }> {
	let properties = await context.prisma.tableObjectProperty.findMany({
		where: {
			tableObjectId: tableObject.id
		}
	})

	let result = {}

	for (let property of properties) {
		result[property.name] = property.value
	}

	return result
}
