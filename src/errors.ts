export const apiErrors = {
	unexpectedError: {
		code: "UNEXPECTED_ERROR",
		message: "Unexpected error"
	},
	notAuthenticated: {
		code: "NOT_AUTHENTICATED",
		message: "You are not authenticated",
		status: 401
	},
	authenticationFailed: {
		code: "AUTHENTICATION_FAILED",
		message: "The authentication token is invalid",
		status: 401
	},
	actionNotAllowed: {
		code: "ACTION_NOT_ALLOWED",
		message: "Action not allowed",
		status: 403
	},
	contentTypeNotSupported: {
		code: "CONTENT_TYPE_NOT_SUPPORTED",
		message: "Content-Type not supported",
		status: 415
	},
	validationFailed: {
		code: "VALIDATION_FAILED",
		message: "Validation failed",
		status: 400
	},
	sessionEnded: {
		code: "SESSION_ENDED",
		message: "Session has ended and must be renewed",
		status: 403
	},
	tableObjectHasNoPrice: {
		code: "TABLE_OBJECT_HAS_NO_PRICE",
		message: "TableObject needs a price to be purchased or ordered",
		status: 400
	},
	devDoesNotExist: {
		code: "DEV_DOES_NOT_EXIST",
		message: "Dev does not exist",
		status: 404
	},
	tableObjectDoesNotExist: {
		code: "TABLE_OBJECT_NOT_EXISTS",
		message: "TableObject does not exist",
		status: 404
	},
	orderDoesNotExist: {
		code: "ORDER_DOES_NOT_EXIST",
		message: "Order does not exist",
		status: 404
	}
}

export const validationErrors = {
	productNameTooShort: "PRODUCT_NAME_TOO_SHORT",
	productNameTooLong: "PRODUCT_NAME_TOO_LONG",
	productImageInvalid: "PRODUCT_IMAGE_INVALID",
	successUrlInvalid: "SUCCESS_URL_INVALID",
	cancelUrlInvalid: "CANCEL_URL_INVALID",
	priceInvalid: "PRICE_INVALID",
	currencyInvalid: "CURRENCY_INVALID"
}
