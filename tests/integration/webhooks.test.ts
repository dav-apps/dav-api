import { expect, it, vi } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { businessSuite } from "../helpers/business.js"
import { createIntegrationApp } from "../helpers/integration.js"
const s = businessSuite()

function event(type: string, object: Record<string, unknown>, created = 1000) {
	return { id: `evt_${randomUUID()}`, type, created, data: { object } }
}
function deliver(
	value: ReturnType<typeof event>,
	app = s.h.app,
	secret = "whsec_test"
) {
	const payload = JSON.stringify(value)
	return request(app)
		.post("/webhooks/stripe")
		.set("Content-Type", "application/json")
		.set(
			"stripe-signature",
			s.stripe.webhooks.generateTestHeaderString({ payload, secret })
		)
		.send(payload)
		.timeout(5000)
}
async function orderEvent() {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id)
	const order = await h.prisma.order.create({
		data: {
			userId: t.owner.id,
			tableObjectId: object.id,
			price: 1299,
			currency: "EUR"
		}
	})
	await h.prisma.app.update({
		where: { id: t.app.id },
		data: { webhookUrl: "https://app.example/webhook" }
	})
	vi.mocked(h.dependencies.webhookHttp.request).mockResolvedValue({
		status: 200
	})
	return {
		order,
		value: event("checkout.session.completed", {
			id: "cs_test",
			mode: "payment",
			payment_status: "paid",
			payment_intent: "pi_test",
			metadata: { order: order.uuid },
			shipping_details: {
				name: "Test",
				address: {
					city: "Berlin",
					country: "DE",
					line1: "Test 1",
					postal_code: "12345"
				}
			},
			customer_details: { email: t.owner.email, phone: null }
		})
	}
}

it("rejects wrong signatures, malformed events and missing configuration without writes", async () => {
	const value = event("checkout.session.completed", {
		id: "cs_test",
		mode: "payment"
	})
	await deliver(value, s.h.app, "wrong").expect(400)
	await deliver(value).expect(400)
	const missing = await createIntegrationApp({
		stripe: s.stripe,
		stripeWebhookSecret: undefined
	})
	try {
		await deliver(value, missing.app).expect(503)
	} finally {
		await missing.close()
	}
	expect(await s.h.prisma.order.count()).toBe(0)
	expect(await s.h.prisma.webhookEvent.count()).toBe(0)
})

it("serializes concurrent duplicate deliveries across app instances and survives restart", async () => {
	const { h } = s
	const { value, order } = await orderEvent()
	const other = await createIntegrationApp({
		stripe: s.stripe,
		webhookHttp: h.dependencies.webhookHttp
	})
	try {
		await Promise.all([
			deliver(value).expect(200),
			deliver(value, other.app).expect(200)
		])
	} finally {
		await other.close()
	}
	const restarted = await createIntegrationApp({
		stripe: s.stripe,
		webhookHttp: h.dependencies.webhookHttp
	})
	try {
		await deliver(value, restarted.app).expect(200)
	} finally {
		await restarted.close()
	}
	expect(h.dependencies.webhookHttp.request).toHaveBeenCalledTimes(1)
	expect(await h.prisma.shippingAddress.count()).toBe(1)
	expect(
		await h.prisma.order.findUnique({ where: { id: order.id } })
	).toMatchObject({ status: "PREPARATION", paymentIntentId: "pi_test" })
})

it("commits order data before callback consumers read it", async () => {
	const { h } = s
	const { value, order } = await orderEvent()
	vi.mocked(h.dependencies.webhookHttp.request).mockImplementation(
		async () => {
			expect(
				await h.prisma.order.findUnique({
					where: { id: order.id },
					include: { shippingAddress: true }
				})
			).toMatchObject({
				status: "PREPARATION",
				paymentIntentId: "pi_test",
				shippingAddress: { city: "Berlin" }
			})
			return { status: 200 }
		}
	)
	await deliver(value).expect(200)
	expect(h.dependencies.webhookHttp.request).toHaveBeenCalledTimes(1)
})

