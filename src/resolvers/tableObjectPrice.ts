import { TableObjectPrice } from "@prisma/client"
import {
	throwApiError,
	throwValidationError,
	getDevByAuthToken
} from "../utils.js"
import { ResolverContext } from "../types.js"
import { apiErrors } from "../errors.js"
import { validatePrice } from "../services/validationService.js"

export async function setTableObjectPrice(
	parent: any,
	args: {
		tableObjectUuid: string
		price: number
		currency: string
		type: string
	},
	context: ResolverContext
): Promise<TableObjectPrice> {
	const authToken = context.authorization
	const currency = args.currency.toLowerCase()
	const type = args.type.toLowerCase()

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.tableObjectUuid }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	// Validate the args
	throwValidationError(validatePrice(args.price))

	// Try to find the price of the table object
	let tableObjectPrice = await context.prisma.tableObjectPrice.findFirst({
		where: {
			tableObjectId: tableObject.id,
			currency,
			type
		}
	})

	if (tableObjectPrice == null) {
		// Create a new TableObjectPrice
		tableObjectPrice = await context.prisma.tableObjectPrice.create({
			data: {
				tableObjectId: tableObject.id,
				price: args.price,
				currency,
				type
			}
		})
	} else {
		// Update the existing TableObjectPrice
		tableObjectPrice = await context.prisma.tableObjectPrice.update({
			where: { id: tableObjectPrice.id },
			data: { price: args.price }
		})
	}

	return tableObjectPrice
}
