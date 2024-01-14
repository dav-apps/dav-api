import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as tableObjectResolvers from "./resolvers/tableObject.js"

export const resolvers = {
	Query: {
		retrieveTableObject: tableObjectResolvers.retrieveTableObject
	},
	TableObject: {
		properties: tableObjectResolvers.properties
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
