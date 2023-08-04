import { TableObject } from "@prisma/client"
import { ResolverContext } from "../types.js"

export async function tableObjectsByCollection(
	parent: any,
	args: { collectionName: string; limit?: number; offset?: number },
	context: ResolverContext
): Promise<TableObject[]> {
	let limit = args.limit || 10
	let offset = args.offset || 0

	let collection = await context.prisma.collection.findFirst({
		select: {
			table_object_collections: {
				take: limit,
				skip: offset,
				include: {
					table_object: {
						include: {
							table_object_properties: true
						}
					}
				}
			}
		}
	})

	return collection.table_object_collections.map(toc => toc.table_object)
}
