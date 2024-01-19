import { PrismaClient, Dev } from "@prisma/client"
import * as crypto from "crypto"
import { GraphQLError } from "graphql"
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
