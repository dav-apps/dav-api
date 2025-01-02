import { App } from "@prisma/client"
import { ResolverContext, List } from "../types.js"

export async function listApps(
	parent: any,
	args: {
		published?: boolean
		limit?: number
		offset?: number
	},
	context: ResolverContext
): Promise<List<App>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	let where = {}

	if (args.published != null) {
		where = {
			published: args.published
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.app.count({ where }),
		context.prisma.app.findMany({
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

export function id(app: App, args: any, context: ResolverContext): number {
	return Number(app.id)
}
