import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"

export const resolvers = {
	Query: {
		retrieveTableObject: tableObjectResolvers.retrieveTableObject
	},
	Mutation: {
		createCheckoutSession: checkoutSessionResolvers.createCheckoutSession
	},
	TableObject: {
		properties: tableObjectResolvers.properties
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
