import { User, TableObject, Purchase, Table } from "@prisma/client"
import {
	validatePropertyNameLength,
	validateExtLength
} from "../services/validationService.js"
import { getFileUrl } from "../services/fileService.js"
import { ResolverContext, List } from "../types.js"
import { apiErrors } from "../errors.js"
import { extPropertyName } from "../constants.js"
import {
	throwApiError,
	getDevByAuthToken,
	getSessionFromToken,
	throwValidationError,
	createTablePropertyType,
	updateTableObjectEtag,
	updateTableEtag
} from "../utils.js"

export async function retrieveTableObject(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<TableObject> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.uuid },
		include: { table: true }
	})

	if (tableObject == null) {
		return null
	}

	// Check if the user can access the table object
	let tableId = tableObject.tableId
	const userAccess = await context.prisma.tableObjectUserAccess.findFirst({
		where: { userId: session.userId, tableObjectId: tableObject.id }
	})

	if (userAccess == null) {
		// Make sure the table object belongs to the user and app
		if (
			tableObject.userId != session.userId ||
			tableObject.table.appId != session.appId
		) {
			throwApiError(apiErrors.actionNotAllowed)
		}
	} else {
		if (userAccess.tableAlias != null) {
			tableId = userAccess.tableAlias
		}

		tableObject.tableId = tableId
	}

	return tableObject
}

export async function listTableObjectsByProperty(
	parent: any,
	args: {
		userId?: number
		appId: number
		tableName?: string
		propertyName: string
		propertyValue: string
		exact?: boolean
		limit?: number
		offset?: number
	},
	context: ResolverContext
): Promise<List<TableObject>> {
	const authToken = context.authorization

	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	if (authToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the dev
	const dev = await getDevByAuthToken(authToken, context.prisma)

	if (dev == null) {
		throwApiError(apiErrors.authenticationFailed)
	}

	if (dev.id != BigInt(1)) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Find the table
	let table = null

	if (args.tableName != null) {
		table = await context.prisma.table.findFirst({
			where: { appId: args.appId, name: args.tableName }
		})
	}

	// Find the user
	let user = null

	if (args.userId != null) {
		user = await context.prisma.user.findFirst({ where: { id: args.userId } })
	}

	let exact = args.exact ?? true

	let where = {
		tableId: table?.id,
		userId: user?.id,
		tableObjectProperties: {
			some: {
				name: args.propertyName,
				value: exact ? args.propertyValue : { contains: args.propertyValue }
			}
		}
	}

	const [total, items] = await context.prisma.$transaction([
		context.prisma.tableObject.count({ where }),
		context.prisma.tableObject.findMany({ where, take, skip })
	])

	return {
		total,
		items
	}
}

export async function createTableObject(
	parent: any,
	args: {
		uuid?: string
		tableId: number
		file: boolean
		ext?: string
		properties: { [key: string]: string | number | boolean }
	},
	context: ResolverContext
): Promise<TableObject> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table
	const table = await context.prisma.table.findFirst({
		where: { id: args.tableId }
	})

	if (table == null) {
		throwApiError(apiErrors.tableDoesNotExist)
	}

	// Check if the table belongs to the app of the session
	if (table.appId != session.appId) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// Get the properties
	if (args.properties != null && !args.file) {
		// Validate the properties
		for (let key of Object.keys(args.properties)) {
			const value = args.properties[key]

			let errors: string[] = [validatePropertyNameLength(key)]

			if (typeof value == "string") {
				errors.push(validatePropertyNameLength(value))
			}

			throwValidationError(...errors)
		}
	}

	// Create the table object
	let uuid = args.uuid ?? crypto.randomUUID()

	// Check if the uuid is already taken
	let existingTableObject = await context.prisma.tableObject.findFirst({
		where: { uuid }
	})

	if (existingTableObject != null) {
		throwApiError(apiErrors.uuidAlreadyInUse)
	}

	const tableObject = await context.prisma.tableObject.create({
		data: {
			uuid,
			userId: session.userId,
			tableId: args.tableId,
			file: args.file ?? false
		}
	})

	if (args.properties != null && !args.file) {
		// Create the table object properties
		for (let key of Object.keys(args.properties)) {
			const value = args.properties[key]

			await createTablePropertyType(context.prisma, table.id, key, value)

			let bla = await context.prisma.tableObjectProperty.create({
				data: {
					tableObjectId: tableObject.id,
					name: key,
					value: value.toString()
				}
			})
		}
	}

	if (args.file && args.ext != null) {
		// Validate the ext
		throwValidationError(validateExtLength(args.ext))

		// Create the ext property
		await context.prisma.tableObjectProperty.create({
			data: {
				tableObjectId: tableObject.id,
				name: extPropertyName,
				value: args.ext
			}
		})
	}

	// Update the etag of the table object
	await updateTableObjectEtag(context.prisma, tableObject)

	// TODO: Save the table object in redis
	// TODO: Save that the user was active
	// TODO: Save that the user uses the app

	// Update the etag of the table
	await updateTableEtag(
		context.prisma,
		tableObject.userId,
		tableObject.tableId
	)

	// TODO: Notify connected clients

	return tableObject
}

