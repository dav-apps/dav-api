import { TableObjectUserAccess } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

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

	return tableObjectUserAccess
}
