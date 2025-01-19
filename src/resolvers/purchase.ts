import { Purchase } from "@prisma/client"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, getSessionFromToken } from "../utils.js"

export async function createPurchase(
	parent: any,
	args: {
		tableObjectUuid: string
	},
	context: ResolverContext
): Promise<Purchase> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	const user = await context.prisma.user.findFirst({
		where: { id: session.userId }
	})

	if (user == null) {
		throwApiError(apiErrors.userDoesNotExist)
	}

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.tableObjectUuid }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	// Check if the table object has a price and is free
	const tableObjectPrice = await context.prisma.tableObjectPrice.findFirst({
		where: { tableObjectId: tableObject.id }
	})

	if (tableObjectPrice == null || tableObjectPrice.price > 0) {
		throwApiError(apiErrors.tableObjectIsNotFree)
	}

	// Create the purchase
	return await context.prisma.purchase.create({
		data: {
			uuid: crypto.randomUUID(),
			price: 0,
			completed: true,
			userId: user.id,
			tableObjectPurchases: {
				create: {
					tableObjectId: tableObject.id
				}
			}
		}
	})
}
