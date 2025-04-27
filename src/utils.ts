import { PrismaClient, User, Dev, TableObject } from "@prisma/client"
import * as crypto from "crypto"
import { Response } from "express"
import { GraphQLError } from "graphql"
import { DateTime, DurationLike } from "luxon"
import Stripe from "stripe"
import { RedisClientType } from "redis"
import { ApiError } from "./types.js"
import { apiErrors } from "./errors.js"
import {
	websiteBaseUrlDevelopment,
	websiteBaseUrlStaging,
	websiteBaseUrlProduction,
	unconfirmedStorage,
	freePlanStorage,
	plusPlanStorage,
	proPlanStorage
} from "./constants.js"

export function throwApiError(error: ApiError) {
	throw new GraphQLError(error.message, {
		extensions: {
			code: error.code,
			http: {
				status: 200
			}
		}
	})
}

export function throwValidationError(...errors: string[]) {
	let filteredErrors = errors.filter(e => e != null)

	if (filteredErrors.length > 0) {
		throw new GraphQLError(apiErrors.validationFailed.message, {
			extensions: {
				code: apiErrors.validationFailed.code,
				errors: filteredErrors
			}
		})
	}
}

export function throwEndpointError(error?: ApiError) {
	if (error != null) {
		throw new Error(error.code)
	}
}

export function handleEndpointError(res: Response, e: Error) {
	// Find the error by error code
	let error = Object.values(apiErrors).find(err => err.code == e.message)

	if (error != null) {
		sendEndpointError(res, error)
	} else {
		sendEndpointError(res, apiErrors.unexpectedError)
	}
}

function sendEndpointError(res: Response, error: ApiError) {
	res.status(error.status || 400).json({
		code: error.code,
		message: error.message
	})
}

export async function getDevByAuthToken(
	authToken: string,
	prisma: PrismaClient
): Promise<Dev> {
	let tokenParts = authToken.split(",")

	if (tokenParts.length == 1) {
		return null
	}

	const apiKey = tokenParts[0]
	const dev = await prisma.dev.findFirst({ where: { apiKey } })

	if (dev == null) {
		return null
	}

	const hmac = crypto
		.createHmac("sha256", dev.secretKey)
		.update(dev.uuid)
		.digest("hex")

	const signature = Buffer.from(hmac).toString("base64")

	if (signature != tokenParts[1]) {
		return null
	}

	return dev
}

export async function getSessionFromToken(params: {
	prisma: PrismaClient
	token: string
	checkRenew?: boolean
	context?: "graphql" | "endpoint"
}) {
	let checkRenew = params.checkRenew ?? true
	let context = params.context ?? "graphql"

	let session = await params.prisma.session.findFirst({
		where: { token: params.token }
	})

	if (session == null) {
		// Check if there is a session with old_token = token
		session = await params.prisma.session.findFirst({
			where: { oldToken: params.token }
		})

		if (session == null) {
			// Session does not exist
			if (context == "endpoint") {
				throwEndpointError(apiErrors.sessionDoesNotExist)
			} else {
				throwApiError(apiErrors.sessionDoesNotExist)
			}
		} else {
			// The old token was used
			// Delete the session, as the token may be stolen
			params.prisma.session.delete({ where: { id: session.id } })

			if (context == "endpoint") {
				throwEndpointError(apiErrors.oldAccessTokenUsed)
			} else {
				throwApiError(apiErrors.oldAccessTokenUsed)
			}
		}
	} else if (checkRenew) {
		// Check if the session needs to be renewed
		if (
			process.env.ENV == "production" &&
			DateTime.fromJSDate(session.updatedAt) <
				DateTime.now().minus({ days: 1 })
		) {
			// Session has expired
			if (context == "endpoint") {
				throwEndpointError(apiErrors.sessionExpired)
			} else {
				throwApiError(apiErrors.sessionExpired)
			}
		}
	}

	return session
}

