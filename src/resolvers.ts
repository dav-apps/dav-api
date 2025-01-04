import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as appResolvers from "./resolvers/app.js"
import * as appUserSnapshotResolvers from "./resolvers/appUserSnapshot.js"
import * as devResolvers from "./resolvers/dev.js"
import * as userResolvers from "./resolvers/user.js"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as tableObjectPriceResolvers from "./resolvers/tableObjectPrice.js"
import * as notificationResolvers from "./resolvers/notification.js"
import * as orderResolvers from "./resolvers/order.js"
import * as shippingAddressResolvers from "./resolvers/shippingAddress.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"
import * as customerPortalSessionResolvers from "./resolvers/customerPortalSession.js"

export const resolvers = {
	Query: {
		retrieveApp: appResolvers.retrieveApp,
		listApps: appResolvers.listApps,
		listAppUserSnapshots: appUserSnapshotResolvers.listAppUserSnapshots,
		retrieveDev: devResolvers.retrieveDev,
		retrieveTableObject: tableObjectResolvers.retrieveTableObject,
		listTableObjectsByProperty:
			tableObjectResolvers.listTableObjectsByProperty,
		retrieveOrder: orderResolvers.retrieveOrder,
		listOrders: orderResolvers.listOrders,
		listShippingAddresses: shippingAddressResolvers.listShippingAddresses
	},
	Mutation: {
		updateApp: appResolvers.updateApp,
		setTableObjectPrice: tableObjectPriceResolvers.setTableObjectPrice,
		createNotification: notificationResolvers.createNotification,
		createSubscriptionCheckoutSession:
			checkoutSessionResolvers.createSubscriptionCheckoutSession,
		createPaymentCheckoutSession:
			checkoutSessionResolvers.createPaymentCheckoutSession,
		createCustomerPortalSession:
			customerPortalSessionResolvers.createCustomerPortalSession,
		updateOrder: orderResolvers.updateOrder
	},
	App: {
		id: appResolvers.id
	},
	User: {
		id: userResolvers.id
	},
	TableObject: {
		user: tableObjectResolvers.user,
		properties: tableObjectResolvers.properties
	},
	Order: {
		user: orderResolvers.user,
		tableObject: orderResolvers.tableObject,
		shippingAddress: orderResolvers.shippingAddress
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
