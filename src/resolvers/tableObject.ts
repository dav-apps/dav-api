import { TableObject } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError } from "../utils.js"

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
	const session = await context.prisma.session.findFirst({
		where: { token: accessToken }
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.uuid },
		include: { table: true }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
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
