export const websiteBaseUrlDevelopment = "http://localhost:3000"
export const websiteBaseUrlStaging =
	"https://dav-website-staging-knsy9.ondigitalocean.app"
export const websiteBaseUrlProduction = "https://dav-apps.tech"
export const noReplyEmailAddress = "no-reply@dav-apps.tech"
export const unconfirmedStorage = 1000000000 // 1 GB
export const freePlanStorage = 2000000000 // 2 GB
export const plusPlanStorage = 15000000000 // 15 GB
export const proPlanStorage = 50000000000 // 50 GB
export const defaultProfileImageEtag = "0x8D7C9D1558903CA"
export const sizePropertyName = "size"
export const typePropertyName = "type"
export const etagPropertyName = "etag"
export const extPropertyName = "ext"

//#region Regexes
export const urlRegex =
	/^(https?:\/\/)?(([\w.-]+(\.[\w.-]{2,4})+)|(localhost:[0-9]{3,4}))/
export const urlPathRegex = /\/.+\/?/
export const dhlTrackingCodeRegex = /^[0-9]{14,22}$/
//#endregion
