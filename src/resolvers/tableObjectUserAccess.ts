import { TableObjectUserAccess } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	getSessionFromToken,
	updateTableEtag
} from "../utils.js"

export async function createTableObjectUserAccess(
	parent: any,
	args: {
		tableObjectUuid: string
		tableAlias?: number
	},
	context: ResolverContext
): Promise<TableObjectUserAccess> {
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
		where: {
			uuid: args.tableObjectUuid
		},
		include: { table: true }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	let table = tableObject.table

	if (args.tableAlias != null) {
		// Get the table
		const table = await context.prisma.table.findFirst({
			where: {
				id: args.tableAlias
			}
		})

		if (table == null) {
			throwApiError(apiErrors.tableDoesNotExist)
		}
	}

	// Check if the table object user access already exists
	let tableObjectUserAccess =
		await context.prisma.tableObjectUserAccess.findFirst({
			where: {
				tableObjectId: tableObject.id,
				userId: session.userId
			}
		})

	if (tableObjectUserAccess == null) {
		// Create the table object user access
		tableObjectUserAccess = await context.prisma.tableObjectUserAccess.create(
			{
				data: {
					tableObjectId: tableObject.id,
					userId: session.userId,
					tableAlias: table.id
				}
			}
		)
	}

	// Save that the user was active
	await context.prisma.user.update({
		where: { id: session.userId },
		data: {
			lastActive: new Date()
		}
	})

	// Update the etag of the table
	await updateTableEtag(
		context.prisma,
		tableObject.userId,
		tableObject.tableId
	)

	return tableObjectUserAccess
}

export async function deleteTableObjectUserAccess(
	parent: any,
	args: {
		tableObjectUuid: string
	},
	context: ResolverContext
): Promise<TableObjectUserAccess> {
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
		where: {
			uuid: args.tableObjectUuid
		},
		include: { table: true }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	if (tableObject.table.appId != session.appId) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Check if the table object user access exists
	const tableObjectUserAccess =
		await context.prisma.tableObjectUserAccess.findFirst({
			where: {
				tableObjectId: tableObject.id,
				userId: session.userId
			}
		})

	if (tableObjectUserAccess == null) {
		throwApiError(apiErrors.tableObjectUserAccessDoesNotExist)
	}

	// Delete the table object user access
	await context.prisma.tableObjectUserAccess.delete({
		where: {
			id: tableObjectUserAccess.id
		}
	})

	// Save that the user was active
	await context.prisma.user.update({
		where: { id: session.userId },
		data: {
			lastActive: new Date()
		}
	})

	// Update the etag of the table
	await updateTableEtag(
		context.prisma,
		tableObject.userId,
		tableObject.tableId
	)

	return tableObjectUserAccess
}

export function tableAlias(
	tableObjectUserAccess: TableObjectUserAccess
): number {
	return Number(tableObjectUserAccess.tableAlias)
}
