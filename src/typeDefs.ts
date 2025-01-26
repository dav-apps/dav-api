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
		listUserSnapshots(
			start: Int
			end: Int
		): UserSnapshotList!
		retrieveUser: User
		retrieveUserById(id: Int!): User
		retrieveDev: Dev
		retrieveTable(name: String!): Table
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
			firstName: String!
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
		sendConfirmationEmailForUser(id: Int!): User!
		sendPasswordResetEmailForUser(email: String!): User!
		confirmUser(
			id: Int!
			emailConfirmationToken: String!
		): User!
		saveNewEmailOfUser(
			id: Int!
			emailConfirmationToken: String!
		): User!
		saveNewPasswordOfUser(
			id: Int!
			passwordConfirmationToken: String!
		): User!
		resetEmailOfUser(
			id: Int!
			emailConfirmationToken: String!
		): User!
		setPasswordOfUser(
			id: Int!
			password: String!
			passwordConfirmationToken: String
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
		deleteSession: SessionResult!
		updateApp(
			id: Int!
			name: String
			description: String
			published: Boolean
			webLink: String
			googlePlayLink: String
			microsoftStoreLink: String
		): App!
		createTableObject(
			uuid: String
			tableId: Int!
			file: Boolean
		): TableObject!
		deleteTableObject(uuid: String!): TableObject!
		setTableObjectPrice(
			tableObjectUuid: String!
			price: Int!
			currency: Currency!
			type: TableObjectPriceType!
		): TableObjectPrice
		createTableObjectUserAccess(
			tableObjectUuid: String!
			tableAlias: Int
		): TableObjectUserAccess!
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
		createPurchase(tableObjectUuid: String!): Purchase
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
		tables: TableList!
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

	type UserSnapshot {
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

	type UserSnapshotList {
		total: Int!
		items: [UserSnapshot!]!
	}

	type Dev {
		id: Int!
		apps: AppList!
	}

	type Provider {
		id: Int!
	}

	type User {
		id: Int!
		email: String!
		firstName: String!
		confirmed: Boolean!
		totalStorage: Float!
		usedStorage: Float!
		stripeCustomerId: String
		plan: Plan!
		subscriptionStatus: SubscriptionStatus!
		periodEnd: String
		dev: Dev
		provider: Provider
		profileImage: UserProfileImage!
		apps: AppList!
	}

	type UserProfileImage {
		url: String!
		etag: String!
	}

	type Table {
		id: Int!
		name: String!
	}

	type TableList {
		total: Int!
		items: [Table!]!
	}

	type TableObject {
		uuid: String!
		user: User!
		properties: JSON
		purchases: PurchaseList!
	}

	type TableObjectList {
		total: Int!
		items: [TableObject!]!
	}

	type TableObjectPrice {
		tableObject: TableObject!
		price: Int!
		currency: Currency!
		type: TableObjectPriceType!
	}

	type TableObjectUserAccess {
		tableAlias: Int
	}

	type Notification {
		uuid: String!
		time: String!
		interval: Int!
		title: String!
		body: String!
	}

	type Purchase {
		uuid: String!
		price: Int!
		currency: Currency!
	}

	type PurchaseList {
		total: Int!
		items: [Purchase!]!
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

	enum SubscriptionStatus {
		ACTIVE
		ENDING
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
