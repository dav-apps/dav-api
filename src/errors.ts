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
	oldAccessTokenUsed: {
		code: "OLD_ACCESS_TOKEN_USED",
		message: "Can't use old access token",
		status: 403
	},
	sessionExpired: {
		code: "SESSION_EXPIRED",
		message: "Session has expired and must be renewed",
		status: 403
	},
	passwordIncorrect: {
		code: "PASSWORD_INCORRECT",
		message: "Password is incorrect",
		status: 400
	},
	tableObjectHasNoPrice: {
		code: "TABLE_OBJECT_HAS_NO_PRICE",
		message: "TableObject needs a price to be purchased or ordered",
		status: 400
	},
	cannotCreateCheckoutSessionForFreePlan: {
		code: "CANNOT_CREATE_CHECKOUT_SESSION_FOR_FREE_PLAN",
		message:
			"It is only possible to create a checkout session for a paid plan",
		status: 400
	},
	userIsAlreadyConfirmed: {
		code: "USER_IS_ALREADY_CONFIRMED",
		message: "The email of the user is already confirmed",
		status: 400
	},
	userOnOrBelowGivenPlan: {
		code: "USER_IS_ON_OR_BELOW_GIVEN_PLAN",
		message: "The user is already on the given plan or on a higher plan",
		status: 422
	},
	tableObjectIsNotFree: {
		code: "TABLE_OBJECT_IS_NOT_FREE",
		message: "You can only create purchases for free table objects",
		status: 400
	},
	tableObjectIsNotFile: {
		code: "TABLE_OBJECT_IS_NOT_FILE",
		message: "TableObject is not a file",
		status: 422
	},
	appDoesNotExist: {
		code: "APP_DOES_NOT_EXIST",
		message: "App does not exist",
		status: 404
	},
	userDoesNotExist: {
		code: "USER_DOES_NOT_EXIST",
		message: "User does not exist",
		status: 404
	},
	sessionDoesNotExist: {
		code: "SESSION_DOES_NOT_EXIST",
		message: "Session does not exist",
		status: 404
	},
	devDoesNotExist: {
		code: "DEV_DOES_NOT_EXIST",
		message: "Dev does not exist",
		status: 404
	},
	tableDoesNotExist: {
		code: "TABLE_DOES_NOT_EXIST",
		message: "Table does not exist",
		status: 404
	},
	tableObjectDoesNotExist: {
		code: "TABLE_OBJECT_DOES_NOT_EXIST",
		message: "TableObject does not exist",
		status: 404
	},
	notificationDoesNotExist: {
		code: "NOTIFICATION_DOES_NOT_EXIST",
		message: "Notification does not exist",
		status: 404
	},
	orderDoesNotExist: {
		code: "ORDER_DOES_NOT_EXIST",
		message: "Order does not exist",
		status: 404
	},
	imageDataInvalid: {
		code: "IMAGE_DATA_INVALID",
		message: "The image data is not valid",
		status: 400
	},
	emailConfirmationTokenIncorrect: {
		code: "EMAIL_CONFIRMATION_TOKEN_INCORRECT",
		message: "The email confirmation token is incorrect",
		status: 400
	},
	passwordConfirmationTokenIncorrect: {
		code: "PASSWORD_CONFIRMATION_TOKEN_INCORRECT",
		message: "The password confirmation token is incorrect",
		status: 400
	},
	uuidAlreadyInUse: {
		code: "UUID_ALREADY_IN_USE",
		message: "The UUID is already in use",
		status: 409
	},
	oldEmailOfUserIsEmpty: {
		code: "OLD_EMAIL_OF_USER_IS_EMPTY",
		message: "User.oldEmail has no value",
		status: 412
	},
	newEmailOfUserIsEmpty: {
		code: "NEW_EMAIL_OF_USER_IS_EMPTY",
		message: "User.newEmail has no value",
		status: 412
	},
	newPasswordOfUserIsEmpty: {
		code: "NEW_PASSWORD_OF_USER_IS_EMPTY",
		message: "User.newPassword has no value",
		status: 412
	}
}

export const validationErrors = {
	firstNameTooShort: "FIRST_NAME_TOO_SHORT",
	firstNameTooLong: "FIRST_NAME_TOO_LONG",
	passwordTooShort: "PASSWORD_TOO_SHORT",
	passwordTooLong: "PASSWORD_TOO_LONG",
	nameTooShort: "NAME_TOO_SHORT",
	nameTooLong: "NAME_TOO_LONG",
	descriptionTooShort: "DESCRIPTION_TOO_SHORT",
	descriptionTooLong: "DESCRIPTION_TOO_LONG",
	productNameTooShort: "PRODUCT_NAME_TOO_SHORT",
	productNameTooLong: "PRODUCT_NAME_TOO_LONG",
	titleTooShort: "TITLE_TOO_SHORT",
	titleTooLong: "TITLE_TOO_LONG",
	bodyTooShort: "BODY_TOO_SHORT",
	bodyTooLong: "BODY_TOO_LONG",
	uuidInvalid: "UUID_INVALID",
	emailInvalid: "EMAIL_INVALID",
	productImageInvalid: "PRODUCT_IMAGE_INVALID",
	webLinkInvalid: "WEB_LINK_INVALID",
	googlePlayLinkInvalid: "GOOGLE_PLAY_LINK_INVALID",
	microsoftStoreLinkInvalid: "MICROSOFT_STORE_LINK_INVALID",
	successUrlInvalid: "SUCCESS_URL_INVALID",
	cancelUrlInvalid: "CANCEL_URL_INVALID",
	priceInvalid: "PRICE_INVALID",
	currencyInvalid: "CURRENCY_INVALID",
	intervalInvalid: "INTERVAL_INVALID",
	iconInvalid: "ICON_INVALID",
	imageInvalid: "IMAGE_INVALID",
	hrefInvalid: "HREF_INVALID",
	emailAlreadyInUse: "EMAIL_ALREADY_IN_USE"
}
