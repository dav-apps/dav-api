export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveTableObject(uuid: String!): TableObject
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
		id
		tableObject: TableObject!
		price: Int!
		currency: Currency!
		type: TableObjectPriceType!
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
`
