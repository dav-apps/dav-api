export const typeDefs = `#graphql
	type Query {
		tableObjectsByCollection(
			collectionName: String!
			limit: Int
			offset: Int
		): [TableObject!]!
	}

	type TableObject {
		uuid: String!
	}
`
