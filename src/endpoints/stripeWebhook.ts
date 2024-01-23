import { Express, Request, Response, raw } from "express"
import cors from "cors"
import axios from "axios"
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
	if (event.type == "checkout.session.completed") {
		const checkoutSession = event.data.object as Stripe.Checkout.Session
		if (checkoutSession.payment_status == "unpaid") return res.send()

		// Get the order id from the payment intent
		const orderUuid = checkoutSession.metadata.order

		if (orderUuid != null) {
			// Find the order & update it
			let order = await prisma.order.findFirst({
				where: { uuid: orderUuid }
			})

			if (order.shippingAddressId == null) {
				// Try to find an existing shipping address with these values
				let shippingAddress = await prisma.shippingAddress.findFirst({
					where: {
						userId: order.userId,
						name: checkoutSession.customer_details.name,
						email: checkoutSession.customer_details.email,
						phone: checkoutSession.customer_details.phone,
						city: checkoutSession.customer_details.address.city,
						country: checkoutSession.customer_details.address.country,
						line1: checkoutSession.customer_details.address.line1,
						line2: checkoutSession.customer_details.address.line2,
						postalCode:
							checkoutSession.customer_details.address.postal_code,
						state: checkoutSession.customer_details.address.state
					}
				})

				if (shippingAddress == null) {
					// Create a new shipping address
					shippingAddress = await prisma.shippingAddress.create({
						data: {
							user: { connect: { id: order.userId } },
							name: checkoutSession.customer_details.name,
							email: checkoutSession.customer_details.email,
							phone: checkoutSession.customer_details.phone,
							city: checkoutSession.customer_details.address.city,
							country: checkoutSession.customer_details.address.country,
							line1: checkoutSession.customer_details.address.line1,
							line2: checkoutSession.customer_details.address.line2,
							postalCode:
								checkoutSession.customer_details.address.postal_code,
							state: checkoutSession.customer_details.address.state
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
			order = await prisma.order.update({
				where: { id: order.id },
				data: {
					paymentIntentId: checkoutSession.payment_intent as string,
					status: "PREPARATION"
				}
			})

			// Notify the client
			let tableObject = await prisma.tableObject.findFirst({
				where: { id: order.tableObjectId },
				include: { table: { include: { app: true } } }
			})

			const webhookUrl = tableObject?.table?.app?.webhookUrl

			if (webhookUrl != null) {
				try {
					await axios({
						method: "post",
						url: webhookUrl,
						headers: {
							"Content-Type": "application/json",
							Authorization: process.env.WEBHOOK_KEY
						},
						data: {
							type: "order.completed",
							uuid: order.uuid
						}
					})
				} catch (error) {
					console.error(error)
				}
			}
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
