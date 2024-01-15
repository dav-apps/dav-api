import { Express, Request, Response, raw } from "express"
import cors from "cors"
import Stripe from "stripe"
import { stripe } from "../../server.js"

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
