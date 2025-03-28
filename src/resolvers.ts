import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json"
import * as appResolvers from "./resolvers/app.js"
import * as appUserSnapshotResolvers from "./resolvers/appUserSnapshot.js"
import * as userSnapshotResolvers from "./resolvers/userSnapshot.js"
import * as devResolvers from "./resolvers/dev.js"
import * as providerResolvers from "./resolvers/provider.js"
import * as userResolvers from "./resolvers/user.js"
import * as sessionResolvers from "./resolvers/session.js"
import * as tableResolvers from "./resolvers/table.js"
import * as tableObjectResolvers from "./resolvers/tableObject.js"
import * as tableObjectPriceResolvers from "./resolvers/tableObjectPrice.js"
import * as tableObjectUserAccessResolvers from "./resolvers/tableObjectUserAccess.js"
import * as notificationResolvers from "./resolvers/notification.js"
import * as purchaseResolvers from "./resolvers/purchase.js"
import * as orderResolvers from "./resolvers/order.js"
import * as shippingAddressResolvers from "./resolvers/shippingAddress.js"
import * as webPushSubscriptionResolvers from "./resolvers/webPushSubscription.js"
import * as websocketConnectionResolvers from "./resolvers/websocketConnection.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"
import * as customerPortalSessionResolvers from "./resolvers/customerPortalSession.js"

export const resolvers = {
	Query: {
		retrieveApp: appResolvers.retrieveApp,
		listApps: appResolvers.listApps,
		listAppUserSnapshots: appUserSnapshotResolvers.listAppUserSnapshots,
		listUserSnapshots: userSnapshotResolvers.listUserSnapshots,
		retrieveUser: userResolvers.retrieveUser,
		retrieveUserById: userResolvers.retrieveUserById,
		retrieveDev: devResolvers.retrieveDev,
		retrieveTable: tableResolvers.retrieveTable,
		retrieveTableObject: tableObjectResolvers.retrieveTableObject,
		listTableObjectsByProperty:
			tableObjectResolvers.listTableObjectsByProperty,
		listNotifications: notificationResolvers.listNotifications,
		listPurchasesOfTableObject: purchaseResolvers.listPurchasesOfTableObject,
		retrieveOrder: orderResolvers.retrieveOrder,
		listOrders: orderResolvers.listOrders,
		listShippingAddresses: shippingAddressResolvers.listShippingAddresses,
		retrieveWebPushSubscription:
			webPushSubscriptionResolvers.retrieveWebPushSubscription
	},
	Mutation: {
		createUser: userResolvers.createUser,
		updateUser: userResolvers.updateUser,
		sendConfirmationEmailForUser: userResolvers.sendConfirmationEmailForUser,
		sendPasswordResetEmailForUser:
			userResolvers.sendPasswordResetEmailForUser,
		confirmUser: userResolvers.confirmUser,
		saveNewEmailOfUser: userResolvers.saveNewEmailOfUser,
		saveNewPasswordOfUser: userResolvers.saveNewPasswordOfUser,
		resetEmailOfUser: userResolvers.resetEmailOfUser,
		setPasswordOfUser: userResolvers.setPasswordOfUser,
		createSession: sessionResolvers.createSession,
		createSessionFromAccessToken:
			sessionResolvers.createSessionFromAccessToken,
		renewSession: sessionResolvers.renewSession,
		deleteSession: sessionResolvers.deleteSession,
		updateApp: appResolvers.updateApp,
		createTableObject: tableObjectResolvers.createTableObject,
		updateTableObject: tableObjectResolvers.updateTableObject,
		deleteTableObject: tableObjectResolvers.deleteTableObject,
		setTableObjectPrice: tableObjectPriceResolvers.setTableObjectPrice,
		createTableObjectUserAccess:
			tableObjectUserAccessResolvers.createTableObjectUserAccess,
		deleteTableObjectUserAccess:
			tableObjectUserAccessResolvers.deleteTableObjectUserAccess,
		createNotification: notificationResolvers.createNotification,
		createNotificationForUser:
			notificationResolvers.createNotificationForUser,
		updateNotification: notificationResolvers.updateNotification,
		deleteNotification: notificationResolvers.deleteNotification,
		createWebPushSubscription:
			webPushSubscriptionResolvers.createWebPushSubscription,
		deleteWebPushSubscription:
			webPushSubscriptionResolvers.deleteWebPushSubscription,
		createWebsocketConnection:
			websocketConnectionResolvers.createWebsocketConnection,
		createSubscriptionCheckoutSession:
			checkoutSessionResolvers.createSubscriptionCheckoutSession,
		createPaymentCheckoutSession:
			checkoutSessionResolvers.createPaymentCheckoutSession,
		createCustomerPortalSession:
			customerPortalSessionResolvers.createCustomerPortalSession,
		createPurchase: purchaseResolvers.createPurchase,
		updateOrder: orderResolvers.updateOrder
	},
	App: {
		id: appResolvers.id,
		tables: appResolvers.tables
	},
	User: {
		id: userResolvers.id,
		totalStorage: userResolvers.totalStorage,
		usedStorage: userResolvers.usedStorage,
		plan: userResolvers.plan,
		subscriptionStatus: userResolvers.subscriptionStatus,
		periodEnd: userResolvers.periodEnd,
		dev: userResolvers.dev,
		provider: userResolvers.provider,
		profileImage: userResolvers.profileImage,
		apps: userResolvers.apps
	},
	UserSnapshot: {
		time: userSnapshotResolvers.time
	},
	AppUserSnapshot: {
		time: appUserSnapshotResolvers.time
	},
	Dev: {
		id: devResolvers.id,
		apps: devResolvers.apps
	},
	Provider: {
		id: providerResolvers.id
	},
	Table: {
		id: tableResolvers.id,
		etag: tableResolvers.etag,
		tableObjects: tableResolvers.tableObjects
	},
	TableObject: {
		user: tableObjectResolvers.user,
		table: tableObjectResolvers.table,
		fileUrl: tableObjectResolvers.fileUrl,
		properties: tableObjectResolvers.properties
	},
	TableObjectUserAccess: {
		tableAlias: tableObjectUserAccessResolvers.tableAlias
	},
	Notification: {
		time: notificationResolvers.time
	},
	Order: {
		user: orderResolvers.user,
		tableObject: orderResolvers.tableObject,
		shippingAddress: orderResolvers.shippingAddress
	},
	JSON: GraphQLJSON,
	JSONObject: GraphQLJSONObject
}