export function userWasActive(
	lastActive: Date,
	timeframe: "day" | "week" | "month" | "year"
): boolean {
	if (lastActive == null) return false
	let duration: DurationLike = { years: 1 }

	switch (timeframe) {
		case "day":
			duration = { days: 1 }
			break
		case "week":
			duration = { weeks: 1 }
			break
		case "month":
			duration = { months: 1 }
			break
	}

	return DateTime.fromJSDate(lastActive) > DateTime.now().minus(duration)
}

export async function getPropertiesOfTableObject(
	prisma: PrismaClient,
	tableObjectId: bigint
): Promise<{ [key: string]: string | number | boolean }> {
	let properties = await prisma.tableObjectProperty.findMany({
		where: {
			tableObjectId: tableObjectId
		}
	})

	let result = {}

	for (let property of properties) {
		result[property.name] = property.value
	}

	return result
}

export async function saveTableObjectInRedis(
	prisma: PrismaClient,
	redis: RedisClientType,
	obj: TableObject
) {
	try {
		let objData = {
			id: obj.id,
			user_id: obj.userId,
			table_id: obj.tableId,
			file: obj.file,
			etag: obj.etag,
			properties: {}
		}

		// Find the existing properties
		let propertyKeys = await redis.keys(
			`table_object_property:${obj.userId}:${obj.tableId}:${obj.uuid}:*`
		)

		let tableObjectProperties = await prisma.tableObjectProperty.findMany({
			where: { tableObjectId: obj.id }
		})

		for (let prop of tableObjectProperties) {
			let propType = await prisma.tablePropertyType.findFirst({
				where: { tableId: obj.tableId, name: prop.name }
			})

			let type = 0

			if (propType != null) {
				type = propType.dataType
			}

			let value: any = prop.value

			if (type == 1) {
				value = value == "true"
			} else if (type == 2 || type == 3) {
				value = Number(value)
			}

			objData.properties[prop.name] = value

			// Save the property
			let key = `table_object_property:${obj.userId}:${obj.tableId}:${obj.uuid}:${prop.name}:${type}`
			await redis.set(key, value)
			delete propertyKeys[key]
		}

		await redis.set(`table_object:${obj.uuid}`, JSON.stringify(objData))

		// Remove old properties
		for (let key of propertyKeys) {
			await redis.del(key)
		}
	} catch (error) {
		// Create a new RedisTableObjectOperation
		await prisma.redisTableObjectOperation.create({
			data: { tableObjectUuid: obj.uuid, operation: "save" }
		})
	}
}

export async function removeTableObjectFromRedis(
	prisma: PrismaClient,
	redis: RedisClientType,
	tableObject: TableObject
) {
	try {
		await redis.del(`table_object:${tableObject.uuid}`)

		let propertyKeys = await redis.keys(
			`table_object_property:${tableObject.userId}:${tableObject.tableId}:${tableObject.uuid}:*`
		)

		for (let key of propertyKeys) {
			await redis.del(key)
		}
	} catch (error) {
		// Create a new RedisTableObjectOperation
		await prisma.redisTableObjectOperation.create({
			data: { tableObjectUuid: tableObject.uuid, operation: "delete" }
		})
	}
}

export async function updateAppUser(
	prisma: PrismaClient,
	userId: bigint,
	appId: bigint
) {
	let appUser = await prisma.appUser.findFirst({
		where: { userId: userId, appId: appId }
	})

	if (appUser == null) {
		await prisma.appUser.create({
			data: {
				userId: userId,
				appId: appId,
				usedStorage: BigInt(0),
				lastActive: new Date()
			}
		})
	} else {
		await prisma.appUser.update({
			where: { id: appUser.id },
			data: {
				lastActive: new Date()
			}
		})
	}
}

