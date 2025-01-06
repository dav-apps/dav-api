import { Express, Request, Response, raw } from "express"
import cors from "cors"
import imageType from "image-type"
import {
	getSessionFromToken,
	throwEndpointError,
	handleEndpointError
} from "../utils.js"
import { apiErrors } from "../errors.js"
import { prisma } from "../../server.js"
import { validateImageContentType } from "../services/validationService.js"
import { upload } from "../services/fileService.js"

export async function uploadProfileImageOfUser(req: Request, res: Response) {
	try {
		const accessToken = req.headers.authorization
		const session = await getSessionFromToken({
			prisma,
			token: accessToken,
			context: "endpoint"
		})

		// Make sure this was called from the website
		if (session.appId != BigInt(process.env.DAV_APPS_APP_ID)) {
			throwEndpointError(apiErrors.actionNotAllowed)
		}

		// Check if content type is supported
		const contentType = req.headers["content-type"]
		throwEndpointError(validateImageContentType(contentType))

		// Validate the image
		const imageTypeResult = await imageType(req.body)

		if (imageTypeResult == null || imageTypeResult.mime != contentType) {
			return apiErrors.imageDataInvalid
		}

		// Get the profile image of the user
		let userProfileImage = await prisma.userProfileImage.findFirst({
			where: {
				userId: session.userId
			}
		})

		if (userProfileImage == null) {
			userProfileImage = await prisma.userProfileImage.create({
				data: {
					userId: session.userId,
					ext: imageTypeResult.ext,
					mimeType: imageTypeResult.mime
				}
			})
		}

		// Upload the file
		let etag = await upload(
			`profileImages/${session.userId}`,
			req.body,
			imageTypeResult.mime
		)

		if (etag == null) {
			throwEndpointError(apiErrors.unexpectedError)
		}

		// Update the profile image with the etag
		userProfileImage = await prisma.userProfileImage.update({
			where: {
				id: userProfileImage.id
			},
			data: {
				etag
			}
		})

		res.status(200).json({})
	} catch (error) {
		handleEndpointError(res, error)
	}
}

export function setup(app: Express) {
	app.put(
		"/user/profileImage",
		raw({ type: "*/*", limit: "10mb" }),
		cors(),
		uploadProfileImageOfUser
	)
}
