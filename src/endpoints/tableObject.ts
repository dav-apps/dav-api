import { Express, Request, Response, raw } from "express"
import cors from "cors"
import {
	getSessionFromToken,
	throwEndpointError,
	handleEndpointError
} from "../utils.js"
import { apiErrors } from "../errors.js"
import {
	sizePropertyName,
	typePropertyName,
	etagPropertyName
} from "../constants.js"
import { prisma } from "../../server.js"
import { validateContentType } from "../services/validationService.js"
import { upload } from "../services/fileService.js"

export async function uploadTableObjectFile(req: Request, res: Response) {
	try {
		const uuid = req.params.uuid
		const accessToken = req.headers.authorization
		const session = await getSessionFromToken({
			prisma,
			token: accessToken,
			context: "endpoint"
		})

		// Check if content type is supported
		const contentType = req.headers["content-type"]
		throwEndpointError(validateContentType(contentType))

		// Get the table object
		let tableObject = await prisma.tableObject.findFirst({
			where: { uuid },
			include: { table: true, tableObjectProperties: true }
		})

		if (tableObject == null) {
			throwEndpointError(apiErrors.tableObjectDoesNotExist)
		}

		// Make sure the table object belongs to the user and app of the session
		if (
			tableObject.userId != session.userId ||
			tableObject.table.appId != session.appId
		) {
			throwEndpointError(apiErrors.actionNotAllowed)
		}

		// Check if the table object is a file
		if (!tableObject.file) {
			throwEndpointError(apiErrors.tableObjectIsNotFile)
		}

		// Get the size property
		let sizeProperty = await prisma.tableObjectProperty.findFirst({
			where: {
				tableObjectId: tableObject.id,
				name: sizePropertyName
			}
		})

		const oldSize = Number(sizeProperty?.value) ?? 0

		// TODO: Check if the user has enough storage space
		let newSize = req.body.length

		// Upload the file
		let etag = await upload(
			`profileImages/${session.userId}`,
			req.body,
			contentType
		)

		if (etag == null) {
			throwEndpointError(apiErrors.unexpectedError)
		}

		// Update the size property
		if (sizeProperty != null) {
			await prisma.tableObjectProperty.update({
				where: {
					id: sizeProperty.id
				},
				data: {
					value: newSize.toString()
				}
			})
		} else {
			await prisma.tableObjectProperty.create({
				data: {
					tableObjectId: tableObject.id,
					name: sizePropertyName,
					value: newSize.toString()
				}
			})
		}

		// Update the type property
		let typeProperty = await prisma.tableObjectProperty.findFirst({
			where: {
				tableObjectId: tableObject.id,
				name: typePropertyName
			}
		})

		if (typeProperty != null) {
			await prisma.tableObjectProperty.update({
				where: {
					id: typeProperty.id
				},
				data: {
					value: contentType
				}
			})
		} else {
			await prisma.tableObjectProperty.create({
				data: {
					tableObjectId: tableObject.id,
					name: typePropertyName,
					value: contentType
				}
			})
		}

		// Update the etag property
		let etagProperty = await prisma.tableObjectProperty.findFirst({
			where: {
				tableObjectId: tableObject.id,
				name: etagPropertyName
			}
		})

		if (etagProperty != null) {
			await prisma.tableObjectProperty.update({
				where: {
					id: etagProperty.id
				},
				data: {
					value: etag
				}
			})
		} else {
			await prisma.tableObjectProperty.create({
				data: {
					tableObjectId: tableObject.id,
					name: etagPropertyName,
					value: etag
				}
			})
		}

		// TODO: Update the used storage of the user
		// TODO: Update the etag of the table object
		// TODO: Update the table object in redis
		// TODO: Save that the user was active
		// TODO: Update the etag of the table
		// TODO: Notify connected clients

		res.status(200).json({})
	} catch (error) {
		handleEndpointError(res, error)
	}
}

export function setup(app: Express) {
	app.put(
		"/tableObject/:uuid/file",
		raw({ type: "*/*", limit: "100mb" }),
		cors(),
		uploadTableObjectFile
	)
}
