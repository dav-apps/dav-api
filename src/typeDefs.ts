export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveTableObject(uuid: String!): TableObject
	}

	type TableObject {
		uuid: String!
		properties: JSON
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
	}
`
