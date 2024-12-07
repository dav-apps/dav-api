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
	switch (event.type) {
		case "checkout.session.completed":
			const checkoutSession = event.data.object as Stripe.Checkout.Session
			if (checkoutSession.payment_status == "unpaid") break

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
								country:
									checkoutSession.customer_details.address.country,
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

			break
		case "invoice.payment_succeeded":
			let invoice = event.data.object as Stripe.Invoice
			if (invoice.lines.data.length == 0) break

			let productId = invoice.lines.data[0].plan?.product as string
			if (productId == null) break

			let periodEnd = invoice.lines.data[0].period?.end
			if (periodEnd == null) break

			let user = await prisma.user.findFirst({
				where: {
					stripeCustomerId: invoice.customer as string
				}
			})

			if (user == null) break

			// Update plan, period_end and subscription_status of the user
			let plan = 1

			if (productId == process.env.STRIPE_DAV_PRO_PRODUCT_ID) {
				plan = 2
			}

			await prisma.user.update({
				where: { id: user.id },
				data: {
					periodEnd: new Date(periodEnd * 1000),
					subscriptionStatus: 0,
					plan
				}
			})

			break
		case "invoice.payment_failed":
			invoice = event.data.object as Stripe.Invoice
			if (invoice.paid) break

			user = await prisma.user.findFirst({
				where: {
					stripeCustomerId: invoice.customer as string
				}
			})

			if (user == null) break

			if (invoice.next_payment_attempt == null) {
				// Downgrade the user to the free plan
				await prisma.user.update({
					where: { id: user.id },
					data: {
						plan: 0,
						subscriptionStatus: 0,
						periodEnd: null
					}
				})

				// TODO: Send payment failed email
			} else if (invoice.attempt_count == 2) {
				// TODO: Send payment attempt failed email
			}

			break
		case "payment_intent.succeeded":
			let paymentIntent = event.data.object as Stripe.PaymentIntent

			// Find the purchase with the payment intent
			let purchase = await prisma.purchase.findFirst({
				where: {
					paymentIntentId: paymentIntent.id
				}
			})

			if (purchase == null || purchase.completed) break

			await prisma.purchase.update({
				where: { id: purchase.id },
				data: { completed: true }
			})

			// TODO: Notify client APIs of the completed purchase

			break
		case "customer.subscription.created":
			let subscription = event.data.object as Stripe.Subscription
			if (subscription.items.data.length == 0) break

			productId = subscription.items.data[0].plan?.product as string
			if (productId == null) break

			periodEnd = subscription.current_period_end
			if (periodEnd == null) break

			user = await prisma.user.findFirst({
				where: {
					stripeCustomerId: subscription.customer as string
				}
			})

			if (user == null) break

			// Update plan, period_end and subscription_status of the user
			plan = 1

			if (productId == process.env.STRIPE_DAV_PRO_PRODUCT_ID) {
				plan = 2
			}

			await prisma.user.update({
				where: { id: user.id },
				data: {
					periodEnd: new Date(periodEnd * 1000),
					subscriptionStatus: 0,
					plan
				}
			})

			break
		case "customer.subscription.updated":
			subscription = event.data.object as Stripe.Subscription
			if (subscription.items.data.length == 0) break

			periodEnd = subscription.current_period_end
			if (periodEnd == null) break

			user = await prisma.user.findFirst({
				where: {
					stripeCustomerId: subscription.customer as string
				}
			})

			if (user == null) break

			if (subscription.status == "active") {
				// Update plan, period_end and subscription_status of the user
				let plan = 1

				if (productId == process.env.STRIPE_DAV_PRO_PRODUCT_ID) {
					plan = 2
				}

				await prisma.user.update({
					where: { id: user.id },
					data: {
						periodEnd: new Date(periodEnd * 1000),
						subscriptionStatus: subscription.cancel_at_period_end ? 1 : 0,
						plan
					}
				})
			} else if (subscription.status == "incomplete_expired") {
				// Immediately cancel the subscription
				await prisma.user.update({
					where: { id: user.id },
					data: {
						plan: 0,
						subscriptionStatus: 0,
						periodEnd: null
					}
				})
			}

			break
		case "customer.subscription.deleted":
			subscription = event.data.object as Stripe.Subscription
			if (subscription.items.data.length == 0) break

			user = await prisma.user.findFirst({
				where: {
					stripeCustomerId: subscription.customer as string
				}
			})

			if (user == null) break

			// Downgrade the user to the free plan
			await prisma.user.update({
				where: { id: user.id },
				data: {
					plan: 0,
					subscriptionStatus: 0,
					periodEnd: null
				}
			})

			break
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
