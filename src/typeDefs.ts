export const typeDefs = `#graphql
	scalar JSON
	scalar JSONObject

	type Query {
		retrieveApp(id: Int!): App
		listApps(
			published: Boolean
			limit: Int
			offset: Int
		): AppList!
		listAppUserSnapshots(
			appId: Int!
			start: Int
			end: Int
		): AppUserSnapshotList!
		retrieveUser: User
		retrieveUserById(id: Int!): User
		retrieveDev: Dev
		retrieveTableObject(uuid: String!): TableObject
		listTableObjectsByProperty(
			userId: Int
			appId: Int!
			tableName: String
			propertyName: String!
			propertyValue: String!
			exact: Boolean
			limit: Int
			offset: Int
		): TableObjectList!
		retrieveOrder(uuid: String!): Order
		listOrders(
			status: [OrderStatus!]
			limit: Int
			offset: Int
		): OrderList!
		listShippingAddresses(
			userId: Int!
			limit: Int
			offset: Int
		): ShippingAddressList!
	}

	type Mutation {
		createUser(
			email: String!
			password: String!
			appId: Int!
			apiKey: String!
			deviceName: String
			deviceOs: String
		): CreateUserResult!
		updateUser(
			email: String
			firstName: String
			password: String
		): User!
		createSession(
			email: String!
			password: String!
			appId: Int!
			apiKey: String!
			deviceName: String
			deviceOs: String
		): SessionResult!
		createSessionFromAccessToken(
			accessToken: String!
			appId: Int!
			apiKey: String!
			deviceName: String
			deviceOs: String
		): SessionResult!
		renewSession: SessionResult!
		updateApp(
			id: Int!
			name: String
			description: String
			published: Boolean
			webLink: String
			googlePlayLink: String
			microsoftStoreLink: String
		): App!
		setTableObjectPrice(
			tableObjectUuid: String!
			price: Int!
			currency: Currency!
			type: TableObjectPriceType!
		): TableObjectPrice
		createNotificationForUser(
			uuid: String
			userId: Int!
			appId: Int!
			time: Int!
			interval: Int!
			title: String!
			body: String!
			icon: String
			image: String
			href: String
		): Notification
		createSubscriptionCheckoutSession(
			plan: Plan!
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession
		createPaymentCheckoutSession(
			tableObjectUuid: String!
			type: TableObjectPriceType!
			price: Int
			currency: Currency
			productName: String!
			productImage: String!
			shippingRate: ShippingRate
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession
		createCustomerPortalSession: CustomerPortalSession!
		updateOrder(
			uuid: String!
			status: OrderStatus
		): Order
	}

	type App {
		id: Int!
		name: String!
		description: String
		published: Boolean
		webLink: String
		googlePlayLink: String
		microsoftStoreLink: String
	}

	type AppList {
		total: Int!
		items: [App!]!
	}

	type AppUserSnapshot {
		time: String!
		dailyActive: Int!
		weeklyActive: Int!
		monthlyActive: Int!
		yearlyActive: Int!
		freePlan: Int!
		plusPlan: Int!
		proPlan: Int!
		emailConfirmed: Int!
		emailUnconfirmed: Int!
	}

	type AppUserSnapshotList {
		total: Int!
		items: [AppUserSnapshot!]!
	}

	type Dev {
		id: Int!
	}

	type User {
		id: Int!
		email: String!
	}

	type TableObject {
		uuid: String!
		user: User!
		properties: JSON
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
	}

	type Notification {
		uuid: String!
		time: String!
		interval: String!
		title: String!
		body: String!
	}

	type TableObjectPrice {
		tableObject: TableObject!
		price: Int!
		currency: Currency!
		type: TableObjectPriceType!
	}

	type Order {
		uuid: String!
		user: User!
		tableObject: TableObject!
		shippingAddress: ShippingAddress
		paymentIntentId: String
		price: Int!
		currency: Currency!
		status: OrderStatus!
	}

	type OrderList {
		total: Int!
		items: [Order!]!
	}

	type ShippingAddress {
		uuid: String!
		name: String
		email: String
		phone: String
		city: String
		country: String
		line1: String
		line2: String
		postalCode: String
		state: String
	}

	type ShippingAddressList {
		total: Int!
		items: [ShippingAddress!]!
	}

	type CheckoutSession {
		url: String!
	}

	type CustomerPortalSession {
		url: String!
	}

	type CreateUserResult {
		user: User!
		accessToken: String!
		websiteAccessToken: String
	}

	type SessionResult {
		accessToken: String!
		websiteAccessToken: String
	}

	input ShippingRate {
		name: String!
		price: Int!
	}

	enum Plan {
		FREE
		PLUS
		PRO
	}

	enum Currency {
		EUR
	}

	enum TableObjectPriceType {
		PURCHASE
		ORDER
	}

	enum OrderStatus {
		CREATED
		PREPARATION
		SHIPPED
	}
`
