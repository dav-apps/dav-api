import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as userResolvers from "./resolvers/user.js"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as tableObjectPriceResolvers from "./resolvers/tableObjectPrice.js"
import * as notificationResolvers from "./resolvers/notification.js"
import * as orderResolvers from "./resolvers/order.js"
import * as shippingAddressResolvers from "./resolvers/shippingAddress.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"

export const resolvers = {
	Query: {
		retrieveTableObject: tableObjectResolvers.retrieveTableObject,
		retrieveOrder: orderResolvers.retrieveOrder,
		listOrders: orderResolvers.listOrders,
		listShippingAddresses: shippingAddressResolvers.listShippingAddresses
	},
	Mutation: {
		setTableObjectPrice: tableObjectPriceResolvers.setTableObjectPrice,
		createNotification: notificationResolvers.createNotification,
		createSubscriptionCheckoutSession:
			checkoutSessionResolvers.createSubscriptionCheckoutSession,
		createPaymentCheckoutSession:
			checkoutSessionResolvers.createPaymentCheckoutSession,
		updateOrder: orderResolvers.updateOrder
	},
	User: {
		id: userResolvers.id
	},
	TableObject: {
		user: tableObjectResolvers.user,
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
