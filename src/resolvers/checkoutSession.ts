import Stripe from "stripe"
import {
	ResolverContext,
	CheckoutSession,
	TableObjectPriceType,
	Currency,
	Plan
} from "../types.js"
import { apiErrors } from "../errors.js"
import {
	throwApiError,
	throwValidationError,
	getSessionFromToken
} from "../utils.js"
import {
	validateProductNameLength,
	validateProductImage,
	validateSuccessUrl,
	validateCancelUrl,
	validatePrice
} from "../services/validationService.js"

export async function createSubscriptionCheckoutSession(
	parent: any,
	args: {
		plan: Plan
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

	// Validate the plan
	if (args.plan == "FREE") {
		throwApiError(apiErrors.cannotCreateCheckoutSessionForFreePlan)
	}

	// Validate the URLs
	throwValidationError(
		validateSuccessUrl(args.successUrl),
		validateCancelUrl(args.cancelUrl)
	)

	// Check if the user is below the given plan
	const planNumber = args.plan == "PLUS" ? 1 : 2

	if (user.plan >= planNumber) {
		throwApiError(apiErrors.userOnOrBelowGivenPlan)
	}

	if (user.stripeCustomerId == null) {
		// Create a stripe customer for the user
		const createCustomerResponse = await context.stripe.customers.create({
			email: user.email,
			name: user.firstName
		})

		user.stripeCustomerId = createCustomerResponse.id

		await context.prisma.user.update({
			where: { id: user.id },
			data: { stripeCustomerId: createCustomerResponse.id }
		})
	}

	// Create the Stripe checkout session
	let stripePlanId = process.env.STRIPE_DAV_PLUS_EUR_PLAN_ID

	if (args.plan == "PRO") {
		stripePlanId = process.env.STRIPE_DAV_PRO_EUR_PLAN_ID
	}

	const checkoutSession = await context.stripe.checkout.sessions.create({
		customer: user.stripeCustomerId,
		mode: "subscription",
		line_items: [
			{
				price: stripePlanId,
				quantity: 1
			}
		],
		success_url: args.successUrl,
		cancel_url: args.cancelUrl
	})

	return { url: checkoutSession.url }
}

export async function createPaymentCheckoutSession(
	parent: any,
	args: {
		tableObjectUuid: string
		type: TableObjectPriceType
		price?: number
		currency?: Currency
		productName: string
		productImage: string
		shippingRate?: {
			name: string
			price: number
		}
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
			user: { connect: { id: user.id } },
			tableObject: { connect: { id: tableObject.id } },
			currency,
			price
		}
	})

	if (user.stripeCustomerId == null) {
		// Create a stripe customer for the user
		const createCustomerResponse = await context.stripe.customers.create({
			email: user.email,
			name: user.firstName
		})

		user.stripeCustomerId = createCustomerResponse.id

		await context.prisma.user.update({
			where: { id: user.id },
			data: { stripeCustomerId: createCustomerResponse.id }
		})
	}

	// Create the Stripe checkout session
	let sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
		customer: user.stripeCustomerId,
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
		invoice_creation: {
			enabled: true
		},
		customer_update: {
			address: "auto"
		},
		success_url: args.successUrl,
		cancel_url: args.cancelUrl
	}

	if (args.shippingRate != null) {
		sessionCreateParams.shipping_options = [
			{
				shipping_rate_data: {
					display_name: args.shippingRate.name,
					type: "fixed_amount",
					fixed_amount: {
						amount: args.shippingRate.price,
						currency: args.currency
					}
				}
			}
		]
	}

	const checkoutSession =
		await context.stripe.checkout.sessions.create(sessionCreateParams)

	return { url: checkoutSession.url }
}
