import { Express, Request, Response, raw } from "express"
import cors from "cors"
import axios from "axios"
import Stripe from "stripe"
import { prisma, stripe, resend } from "../../server.js"
import PaymentAttemptFailedEmail from "../emails/paymentAttemptFailed.js"
import PaymentFailedEmail from "../emails/paymentFailed.js"
import { noReplyEmailAddress } from "../constants.js"

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
	let status = 200

	switch (event.type) {
		case "checkout.session.completed":
			status = await handleCheckoutSessionCompletedEvent(event)
			break
		case "invoice.payment_succeeded":
			status = await handleInvoicePaymentSucceededEvent(event)
			break
		case "invoice.payment_failed":
			status = await handleInvoicePaymentFailedEvent(event)
			break
		case "payment_intent.succeeded":
			status = await handlePaymentIntentSucceededEvent(event)
			break
		case "customer.subscription.created":
			status = await handleCustomerSubscriptionCreatedEvent(event)
			break
		case "customer.subscription.updated":
			status = await handleCustomerSubscriptionUpdatedEvent(event)
			break
		case "customer.subscription.deleted":
			status = await handleCustomerSubscriptionDeletedEvent(event)
			break
	}

	res.status(status).send()
}

async function handleCheckoutSessionCompletedEvent(
	event: any
): Promise<number> {
	const checkoutSession = event.data.object as Stripe.Checkout.Session
	if (checkoutSession.payment_status == "unpaid") return 500

	// Get the order id from the payment intent
	const orderUuid = checkoutSession.metadata.order

	if (orderUuid != null) {
		// Find the order & update it
		let order = await prisma.order.findFirst({
			where: { uuid: orderUuid }
		})

		if (order.shippingAddressId == null) {
			const name = checkoutSession.shipping_details.name
			const email = checkoutSession.customer_details.email
			const phone = checkoutSession.customer_details.phone
			const city = checkoutSession.shipping_details.address?.city
			const country = checkoutSession.shipping_details.address?.country
			const line1 = checkoutSession.shipping_details.address?.line1
			const line2 = checkoutSession.shipping_details.address?.line2
			const postalCode =
				checkoutSession.shipping_details.address?.postal_code
			const state = checkoutSession.shipping_details.address?.state

			// Try to find an existing shipping address with these values
			let shippingAddress = await prisma.shippingAddress.findFirst({
				where: {
					userId: order.userId,
					name,
					email,
					phone,
					city,
					country,
					line1,
					line2,
					postalCode,
					state
				}
			})

			if (shippingAddress == null) {
				// Create a new shipping address
				shippingAddress = await prisma.shippingAddress.create({
					data: {
						user: { connect: { id: order.userId } },
						name,
						email,
						phone,
						city,
						country,
						line1,
						line2,
						postalCode,
						state
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
				return 500
			}
		}
	}

	return 200
}

async function handleInvoicePaymentSucceededEvent(event: any): Promise<number> {
	const invoice = event.data.object as Stripe.Invoice

	if (invoice.billing_reason == "manual") return 200 // Ignore one-time payments
	if (invoice.lines.data.length == 0) return 500

	const productId = invoice.lines.data[0].plan?.product as string
	if (productId == null) return 500

	const periodEnd = invoice.lines.data[0].period?.end
	if (periodEnd == null) return 500

	const user = await prisma.user.findFirst({
		where: {
			stripeCustomerId: invoice.customer as string
		}
	})

	if (user == null) return 500

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

	return 200
}

async function handleInvoicePaymentFailedEvent(event: any): Promise<number> {
	const invoice = event.data.object as Stripe.Invoice
	if (invoice.paid) return 500

	const user = await prisma.user.findFirst({
		where: {
			stripeCustomerId: invoice.customer as string
		}
	})

	if (user == null) return 500

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

		// Send payment failed email
		resend.emails.send({
			from: noReplyEmailAddress,
			to: user.email,
			subject: "Subscription renewal failed - dav",
			react: <PaymentFailedEmail name={user.firstName} />
		})
	} else if (invoice.attempt_count == 2) {
		// Send payment attempt failed email
		resend.emails.send({
			from: noReplyEmailAddress,
			to: user.email,
			subject: "Subscription renewal failed - dav",
			react: (
				<PaymentAttemptFailedEmail name={user.firstName} plan={user.plan} />
			)
		})
	}

	return 200
}

async function handlePaymentIntentSucceededEvent(event: any): Promise<number> {
	const paymentIntent = event.data.object as Stripe.PaymentIntent

	// Find the purchase with the payment intent
	const purchase = await prisma.purchase.findFirst({
		where: {
			paymentIntentId: paymentIntent.id
		},
		include: {
			tableObjectPurchases: {
				include: {
					tableObject: {
						include: { table: { include: { app: true } } }
					}
				}
			}
		}
	})

	if (purchase == null || purchase.completed) return 200

	await prisma.purchase.update({
		where: { id: purchase.id },
		data: { completed: true }
	})

	// Notify client APIs of the completed purchase
	for (let tableObjectPurchase of purchase.tableObjectPurchases) {
		let webhookUrl = tableObjectPurchase.tableObject.table.app.webhookUrl

		if (webhookUrl == null) continue

		try {
			await axios({
				method: "put",
				url: webhookUrl,
				headers: {
					"Content-Type": "application/json",
					Authorization: process.env.WEBHOOK_KEY
				},
				data: {
					type: "payment_intent_succeeded",
					uuid: tableObjectPurchase.tableObject.uuid
				}
			})
		} catch (error) {
			console.error(error)
			return 500
		}
	}

	return 200
}

async function handleCustomerSubscriptionCreatedEvent(
	event: any
): Promise<number> {
	const subscription = event.data.object as Stripe.Subscription
	if (subscription.items.data.length == 0) return 500

	const productId = subscription.items.data[0].plan?.product as string
	if (productId == null) return 500

	const periodEnd = subscription.current_period_end
	if (periodEnd == null) return 500

	const user = await prisma.user.findFirst({
		where: {
			stripeCustomerId: subscription.customer as string
		}
	})

	if (user == null) return 500

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

	return 200
}

async function handleCustomerSubscriptionUpdatedEvent(
	event: any
): Promise<number> {
	const subscription = event.data.object as Stripe.Subscription
	if (subscription.items.data.length == 0) return 500

	const productId = subscription.items.data[0].plan?.product as string
	if (productId == null) return 500

	const periodEnd = subscription.current_period_end
	if (periodEnd == null) return 500

	const user = await prisma.user.findFirst({
		where: {
			stripeCustomerId: subscription.customer as string
		}
	})

	if (user == null) return 500

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

	return 200
}

async function handleCustomerSubscriptionDeletedEvent(
	event: any
): Promise<number> {
	const subscription = event.data.object as Stripe.Subscription
	if (subscription.items.data.length == 0) return 500

	const user = await prisma.user.findFirst({
		where: {
			stripeCustomerId: subscription.customer as string
		}
	})

	if (user == null) return 500

	// Downgrade the user to the free plan
	await prisma.user.update({
		where: { id: user.id },
		data: {
			plan: 0,
			subscriptionStatus: 0,
			periodEnd: null
		}
	})

	return 200
}

export function setup(app: Express) {
	app.post(
		"/webhooks/stripe",
		raw({ type: "application/json" }),
		cors(),
		stripeWebhook
	)
}
