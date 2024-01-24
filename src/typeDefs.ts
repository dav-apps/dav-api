export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveTableObject(uuid: String!): TableObject
		retrieveOrder(uuid: String!): Order
		listShippingAddresses(
			userId: Int!
			limit: Int
			offset: Int
		): ShippingAddressList
	}

	type Mutation {
		setTableObjectPrice(
			tableObjectUuid: String!
			price: Int!
			currency: Currency!
			type: TableObjectPriceType!
		): TableObjectPrice
		createCheckoutSession(
			tableObjectUuid: String!
			type: TableObjectPriceType!
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

	type TableObject {
		uuid: String!
		properties: JSON
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
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
