import { randomUUID, createHmac } from "node:crypto"
import bcrypt from "bcrypt"
import type { PrismaClient, Prisma, Dev } from "@prisma/client"

export const fixturePassword = "test-password-123"
const passwordHash = bcrypt.hashSync(fixturePassword, 4)

export function fixtures(prisma: PrismaClient) {
	return {
		user: (data: Prisma.UserUncheckedCreateInput = {}) =>
			prisma.user.create({
				data: {
					email: `${randomUUID()}@example.test`,
					firstName: "Test",
					confirmed: true,
					password: passwordHash,
					...data
				}
			}),
		dev: (userId: bigint) =>
			prisma.dev.create({
				data: {
					userId,
					apiKey: randomUUID(),
					secretKey: randomUUID(),
					uuid: randomUUID()
				}
			}),
		app: (devId: bigint) =>
			prisma.app.create({ data: { devId, name: randomUUID() } }),
		table: (appId: bigint) =>
			prisma.table.create({ data: { appId, name: randomUUID() } }),
		session: (
			userId: bigint,
			appId: bigint,
			data: Partial<Prisma.SessionUncheckedCreateInput> = {}
		) =>
			prisma.session.create({
				data: { userId, appId, token: randomUUID(), ...data }
			}),
		object: (
			userId: bigint,
			tableId: bigint,
			data: Partial<Prisma.TableObjectUncheckedCreateInput> = {}
		) =>
			prisma.tableObject.create({
				data: { userId, tableId, uuid: randomUUID(), ...data }
			})
	}
}

export function developerToken(dev: Dev) {
	const hmac = createHmac("sha256", dev.secretKey)
		.update(dev.uuid)
		.digest("hex")
	return `${dev.apiKey},${Buffer.from(hmac).toString("base64")}`
}

export async function seedTenants(prisma: PrismaClient) {
	const make = fixtures(prisma)
	const owner = await make.user()
	const other = await make.user()
	const admin = await make.dev(owner.id) // Production uses developer id 1 as privileged.
	const dev = await make.dev(other.id)
	const website = await make.app(admin.id) // Test setup uses DAV_APPS_APP_ID=1.
	const app = await make.app(dev.id)
	const foreignApp = await make.app(dev.id)
	const table = await make.table(app.id)
	const foreignTable = await make.table(foreignApp.id)
	const session = await make.session(owner.id, app.id)
	const otherSession = await make.session(other.id, app.id)
	const foreignSession = await make.session(owner.id, foreignApp.id)
	return {
		make,
		owner,
		other,
		admin,
		dev,
		website,
		app,
		foreignApp,
		table,
		foreignTable,
		session,
		otherSession,
		foreignSession
	}
}
