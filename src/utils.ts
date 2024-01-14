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
