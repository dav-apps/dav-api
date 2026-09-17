import { expect, it, vi } from "vitest"
import { businessSuite } from "../helpers/business.js"
const s = businessSuite()
const checkout = `mutation($uuid: String!, $shipping: ShippingRate, $price: Int, $currency: Currency) {
	createPaymentCheckoutSession(tableObjectUuid: $uuid, type: ORDER, price: $price, currency: $currency,
	productName: "A book", productImage: "https://example.test/cover.png", shippingRate: $shipping,
	successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel") { url }
}`
async function product() {
	const { h, t } = s
	const object = await t.make.object(t.other.id, t.table.id)
	await h.prisma.tableObjectPrice.create({
		data: {
			tableObjectId: object.id,
			type: "ORDER",
			price: 1299,
			currency: "EUR"
		}
	})
	vi.spyOn(s.stripe.customers, "create").mockResolvedValue({
		id: "cus_test"
	} as any)
	const create = vi
		.spyOn(s.stripe.checkout.sessions, "create")
		.mockResolvedValue({ url: "https://checkout.example/session" } as any)
	return { object, create }
}

it("uses stored cent prices, resolved shipping currency and the correct customer and order", async () => {
	const { h, t } = s
	const { object, create } = await product()
	const r = await h.execute(
		checkout,
		{ uuid: object.uuid, shipping: { name: "Shipping", price: 499 } },
		t.session.token
	)
	expect(r.errors).toBeUndefined()
	const order = await h.prisma.order.findFirst()
	expect(order).toMatchObject({
		userId: t.owner.id,
		tableObjectId: object.id,
		price: 1299,
		currency: "EUR",
		status: "CREATED"
	})
	expect(create).toHaveBeenCalledWith(
		expect.objectContaining({
			customer: "cus_test",
			metadata: { order: order.uuid },
			line_items: [
				expect.objectContaining({
					price_data: expect.objectContaining({
						unit_amount: 1299,
						currency: "EUR"
					})
				})
			],
			shipping_options: [
				expect.objectContaining({
					shipping_rate_data: expect.objectContaining({
						fixed_amount: { amount: 499, currency: "EUR" }
					})
				})
			]
		})
	)
})

it.each(["price", "shipping", "missing"])(
	"rejects invalid %s before creating an order or calling Stripe",
	async mode => {
		const { h, t } = s
		const { object, create } = await product()
		const r = await h.execute(
			checkout,
			{
				uuid: mode === "missing" ? "missing" : object.uuid,
				price: mode === "price" ? -1 : undefined,
				currency: mode === "price" ? "EUR" : undefined,
				shipping:
					mode === "shipping" ? { name: "Shipping", price: -1 } : undefined
			},
			t.session.token
		)
		expect(r.errors?.[0].extensions.code).toBe(
			mode === "missing"
				? "TABLE_OBJECT_DOES_NOT_EXIST"
				: "VALIDATION_FAILED"
		)
		expect(await h.prisma.order.count()).toBe(0)
		expect(create).not.toHaveBeenCalled()
		expect(s.stripe.customers.create).not.toHaveBeenCalled()
	}
)

it("does not report success or mark an order paid when Stripe checkout fails", async () => {
	const { h, t } = s
	const { object, create } = await product()
	create.mockRejectedValue(new Error("Stripe unavailable"))
	const r = await h.execute(checkout, { uuid: object.uuid }, t.session.token)
	expect(r.errors).toHaveLength(1)
	expect(await h.prisma.order.findFirst()).toMatchObject({
		status: "CREATED",
		paymentIntentId: null
	})
})

it("selects the requested subscription price and rejects free plans and downgrades", async () => {
	const { h, t } = s
	vi.stubEnv("STRIPE_DAV_PRO_EUR_PLAN_ID", "price_pro")
	vi.spyOn(s.stripe.customers, "create").mockResolvedValue({
		id: "cus_test"
	} as any)
	const create = vi
		.spyOn(s.stripe.checkout.sessions, "create")
		.mockResolvedValue({ url: "https://checkout.example/sub" } as any)
	const query = `mutation($plan: Plan!) { createSubscriptionCheckoutSession(plan: $plan, successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel") { url } }`
	expect(
		(await h.execute(query, { plan: "FREE" }, t.session.token)).errors?.[0]
			.extensions.code
	).toBe("CANNOT_CREATE_CHECKOUT_SESSION_FOR_FREE_PLAN")
	expect(
		(await h.execute(query, { plan: "PRO" }, t.session.token)).errors
	).toBeUndefined()
	expect(create).toHaveBeenCalledWith(
		expect.objectContaining({
			mode: "subscription",
			line_items: [{ price: "price_pro", quantity: 1 }]
		})
	)
	await h.prisma.user.update({ where: { id: t.owner.id }, data: { plan: 2 } })
	expect(
		(await h.execute(query, { plan: "PLUS" }, t.session.token)).errors?.[0]
			.extensions.code
	).toBe("USER_IS_ON_OR_BELOW_GIVEN_PLAN")
	expect(create).toHaveBeenCalledTimes(1)
})

it("creates only free purchases and lists them for their purchaser", async () => {
	const { h, t } = s
	const { object } = await product()
	const query =
		"mutation($uuid: String!) { createPurchase(tableObjectUuid: $uuid) { uuid } }"
	expect(
		(await h.execute(query, { uuid: object.uuid }, t.session.token))
			.errors?.[0].extensions.code
	).toBe("TABLE_OBJECT_IS_NOT_FREE")
	await h.prisma.tableObjectPrice.updateMany({ data: { price: 0 } })
	expect(
		(await h.execute(query, { uuid: object.uuid }, t.session.token)).errors
	).toBeUndefined()
	expect(await h.prisma.purchase.findFirst()).toMatchObject({
		userId: t.owner.id,
		completed: true,
		price: 0
	})
	const result = await h.execute(
		"query($uuid: String!) { listPurchasesOfTableObject(uuid: $uuid) { total } }",
		{ uuid: object.uuid },
		t.otherSession.token
	)
	expect(result.data.listPurchasesOfTableObject).toEqual({ total: 0 })
})
