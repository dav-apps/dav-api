import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as tableObjectResolvers from "./resolvers/tableObject.js"

export const resolvers = {
	Query: {
		tableObjectsByCollection: tableObjectResolvers.tableObjectsByCollection
	},
	TableObject: {
		properties: tableObjectResolvers.properties
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
