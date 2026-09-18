import { Express, Request, Response, raw } from "express"
import cors from "cors"
import imageType from "image-type"
import {
	getSessionFromToken,
	throwEndpointError,
	handleEndpointError
} from "../utils.js"
import { apiErrors } from "../errors.js"
import type { AppDependencies } from "../appDependencies.js"
import { validateImageContentType } from "../services/validationService.js"

export async function uploadUserProfileImage(
	req: Request,
	res: Response,
	dependencies: AppDependencies
) {
	const { prisma, files } = dependencies
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
			throwEndpointError(apiErrors.imageDataInvalid)
		}

		// Get the profile image of the user
		let userProfileImage = await prisma.userProfileImage.findFirst({
			where: {
				userId: session.userId
			}
		})

		// Upload the file
		let etag = await files.upload(
			`profileImages/${session.userId}`,
			req.body,
			imageTypeResult.mime
		)

		if (etag == null) {
			throwEndpointError(apiErrors.unexpectedError)
		}

		// Update the profile image with the etag
		if (userProfileImage == null) {
			await prisma.userProfileImage.create({
				data: {
					userId: session.userId,
					ext: imageTypeResult.ext,
					mimeType: imageTypeResult.mime,
					etag
				}
			})
		} else
			await prisma.userProfileImage.update({
				where: {
					id: userProfileImage.id
				},
				data: {
					etag,
					ext: imageTypeResult.ext,
					mimeType: imageTypeResult.mime
				}
			})

		res.status(200).json({})
	} catch (error) {
		handleEndpointError(res, error)
	}
}

export function setup(app: Express, dependencies: AppDependencies) {
	app.put(
		"/user/profileImage",
		raw({ type: "*/*", limit: "10mb" }),
		cors(),
		(req, res) => uploadUserProfileImage(req, res, dependencies)
	)
}
