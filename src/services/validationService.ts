import { validationErrors } from "../errors.js"
import { urlRegex } from "../constants.js"

//#region Field validations
export function validateProductNameLength(productName: string) {
	if (productName.length < 2) {
		return validationErrors.productNameTooShort
	} else if (productName.length > 30) {
		return validationErrors.productNameTooLong
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
//#endregion
