import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as tableObjectPriceResolvers from "./resolvers/tableObjectPrice.js"
import * as orderResolvers from "./resolvers/order.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"

export const resolvers = {
	Query: {
		retrieveTableObject: tableObjectResolvers.retrieveTableObject,
		retrieveOrder: orderResolvers.retrieveOrder
	},
	Mutation: {
		setTableObjectPrice: tableObjectPriceResolvers.setTableObjectPrice,
		createCheckoutSession: checkoutSessionResolvers.createCheckoutSession
	},
	TableObject: {
		properties: tableObjectResolvers.properties
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
