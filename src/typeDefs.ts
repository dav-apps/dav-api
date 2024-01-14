export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveTableObject(uuid: String!): TableObject
	}

	type Mutation {
		createCheckoutSession(
			tableObjectUuid: String!
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

	type CheckoutSession {
		url: String!
	}
`
