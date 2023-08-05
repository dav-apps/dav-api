export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		tableObjectsByCollection(
			collectionName: String!
			limit: Int
			offset: Int
		): TableObjectList!
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