export function getTotalStorageOfUser(user: User): bigint {
	if (!user.confirmed) {
		return BigInt(unconfirmedStorage)
	}

	switch (user.plan) {
		case 1:
			return BigInt(plusPlanStorage)
		case 2:
			return BigInt(proPlanStorage)
		default:
			return BigInt(freePlanStorage)
	}
}

export async function createTablePropertyType(
	prisma: PrismaClient,
	tableId: bigint,
	name: string,
	value: string | number | boolean
) {
	// Check if a property type with the name already exists
	let existingPropertyTypeCount = await prisma.tablePropertyType.count({
		where: { tableId, name }
	})

	if (existingPropertyTypeCount > 0) return

	let dataType = 0

	if (typeof value == "boolean") dataType = 1
	else if (typeof value == "number") dataType = 2

	await prisma.tablePropertyType.create({
		data: { tableId, name, dataType }
	})
}

export async function updateTableObjectEtag(
	prisma: PrismaClient,
	tableObject: TableObject
): Promise<string> {
	// uuid,property1Name:property1Value,property2Name:property2Value,...
	let etagString = tableObject.uuid

	let tableObjectProperties = await prisma.tableObjectProperty.findMany({
		where: { tableObjectId: tableObject.id }
	})

	for (let prop of tableObjectProperties) {
		etagString += `,${prop.name}:${prop.value}`
	}

	const etag = crypto.createHash("sha256").update(etagString).digest("hex")

	await prisma.tableObject.update({
		where: { id: tableObject.id },
		data: {
			etag
		}
	})

	return etag
}

export async function updateTableEtag(
	prisma: PrismaClient,
	userId: bigint,
	tableId: bigint
): Promise<string> {
	let tableEtag = await prisma.tableEtag.findFirst({
		where: {
			userId,
			tableId
		}
	})

	const newEtag = generateHex(10)

	if (tableEtag == null) {
		await prisma.tableEtag.create({
			data: {
				userId,
				tableId,
				etag: newEtag
			}
		})
	} else {
		await prisma.tableEtag.update({
			where: {
				id: tableEtag.id
			},
			data: {
				etag: newEtag
			}
		})
	}

	return newEtag
}

export async function updateUsedStorage(
	prisma: PrismaClient,
	userId: bigint,
	appId: bigint,
	fileSizeDiff: number
) {
	// Update the used storage of the user
	const user = await prisma.user.findFirst({
		where: { id: userId }
	})

	if (user != null) {
		await prisma.user.update({
			where: { id: userId },
			data: {
				usedStorage: user.usedStorage + BigInt(fileSizeDiff)
			}
		})
	}

	// Update the used storage of the app user
	const appUser = await prisma.appUser.findFirst({
		where: { userId, appId }
	})

	if (appUser != null) {
		await prisma.appUser.update({
			where: { id: appUser.id },
			data: {
				usedStorage: appUser.usedStorage + BigInt(fileSizeDiff)
			}
		})
	}
}

export async function updateEmailOfStripeCustomer(user: User, stripe: Stripe) {
	if (user.stripeCustomerId == null) return

	await stripe.customers.update(user.stripeCustomerId, {
		email: user.email
	})
}

export function getWebsiteBaseUrl() {
	switch (process.env.ENV) {
		case "staging":
			return websiteBaseUrlStaging
		case "production":
			return websiteBaseUrlProduction
		default:
			return websiteBaseUrlDevelopment
	}
}

export function getSpacesBucketName() {
	if (process.env.ENV == "production") {
		return "dav-backend"
	} else {
		return "dav-backend-dev"
	}
}

export function getSpacesFileLink(key: string) {
	return `https://${getSpacesBucketName()}.fra1.cdn.digitaloceanspaces.com/${key}`
}

export function generateHex(length: number): string {
	const bytes = new Uint8Array(length)
	crypto.getRandomValues(bytes)

	return Array.from(bytes)
		.map(byte => byte.toString(16).padStart(2, "0"))
		.join("")
}
