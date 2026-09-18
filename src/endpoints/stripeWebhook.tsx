import { Express, Request, Response, raw } from "express"
import cors from "cors"
import Stripe from "stripe"
import type { Prisma } from "@prisma/client"
import {
	processWebhook,
	webhookEffectOnce
} from "../services/webhookService.js"
import type { AppDependencies } from "../appDependencies.js"
import PaymentAttemptFailedEmail from "../emails/paymentAttemptFailed.js"
import PaymentFailedEmail from "../emails/paymentFailed.js"
import { noReplyEmailAddress } from "../constants.js"

type QueueEffect = (key: string, work: () => Promise<unknown>) => Promise<void>

export function createStripeWebhook(dependencies: AppDependencies) {
	const {
		prisma,
		stripe,
		resend,
		webhookHttp,
		stripeWebhookSecret: endpointSecret
	} = dependencies

	async function stripeWebhook(req: Request, res: Response) {
		if (!endpointSecret) return res.sendStatus(503)
		let event: Stripe.Event
		try {
			event = stripe.webhooks.constructEvent(
				req.body,
				req.headers["stripe-signature"],
				endpointSecret
			)
		} catch {
			return res.sendStatus(400)
		}
		const handlers = {
			"checkout.session.completed": handleCheckoutSessionCompletedEvent,
			"invoice.payment_succeeded": handleInvoicePaymentSucceededEvent,
			"invoice.payment_failed": handleInvoicePaymentFailedEvent,
			"payment_intent.succeeded": handlePaymentIntentSucceededEvent,
			"customer.subscription.created":
				handleCustomerSubscriptionCreatedEvent,
			"customer.subscription.updated":
				handleCustomerSubscriptionUpdatedEvent,
			"customer.subscription.deleted": handleCustomerSubscriptionDeletedEvent
		}
		const handler = handlers[event.type]
		if (!handler) return res.sendStatus(200)
		const object = event.data?.object as any
		if (!event.id || !Number.isInteger(event.created) || !object?.id)
			return res.sendStatus(400)
		let resource: string
		if (event.type === "checkout.session.completed") {
			if (object.mode === "subscription") return res.sendStatus(200)
			if (!object.metadata?.order) return res.sendStatus(400)
			resource = `order:${object.metadata.order}`
		} else if (event.type === "payment_intent.succeeded") {
			resource = `purchase:${object.id}`
		} else {
			if (typeof object.customer !== "string" || !object.customer)
				return res.sendStatus(400)
			resource = `customer:${object.customer}`
		}
		try {
			await processWebhook(
				prisma,
				event,
				resource,
				event.type.startsWith("customer.subscription."),
				async () => {
					const effects: Array<() => Promise<void>> = []
					// Commit domain data before notifying apps that may read it back.
					await prisma.$transaction(
						async tx => {
							const status = await handler(
								event,
								tx,
								async (key, work) => {
									effects.push(() =>
										webhookEffectOnce(prisma, key, work)
									)
								}
							)
							if (status !== 200)
								throw new Error("Webhook domain update failed")
						},
						{ maxWait: 5000, timeout: 15000 }
					)
					for (const effect of effects) await effect()
					return 200
				}
			)
			return res.sendStatus(200)
		} catch (error) {
			console.error("Stripe webhook failed", error)
			return res.sendStatus(502)
		}
	}

	async function handleCheckoutSessionCompletedEvent(
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
	): Promise<number> {
		const checkoutSession = event.data.object as Stripe.Checkout.Session
		if (
			!["paid", "no_payment_required"].includes(
				checkoutSession.payment_status
			)
		)
			return 500

		// Get the order id from the payment intent
		const orderUuid = checkoutSession.metadata.order

		if (orderUuid != null) {
			// Find the order & update it
			let order = await prisma.order.findFirst({
				where: { uuid: orderUuid }
			})

			if (!order || !checkoutSession.payment_intent) return 500

			if (order.shippingAddressId == null) {
				const name = checkoutSession.shipping_details?.name
				const email = checkoutSession.customer_details?.email
				const phone = checkoutSession.customer_details?.phone
				const city = checkoutSession.shipping_details?.address?.city
				const country = checkoutSession.shipping_details?.address?.country
				const line1 = checkoutSession.shipping_details?.address?.line1
				const line2 = checkoutSession.shipping_details?.address?.line2
				const postalCode =
					checkoutSession.shipping_details?.address?.postal_code
				const state = checkoutSession.shipping_details?.address?.state

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
					status: order.status === "SHIPPED" ? "SHIPPED" : "PREPARATION"
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
					await effect(`order:${order.uuid}:completed`, () =>
						webhookHttp.request({
							method: "post",
							url: webhookUrl,
							headers: {
								"Content-Type": "application/json",
								Authorization: process.env.WEBHOOK_KEY
							},
							data: {
								type: "order.completed",
								uuid: order.uuid
							},
							timeout: 10000
						})
					)
				} catch (error) {
					console.error(error)
					return 500
				}
			}
		}

		return 200
	}

	async function handleInvoicePaymentSucceededEvent(
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
	): Promise<number> {
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

	async function handleInvoicePaymentFailedEvent(
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
	): Promise<number> {
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
			await sendPaymentEmail(effect, `invoice:${invoice.id}:failed`, {
				from: noReplyEmailAddress,
				to: user.email,
				subject: "Subscription renewal failed - dav",
				react: <PaymentFailedEmail name={user.firstName} />
			})
		} else if (invoice.attempt_count == 2) {
			// Send payment attempt failed email
			await sendPaymentEmail(
				effect,
				`invoice:${invoice.id}:attempt:${invoice.attempt_count}`,
				{
					from: noReplyEmailAddress,
					to: user.email,
					subject: "Subscription renewal failed - dav",
					react: (
						<PaymentAttemptFailedEmail
							name={user.firstName}
							plan={user.plan}
						/>
					)
				}
			)
		}

		return 200
	}

	async function handlePaymentIntentSucceededEvent(
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
	): Promise<number> {
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

		if (purchase == null) return 200

		await prisma.purchase.update({
			where: { id: purchase.id },
			data: { completed: true }
		})

		// Notify client APIs of the completed purchase
		for (let tableObjectPurchase of purchase.tableObjectPurchases) {
			let webhookUrl = tableObjectPurchase.tableObject.table.app.webhookUrl

			if (webhookUrl == null) continue

			try {
				await effect(
					`purchase:${purchase.id}:object:${tableObjectPurchase.tableObjectId}`,
					() =>
						webhookHttp.request({
							method: "put",
							url: webhookUrl,
							headers: {
								"Content-Type": "application/json",
								Authorization: process.env.WEBHOOK_KEY
							},
							data: {
								type: "payment_intent_succeeded",
								uuid: tableObjectPurchase.tableObject.uuid
							},
							timeout: 10000
						})
				)
			} catch (error) {
				console.error(error)
				return 500
			}
		}

		return 200
	}

	async function handleCustomerSubscriptionCreatedEvent(
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
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
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
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
		event: any,
		prisma: Prisma.TransactionClient,
		effect: QueueEffect
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

	async function sendPaymentEmail(
		effect: QueueEffect,
		key: string,
		payload: Parameters<typeof resend.emails.send>[0]
	) {
		await effect(key, async () => {
			const result = await resend.emails.send(payload)
			if (result.error || !result.data)
				throw new Error("Payment email failed")
		})
	}

	return stripeWebhook
}

export function setup(app: Express, dependencies: AppDependencies) {
	app.post(
		"/webhooks/stripe",
		raw({ type: "application/json" }),
		cors(),
		createStripeWebhook(dependencies)
	)
}
