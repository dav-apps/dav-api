export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveTableObject(uuid: String!): TableObject
		listTableObjectsByProperty(
			userId: Int
			appId: Int!
			tableName: String
			propertyName: String!
			propertyValue: String!
			limit: Int
			offset: Int
		): TableObjectList!
		retrieveOrder(uuid: String!): Order
		listOrders(
			status: [OrderStatus!]
			limit: Int
			offset: Int
		): OrderList!
		listShippingAddresses(
			userId: Int!
			limit: Int
			offset: Int
		): ShippingAddressList!
	}

	type Mutation {
		setTableObjectPrice(
			tableObjectUuid: String!
			price: Int!
			currency: Currency!
			type: TableObjectPriceType!
		): TableObjectPrice
		createNotification(
			uuid: String
			userId: Int!
			appId: Int!
			time: Int!
			interval: Int!
			title: String!
			body: String!
			icon: String
			image: String
			href: String
		): Notification
		createSubscriptionCheckoutSession(
			plan: Plan!
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession
		createPaymentCheckoutSession(
			tableObjectUuid: String!
			type: TableObjectPriceType!
			price: Int
			currency: Currency
			productName: String!
			productImage: String!
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession
		updateOrder(
			uuid: String!
			status: OrderStatus
		): Order
	}

	type User {
		id: Int!
	}

	type TableObject {
		uuid: String!
		user: User!
		properties: JSON
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
	}

	type Notification {
		uuid: String!
		time: String!
		interval: String!
		title: String!
		body: String!
	}

	type TableObjectPrice {
		tableObject: TableObject!
		price: Int!
		currency: Currency!
		type: TableObjectPriceType!
	}

	type Order {
		uuid: String!
		userId: Int!
		tableObject: TableObject!
		shippingAddress: ShippingAddress
		paymentIntentId: String
		price: Int!
		currency: Currency!
		status: OrderStatus!
	}

	type OrderList {
		total: Int!
		items: [Order!]!
	}

	type ShippingAddress {
		uuid: String!
		name: String
		email: String
		phone: String
		city: String
		country: String
		line1: String
		line2: String
		postalCode: String
		state: String
	}

	type ShippingAddressList {
		total: Int!
		items: [ShippingAddress!]!
	}

	type CheckoutSession {
		url: String!
	}

	enum Plan {
		FREE
		PLUS
		PRO
	}

	enum Currency {
		EUR
	}

	enum TableObjectPriceType {
		PURCHASE
		ORDER
	}

	enum OrderStatus {
		CREATED
		PREPARATION
		SHIPPED
	}
`
