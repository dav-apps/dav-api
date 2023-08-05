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
		tableObjectProperties(limit: Int, offset: Int): TableObjectPropertyList!
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
	}

	type TableObjectProperty {
		name: String!
		value: String
	}

	type TableObjectPropertyList {
		total: Int!
		items: [TableObjectProperty!]!
	}
`