it("retries a failed outgoing order webhook and never regresses shipped orders", async () => {
	const { h } = s
	vi.spyOn(console, "error").mockImplementation(() => {})
	const { value, order } = await orderEvent()
	vi.mocked(h.dependencies.webhookHttp.request).mockRejectedValueOnce(
		new Error("offline")
	)
	await deliver(value).expect(502)
	expect(await h.prisma.webhookEvent.count()).toBe(0)
	expect(
		(await h.prisma.order.findUnique({ where: { id: order.id } })).status
	).toBe("PREPARATION")
	await deliver(value).expect(200)
	await h.prisma.order.update({
		where: { id: order.id },
		data: { status: "SHIPPED" }
	})
	await deliver({ ...value, id: "evt_later_duplicate" }).expect(200)
	expect(
		(await h.prisma.order.findUnique({ where: { id: order.id } })).status
	).toBe("SHIPPED")
	expect(h.dependencies.webhookHttp.request).toHaveBeenCalledTimes(2)
})

it("resumes purchase notifications after partial failure without repeating successful recipients", async () => {
	const { h, t } = s
	vi.spyOn(console, "error").mockImplementation(() => {})
	const one = await t.make.object(t.owner.id, t.table.id)
	const two = await t.make.object(t.owner.id, t.foreignTable.id)
	await h.prisma.app.updateMany({
		data: { webhookUrl: "https://app.example/webhook" }
	})
	const purchase = await h.prisma.purchase.create({
		data: {
			userId: t.owner.id,
			paymentIntentId: "pi_purchase",
			tableObjectPurchases: {
				create: [{ tableObjectId: one.id }, { tableObjectId: two.id }]
			}
		}
	})
	const calls = vi.mocked(h.dependencies.webhookHttp.request)
	calls
		.mockResolvedValueOnce({ status: 200 })
		.mockRejectedValueOnce(new Error("offline"))
		.mockResolvedValue({ status: 200 })
	const value = event("payment_intent.succeeded", { id: "pi_purchase" })
	await deliver(value).expect(502)
	expect(
		(await h.prisma.purchase.findUnique({ where: { id: purchase.id } }))
			.completed
	).toBe(true)
	expect(await h.prisma.webhookEffect.count()).toBe(1)
	await deliver(value).expect(200)
	await deliver(value).expect(200)
	expect(calls).toHaveBeenCalledTimes(3)
	expect(
		(await h.prisma.purchase.findUnique({ where: { id: purchase.id } }))
			.completed
	).toBe(true)
})

it("awaits Resend errors and retries a payment failure email only until it succeeds", async () => {
	const { h, t } = s
	vi.spyOn(console, "error").mockImplementation(() => {})
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { stripeCustomerId: "cus_test", plan: 2 }
	})
	const send = vi.mocked(h.dependencies.resend.emails.send)
	send.mockResolvedValueOnce({
		data: null,
		error: { name: "validation_error", message: "rejected", statusCode: 422 },
		headers: null
	})
	const value = event("invoice.payment_failed", {
		id: "in_test",
		customer: "cus_test",
		paid: false,
		next_payment_attempt: null
	})
	await deliver(value).expect(502)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } })).plan
	).toBe(0)
	await deliver(value).expect(200)
	await deliver(value).expect(200)
	expect(send).toHaveBeenCalledTimes(2)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } })).plan
	).toBe(0)
})

it("does not restore a subscription from a delayed update after deletion", async () => {
	const { h, t } = s
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { stripeCustomerId: "cus_test", plan: 2 }
	})
	const object = {
		id: "sub_test",
		customer: "cus_test",
		status: "active",
		current_period_end: 2000000000,
		items: { data: [{ plan: { product: "plus" } }] }
	}
	await deliver(event("customer.subscription.deleted", object, 2000)).expect(
		200
	)
	await deliver(event("customer.subscription.updated", object, 1000)).expect(
		200
	)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } })).plan
	).toBe(0)
})

it.each([
	"customer.subscription.created",
	"customer.subscription.updated",
	"invoice.payment_succeeded"
])("updates plan and period for %s", async type => {
	const { h, t } = s
	vi.stubEnv("STRIPE_DAV_PRO_PRODUCT_ID", "pro")
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { stripeCustomerId: "cus_test" }
	})
	const object = {
		id: "sub_invoice_test",
		customer: "cus_test",
		status: "active",
		current_period_end: 2000000000,
		cancel_at_period_end: true,
		items: { data: [{ plan: { product: "pro" } }] },
		lines: {
			data: [{ plan: { product: "pro" }, period: { end: 2000000000 } }]
		}
	}
	await deliver(event(type, object)).expect(200)
	expect(
		await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	).toMatchObject({
		plan: 2,
		periodEnd: new Date(2000000000000),
		subscriptionStatus: type === "customer.subscription.updated" ? 1 : 0
	})
})