export async function updateTableObject(
	parent: any,
	args: {
		uuid: string
		ext?: string
		properties?: { [key: string]: string | number | boolean }
	},
	context: ResolverContext
): Promise<TableObject> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.uuid },
		include: { table: true }
	})

	if (tableObject == null) {
		throwApiError(apiErrors.tableObjectDoesNotExist)
	}

	if (
		tableObject.userId != session.userId ||
		tableObject.table.appId != session.appId
	) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	if (tableObject.file && args.ext != null) {
		// Validate the ext
		throwValidationError(validateExtLength(args.ext))

		// Try to find the table object property
		const extProperty = await context.prisma.tableObjectProperty.findFirst({
			where: { tableObjectId: tableObject.id, name: extPropertyName }
		})

		if (extProperty == null) {
			// Create the ext property
			await context.prisma.tableObjectProperty.create({
				data: {
					tableObjectId: tableObject.id,
					name: extPropertyName,
					value: args.ext
				}
			})
		} else {
			// Update the ext property
			await context.prisma.tableObjectProperty.update({
				where: { id: extProperty.id },
				data: { value: args.ext }
			})
		}
	}

	if (args.properties != null) {
		// Validate the properties
		for (let key of Object.keys(args.properties)) {
			const value = args.properties[key]

			let errors: string[] = [validatePropertyNameLength(key)]

			if (typeof value == "string") {
				errors.push(validatePropertyNameLength(value))
			}

			throwValidationError(...errors)
		}

		// Update the table object properties
		for (let key of Object.keys(args.properties)) {
			const value = args.properties[key]

			// Try to find the table object property
			const property = await context.prisma.tableObjectProperty.findFirst({
				where: { tableObjectId: tableObject.id, name: key }
			})

			if (property == null && value != null) {
				await createTablePropertyType(
					context.prisma,
					tableObject.table.id,
					key,
					value
				)

				// Create the table object property
				await context.prisma.tableObjectProperty.create({
					data: {
						tableObjectId: tableObject.id,
						name: key,
						value: value.toString()
					}
				})
			} else if (property != null && value == null) {
				// Delete the table object property
				await context.prisma.tableObjectProperty.delete({
					where: { id: property.id }
				})
			} else if (property != null && value != null) {
				// Update the table object property
				await context.prisma.tableObjectProperty.update({
					where: { id: property.id },
					data: { value: value.toString() }
				})
			}
		}
	}

	// Update the etag of the table object
	await updateTableObjectEtag(context.prisma, tableObject)

	// TODO: Save the table object in redis
	// TODO: Save that the user was active

	// Update the etag of the table
	await updateTableEtag(
		context.prisma,
		tableObject.userId,
		tableObject.tableId
	)

	// TODO: Notify connected clients

	return tableObject
}

export async function deleteTableObject(
	parent: any,
	args: {
		uuid: string
	},
	context: ResolverContext
): Promise<TableObject> {
	const accessToken = context.authorization

	if (accessToken == null) {
		throwApiError(apiErrors.notAuthenticated)
	}

	// Get the session
	const session = await getSessionFromToken({
		token: accessToken,
		prisma: context.prisma
	})

	// Get the table object
	const tableObject = await context.prisma.tableObject.findFirst({
		where: { uuid: args.uuid },
		include: { table: true }
	})

	// Make sure the table object belongs to the user and app of the session
	if (
		tableObject.userId != session.userId ||
		tableObject.table.appId != session.appId
	) {
		throwApiError(apiErrors.actionNotAllowed)
	}

	// TODO: Save that the user was active
	// TODO: Delete the file if the table object has one
	// TODO: Remove the table object from redis

	// Update the etag of the table
	await updateTableEtag(
		context.prisma,
		tableObject.userId,
		tableObject.tableId
	)

	// TODO: Notify connected clients

	// Delete the table object
	return await context.prisma.tableObject.delete({
		where: { id: tableObject.id }
	})
}

export async function user(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<User> {
	return await context.prisma.user.findFirst({
		where: { id: tableObject.userId }
	})
}

export async function table(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<Table> {
	return await context.prisma.table.findFirst({
		where: { id: tableObject.tableId }
	})
}

export async function fileUrl(tableObject: TableObject): Promise<string> {
	return await getFileUrl(tableObject.uuid)
}

export async function properties(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<{ [key: string]: string | number | boolean }> {
	let properties = await context.prisma.tableObjectProperty.findMany({
		where: {
			tableObjectId: tableObject.id
		}
	})

	let result = {}

	for (let property of properties) {
		result[property.name] = property.value
	}

	return result
}

export async function purchases(
	tableObject: TableObject,
	args: any,
	context: ResolverContext
): Promise<List<Purchase>> {
	const purchases = await context.prisma.tableObjectPurchase.findMany({
		where: { tableObjectId: tableObject.id },
		include: { purchase: true }
	})

	return {
		total: purchases.length,
		items: purchases.map(tableObjectPurchase => tableObjectPurchase.purchase)
	}
}
