import { Table } from "@prisma/client"
import { ResolverContext } from "../types.js"
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
