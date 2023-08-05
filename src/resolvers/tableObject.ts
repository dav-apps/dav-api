import { TableObject } from "@prisma/client"
import { ResolverContext, List } from "../types.js"

export async function tableObjectsByCollection(
	parent: any,
	args: { collectionName: string; limit?: number; offset?: number },
	context: ResolverContext
): Promise<List<TableObject>> {
	let limit = args.limit || 10
	let offset = args.offset || 0

	let collection = await context.prisma.collection.findFirst({
		where: { name: args.collectionName },
		select: {
			id: true,
			table_object_collections: {
				take: limit,
				skip: offset,
				select: {
					table_object: true
				}
			}
		}
	})

	if (collection == null) {
		return {
			total: 0,
			items: []
		}
	}

	let count = await context.prisma.tableObjectCollection.count({
		where: { collection_id: collection.id }
	})

	return {
		total: count,
		items: collection.table_object_collections.map(toc => toc.table_object)
	}
}

export async function properties(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<{ [key: string]: string | number | boolean }> {
	let properties = await context.prisma.tableObjectProperty.findMany({
		where: {
			table_object_id: tableObject.id
		}
	})

	let result = {}

	for (let property of properties) {
		result[property.name] = property.value
	}

	return result
}
