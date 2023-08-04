import { TableObject, TableObjectProperty } from "@prisma/client"
import { ResolverContext } from "../types.js"

export async function tableObjectsByCollection(
	parent: any,
	args: { collectionName: string; limit?: number; offset?: number },
	context: ResolverContext
): Promise<TableObject[]> {
	let limit = args.limit || 10
	let offset = args.offset || 0

	let collection = await context.prisma.collection.findFirst({
		where: { name: args.collectionName },
		select: {
			table_object_collections: {
				take: limit,
				skip: offset,
				include: {
					table_object: true
				}
			}
		}
	})

	if (collection == null) return []

	return collection.table_object_collections.map(toc => toc.table_object)
}

export async function tableObjectProperties(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<TableObjectProperty[]> {
	return await context.prisma.tableObjectProperty.findMany({
		where: {
			table_object_id: tableObject.id
		}
	})
}
