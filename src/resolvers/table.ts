import { Table } from "@prisma/client"
import { ResolverContext } from "../types.js"

export function id(table: Table, args: {}, context: ResolverContext): number {
	return Number(table.id)
}
