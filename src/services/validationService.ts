import * as validator from "validator"
import { validationErrors } from "../errors.js"
import { urlRegex } from "../constants.js"

//#region Field validations
export function validateProductNameLength(productName: string) {
	if (productName.length < 2) {
		return validationErrors.productNameTooShort
	} else if (productName.length > 60) {
		return validationErrors.productNameTooLong
	}
}

export function validateTitleLength(title: string) {
	if (title.length < 2) {
		return validationErrors.titleTooShort
	} else if (title.length > 40) {
		return validationErrors.titleTooLong
	}
}

export function validateBodyLength(body: string) {
	if (body.length < 2) {
		return validationErrors.bodyTooShort
	} else if (body.length > 150) {
		return validationErrors.bodyTooLong
	}
}

export function validateUuid(uuid: string) {
	if (!validator.isUUID(uuid)) {
		return validationErrors.uuidInvalid
	}
}

export function validateProductImage(productImage: string) {
	if (productImage.length > 0 && !urlRegex.test(productImage)) {
		return validationErrors.productImageInvalid
	}
}

export function validateSuccessUrl(successUrl: string) {
	if (successUrl.length > 0 && !urlRegex.test(successUrl)) {
		return validationErrors.successUrlInvalid
	}
}

export function validateCancelUrl(cancelUrl: string) {
	if (cancelUrl.length > 0 && !urlRegex.test(cancelUrl)) {
		return validationErrors.cancelUrlInvalid
	}
}

export function validatePrice(price: number) {
	if (price < 0 || price > 100000) {
		return validationErrors.priceInvalid
	}
}

export function validateInterval(interval: number) {
	if (interval < 0) {
		return validationErrors.intervalInvalid
	}
}
//#endregion
