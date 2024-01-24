import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as tableObjectPriceResolvers from "./resolvers/tableObjectPrice.js"
import * as orderResolvers from "./resolvers/order.js"
import * as shippingAddressResolvers from "./resolvers/shippingAddress.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"

export const resolvers = {
	Query: {
		retrieveTableObject: tableObjectResolvers.retrieveTableObject,
		retrieveOrder: orderResolvers.retrieveOrder,
		listShippingAddresses: shippingAddressResolvers.listShippingAddresses
	},
	Mutation: {
		setTableObjectPrice: tableObjectPriceResolvers.setTableObjectPrice,
		createCheckoutSession: checkoutSessionResolvers.createCheckoutSession,
		updateOrder: orderResolvers.updateOrder
	},
	TableObject: {
		properties: tableObjectResolvers.properties
	},
	Order: {
		userId: orderResolvers.userId,
		tableObject: orderResolvers.tableObject,
		shippingAddress: orderResolvers.shippingAddress
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
