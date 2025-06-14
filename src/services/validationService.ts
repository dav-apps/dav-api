import validator from "validator"
import { apiErrors, validationErrors } from "../errors.js"
import { urlRegex, urlPathRegex, dhlTrackingCodeRegex } from "../constants.js"

//#region Endpoint validations
export function validateImageContentType(contentType: string) {
	if (contentType != "image/png" && contentType != "image/jpeg") {
		return apiErrors.contentTypeNotSupported
	}
}

export function validateContentType(contentType: string) {
	if (
		contentType == null ||
		contentType == "application/x-www-form-urlencoded"
	) {
		return apiErrors.contentTypeNotSupported
	}
}
//#endregion

//#region Field validations
export function validateFirstNameLength(firstName: string) {
	if (firstName.length < 2) {
		return validationErrors.firstNameTooShort
	} else if (firstName.length > 20) {
		return validationErrors.firstNameTooLong
	}
}

export function validatePasswordLength(password: string) {
	if (password.length < 7) {
		return validationErrors.passwordTooShort
	} else if (password.length > 25) {
		return validationErrors.passwordTooLong
	}
}

export function validateNameLength(name: string) {
	if (name.length < 2) {
		return validationErrors.nameTooShort
	} else if (name.length > 20) {
		return validationErrors.nameTooLong
	}
}

export function validateDescriptionLength(description: string) {
	if (description.length < 2) {
		return validationErrors.descriptionTooShort
	} else if (description.length > 200) {
		return validationErrors.descriptionTooLong
	}
}

export function validatePropertyNameLength(name: string) {
	if (name.length < 2) {
		return validationErrors.propertyNameTooShort
	} else if (name.length > 100) {
		return validationErrors.propertyNameTooLong
	}
}

export function validatePropertyValueLength(value: string) {
	if (value.length > 65000) {
		return validationErrors.propertyValueTooLong
	}
}

export function validateExtLength(ext: string) {
	if (ext.length < 1) {
		return validationErrors.extTooShort
	} else if (ext.length > 5) {
		return validationErrors.extTooLong
	}
}

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

export function validateEndpointLength(endpoint: string) {
	if (endpoint.length < 1) {
		return validationErrors.endpointTooShort
	} else if (endpoint.length > 10000) {
		return validationErrors.endpointTooLong
	}
}

export function validateP256dhLength(p256dh: string) {
	if (p256dh.length < 1) {
		return validationErrors.p256dhTooShort
	} else if (p256dh.length > 250) {
		return validationErrors.p256dhTooLong
	}
}

export function validateAuthLength(auth: string) {
	if (auth.length < 1) {
		return validationErrors.authTooShort
	} else if (auth.length > 250) {
		return validationErrors.authTooLong
	}
}

export function validateUuid(uuid: string) {
	if (!validator.isUUID(uuid)) {
		return validationErrors.uuidInvalid
	}
}

export function validateEmail(email: string) {
	if (!validator.isEmail(email)) {
		return validationErrors.emailInvalid
	}
}

export function validateProductImage(productImage: string) {
	if (productImage.length > 0 && !urlRegex.test(productImage)) {
		return validationErrors.productImageInvalid
	}
}

export function validateWebLink(webLink: string) {
	if (webLink.length > 0 && !urlRegex.test(webLink)) {
		return validationErrors.webLinkInvalid
	}
}

export function validateGooglePlayLink(googlePlayLink: string) {
	if (googlePlayLink.length > 0 && !urlRegex.test(googlePlayLink)) {
		return validationErrors.googlePlayLinkInvalid
	}
}

export function validateMicrosoftStoreLink(microsoftStoreLink: string) {
	if (microsoftStoreLink.length > 0 && !urlRegex.test(microsoftStoreLink)) {
		return validationErrors.microsoftStoreLinkInvalid
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

export function validateIcon(icon: string) {
	if (icon.length > 0 && !urlRegex.test(icon) && !urlPathRegex.test(icon)) {
		return validationErrors.iconInvalid
	}
}

export function validateImage(image: string) {
	if (image.length > 0 && !urlRegex.test(image) && !urlPathRegex.test(image)) {
		return validationErrors.imageInvalid
	}
}

export function validateHref(href: string) {
	if (href.length > 0 && !urlRegex.test(href) && !urlPathRegex.test(href)) {
		return validationErrors.hrefInvalid
	}
}

export function validateDhlTrackingCode(dhlTrackingCode: string) {
	if (
		dhlTrackingCode.length > 0 &&
		!dhlTrackingCodeRegex.test(dhlTrackingCode)
	) {
		return validationErrors.dhlTrackingCodeInvalid
	}
}
//#endregion
