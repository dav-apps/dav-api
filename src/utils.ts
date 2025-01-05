import { PrismaClient, Dev, TableObject } from "@prisma/client"
import * as crypto from "crypto"
import { GraphQLError } from "graphql"
import { DateTime, DurationLike } from "luxon"
import { prisma, redis } from "../server.js"
import { ApiError } from "./types.js"
import { apiErrors } from "./errors.js"

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
	token: string
	checkRenew?: boolean
	prisma: PrismaClient
}) {
	let checkRenew = params.checkRenew ?? true

	let session = await prisma.session.findFirst({
		where: { token: params.token }
	})

	if (session == null) {
		// Check if there is a session with old_token = token
		session = await prisma.session.findFirst({
			where: { oldToken: params.token }
		})

		if (session == null) {
			// Session does not exist
			throwApiError(apiErrors.sessionDoesNotExist)
		} else {
			// The old token was used
			// Delete the session, as the token may be stolen
			prisma.session.delete({ where: { id: session.id } })
			throwApiError(apiErrors.oldAccessTokenUsed)
		}
	} else if (checkRenew) {
		// Check if the session needs to be renewed
		if (
			process.env.ENV == "production" &&
			DateTime.fromJSDate(session.updatedAt) <
				DateTime.now().minus({ days: 1 })
		) {
			// Session has ended
			throwApiError(apiErrors.sessionEnded)
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

export async function saveTableObjectInRedis(obj: TableObject) {
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

export function generateHex(length: number): string {
	const bytes = new Uint8Array(length)
	crypto.getRandomValues(bytes)

	return Array.from(bytes)
		.map(byte => byte.toString(16).padStart(2, "0"))
		.join("")
}
