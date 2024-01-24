import {
	ResolverContext,
	CheckoutSession,
	TableObjectPriceType,
	Currency
} from "../types.js"
import { apiErrors } from "../errors.js"
import { throwApiError, throwValidationError } from "../utils.js"
import {
	validateProductNameLength,
	validateProductImage,
	validateSuccessUrl,
	validateCancelUrl,
	validatePrice
} from "../services/validationService.js"

export async function createCheckoutSession(
	parent: any,
	args: {
		tableObjectUuid: string
		type: TableObjectPriceType
		price?: number
		currency?: Currency
		productName: string
		productImage: string
		successUrl: string
		cancelUrl: string
	},
	context: ResolverContext
): Promise<CheckoutSession> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await context.prisma.session.findFirst({
		where: { token: accessToken },
		include: { user: true }
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.tableObjectUuid },
		include: {
			tableObjectPrices: {
				where: { currency: "EUR", type: args.type }
			}
		}
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	if (args.price == null || args.currency == null) {
		// Check if the table object has a price in the given currency
		if (tableObject.tableObjectPrices.length == 0) {
			throwApiError(apiErrors.tableObjectHasNoPrice)
		}
	}

	// Validate the fields
	throwValidationError(
		validateProductNameLength(args.productName),
		validateProductImage(args.productImage),
		validateSuccessUrl(args.successUrl),
		validateCancelUrl(args.cancelUrl)
	)

	let price = 0
	let currency: Currency = "EUR"

	if (args.price == null || args.currency == null) {
		price = tableObject.tableObjectPrices[0].price
	} else {
		throwValidationError(validatePrice(args.price))

		price = args.price
		currency = args.currency
	}

	// Create order
	const order = await context.prisma.order.create({
		data: {
			user: { connect: { id: session.user.id } },
			tableObject: { connect: { id: tableObject.id } },
			currency,
			price
		}
	})

	if (session.user.stripeCustomerId == null) {
		// Create a stripe customer for the user
		const createCustomerResponse = await context.stripe.customers.create({
			email: session.user.email,
			name: session.user.firstName
		})

		session.user.stripeCustomerId = createCustomerResponse.id

		await context.prisma.user.update({
			where: { id: session.user.id },
			data: { stripeCustomerId: createCustomerResponse.id }
		})
	}

	// Create the Stripe checkout session
	const checkoutSession = await context.stripe.checkout.sessions.create({
		customer: session.user.stripeCustomerId,
		shipping_address_collection: { allowed_countries: ["DE"] },
		phone_number_collection: { enabled: true },
		mode: "payment",
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency,
					unit_amount: price,
					product_data: {
						name: args.productName,
						images: [args.productImage]
					}
				}
			}
		],
		metadata: {
			order: order.uuid
		},
		success_url: args.successUrl,
		cancel_url: args.cancelUrl
	})

	return { url: checkoutSession.url }
}
