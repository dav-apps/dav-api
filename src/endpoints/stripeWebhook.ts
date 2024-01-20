import { Express, Request, Response, raw } from "express"
import cors from "cors"
import Stripe from "stripe"
import { prisma, stripe } from "../../server.js"

const endpointSecret = process.env.STRIPE_WEBHOOKS_SECRET

async function stripeWebhook(req: Request, res: Response) {
	let event = req.body

	if (endpointSecret) {
		// Get the signature sent by Stripe
		const signature = req.headers["stripe-signature"]

		try {
			event = stripe.webhooks.constructEvent(
				req.body,
				signature,
				endpointSecret
			)
		} catch (error) {
			console.log(`⚠️ Webhook signature verification failed.`, error.message)
			return res.sendStatus(400)
		}
	}

	// Handle the event
	if (event.type == "payment_intent.succeeded") {
		const paymentIntent = event.data.object as Stripe.PaymentIntent

		// Get the order id from the payment intent
		const orderUuid = paymentIntent.metadata.order

		if (orderUuid != null) {
			// Find the order & update it
			const order = await prisma.order.findFirst({
				where: { uuid: orderUuid }
			})

			if (order.shippingAddressId == null) {
				// Try to find an existing shipping address with these values
				let shippingAddress = await prisma.shippingAddress.findFirst({
					where: {
						userId: order.userId,
						name: paymentIntent.shipping.name,
						city: paymentIntent.shipping.address.city,
						country: paymentIntent.shipping.address.country,
						line1: paymentIntent.shipping.address.line1,
						line2: paymentIntent.shipping.address.line2,
						postalCode: paymentIntent.shipping.address.postal_code,
						state: paymentIntent.shipping.address.state
					}
				})

				if (shippingAddress == null) {
					// Create a new shipping address
					shippingAddress = await prisma.shippingAddress.create({
						data: {
							user: { connect: { id: order.userId } },
							name: paymentIntent.shipping.name,
							city: paymentIntent.shipping.address.city,
							country: paymentIntent.shipping.address.country,
							line1: paymentIntent.shipping.address.line1,
							line2: paymentIntent.shipping.address.line2,
							postalCode: paymentIntent.shipping.address.postal_code,
							state: paymentIntent.shipping.address.state
						}
					})
				}

				// Update the order with the shipping address
				await prisma.order.update({
					where: { id: order.id },
					data: {
						shippingAddress: { connect: { id: shippingAddress.id } }
					}
				})
			}

			// Update the order with the payment_intent_id
			await prisma.order.update({
				where: { id: order.id },
				data: {
					paymentIntentId: paymentIntent.id,
					completed: true
				}
			})
		}
	}

	res.send()
}

export function setup(app: Express) {
	app.post(
		"/webhooks/stripe",
		raw({ type: "application/json" }),
		cors(),
		stripeWebhook
	)
}
