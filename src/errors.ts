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
	tableObjectDoesNotExist: {
		code: "TABLE_OBJECT_NOT_EXISTS",
		message: "TableObject does not exist",
		status: 404
	}
}
