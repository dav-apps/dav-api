import { expect, it, vi } from "vitest"
import request from "supertest"
import { businessSuite } from "../helpers/business.js"
const s = businessSuite()

it("rolls back upload metadata and quota when a database operation fails after remote storage", async () => {
	const { h, t } = s
	vi.spyOn(console, "error").mockImplementation(() => {})
	const object = await t.make.object(t.owner.id, t.table.id, { file: true })
	h.files.upload.mockResolvedValue("etag")
	let fail = true
	const stopIntercepting = h.intercept(({ model, operation, args }) => {
		if (
			fail &&
			model === "TableObjectProperty" &&
			operation === "create" &&
			(args as { data: { name: string } }).data.name === "type"
		)
			throw new Error("Injected database failure")
	})
	try {
		const r = await request(h.app)
			.put(`/tableObject/${object.uuid}/file`)
			.set("Authorization", t.session.token)
			.set("Content-Type", "text/plain")
			.send("content")
			.expect(400)
		expect(r.body.code).toBe("UNEXPECTED_ERROR")
		expect(h.files.upload).toHaveBeenCalledTimes(1)
		expect(await h.prisma.tableObjectProperty.count()).toBe(0)
		expect(
			(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
				.usedStorage
		).toBe(0n)
		expect(await h.redis.dbSize()).toBe(0)
	} finally {
		fail = false
		stopIntercepting()
	}
})

it("rejects invalid file extensions before creating an object", async () => {
	const { h, t } = s
	const r = await h.execute(
		'mutation($table: Int!) { createTableObject(tableId: $table, file: true, ext: "toolong") { uuid } }',
		{ table: Number(t.table.id) },
		t.session.token
	)
	expect(r.errors?.[0].extensions.code).toBe("VALIDATION_FAILED")
	expect(await h.prisma.tableObject.count()).toBe(0)
	expect(await h.redis.dbSize()).toBe(0)
})

it("releases storage and removes metadata and cache when deleting a file", async () => {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id, { file: true })
	await h.prisma.appUser.create({
		data: { userId: t.owner.id, appId: t.app.id }
	})
	h.files.upload.mockResolvedValue("etag")
	h.files.remove.mockResolvedValue(undefined)
	await request(h.app)
		.put(`/tableObject/${object.uuid}/file`)
		.set("Authorization", t.session.token)
		.set("Content-Type", "text/plain")
		.send("content")
		.expect(200)
	const r = await h.execute(
		"mutation($uuid: String!) { deleteTableObject(uuid: $uuid) { uuid } }",
		{ uuid: object.uuid },
		t.session.token
	)
	expect(r.errors).toBeUndefined()
	expect(h.files.remove).toHaveBeenCalledWith(object.uuid)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
			.usedStorage
	).toBe(0n)
	expect((await h.prisma.appUser.findFirst()).usedStorage).toBe(0n)
	expect(await h.prisma.tableObjectProperty.count()).toBe(0)
	expect(await h.redis.dbSize()).toBe(0)
})
const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
	"base64"
)

it("serializes parallel uploads against the user's remaining quota", async () => {
	const { h, t } = s
	vi.spyOn(console, "error").mockImplementation(() => {})
	const a = await t.make.object(t.owner.id, t.table.id, { file: true })
	const b = await t.make.object(t.owner.id, t.table.id, { file: true })
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { usedStorage: 1999999999n }
	})
	h.files.upload.mockImplementation(async () => {
		// Model a slow object-store response so concurrent requests overlap.
		await new Promise(resolve => setTimeout(resolve, 50))
		return "etag"
	})
	const results = await Promise.all(
		[a, b].map(o =>
			request(h.app)
				.put(`/tableObject/${o.uuid}/file`)
				.set("Authorization", t.session.token)
				.set("Content-Type", "text/plain")
				.send("x")
		)
	)
	expect(results.map(r => r.status).sort()).toEqual([200, 400])
	expect(h.files.upload).toHaveBeenCalledTimes(1)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
			.usedStorage
	).toBe(2000000000n)
})

it("uploads and replaces a file using the size delta and updates both storage counters", async () => {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id, { file: true })
	await h.prisma.appUser.create({
		data: { userId: t.owner.id, appId: t.app.id }
	})
	h.files.upload.mockResolvedValue('"remote-etag"')
	for (const content of ["initial-content", "short"]) {
		const r = await request(h.app)
			.put(`/tableObject/${object.uuid}/file`)
			.set("Authorization", `Bearer ${t.session.token}`)
			.set("Content-Type", "text/plain")
			.send(content)
			.expect(200)
		expect(r.body.properties).toMatchObject({
			size: String(content.length),
			type: "text/plain",
			etag: '"remote-etag"'
		})
		expect(
			(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
				.usedStorage
		).toBe(BigInt(content.length))
		expect((await h.prisma.appUser.findFirst()).usedStorage).toBe(
			BigInt(content.length)
		)
		const stored = await h.prisma.tableObject.findUnique({
			where: { id: object.id }
		})
		expect(
			JSON.parse(String(await h.redis.get(`table_object:${object.uuid}`)))
				.etag
		).toBe(stored.etag)
	}
})

it.each(["quota", "user", "app", "storage", "anonymous"])(
	"rejects a %s upload without metadata, quota or cache changes",
	async mode => {
		const { h, t } = s
		vi.spyOn(console, "error").mockImplementation(() => {})
		const object = await t.make.object(t.owner.id, t.table.id, { file: true })
		if (mode === "quota")
			await h.prisma.user.update({
				where: { id: t.owner.id },
				data: { usedStorage: 2000000000n }
			})
		const before = await h.prisma.user.findUnique({
			where: { id: t.owner.id }
		})
		h.files.upload.mockResolvedValue(null)
		let r = request(h.app)
			.put(`/tableObject/${object.uuid}/file`)
			.set("Content-Type", "text/plain")
		if (mode !== "anonymous")
			r = r.set(
				"Authorization",
				(mode === "user"
					? t.otherSession
					: mode === "app"
						? t.foreignSession
						: t.session
				).token
			)
		const response = await r.send("content").timeout(2000)
		expect(response.body.code).toBe(
			{
				quota: "NOT_ENOUGH_STORAGE_SPACE",
				user: "ACTION_NOT_ALLOWED",
				app: "ACTION_NOT_ALLOWED",
				storage: "UNEXPECTED_ERROR",
				anonymous: "NOT_AUTHENTICATED"
			}[mode]
		)
		expect(await h.prisma.tableObjectProperty.count()).toBe(0)
		expect(
			await h.prisma.tableObject.findUnique({ where: { id: object.id } })
		).toEqual(object)
		expect(
			await h.prisma.user.findUnique({ where: { id: t.owner.id } })
		).toEqual(before)
		expect(await h.redis.dbSize()).toBe(0)
		if (mode !== "storage") expect(h.files.upload).not.toHaveBeenCalled()
	}
)

it("accepts the exact quota boundary and honours ignoreFileSize", async () => {
	const { h, t } = s
	const object = await t.make.object(t.owner.id, t.table.id, { file: true })
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { usedStorage: 1999999999n }
	})
	h.files.upload.mockResolvedValue("etag")
	await request(h.app)
		.put(`/tableObject/${object.uuid}/file`)
		.set("Authorization", t.session.token)
		.set("Content-Type", "text/plain")
		.send("x")
		.expect(200)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
			.usedStorage
	).toBe(2000000000n)
	await h.prisma.table.update({
		where: { id: t.table.id },
		data: { ignoreFileSize: true }
	})
	await request(h.app)
		.put(`/tableObject/${object.uuid}/file`)
		.set("Authorization", t.session.token)
		.set("Content-Type", "text/plain")
		.send("larger")
		.expect(200)
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } }))
			.usedStorage
	).toBe(2000000000n)
})

it.each(["invalid", "mismatch", "storage"])(
	"does not leave profile rows after %s image upload",
	async mode => {
		const { h, t } = s
		const website = await t.make.session(t.owner.id, t.website.id)
		h.files.upload.mockResolvedValue(null)
		const r = await request(h.app)
			.put("/user/profileImage")
			.set("Authorization", website.token)
			.set("Content-Type", mode === "mismatch" ? "image/jpeg" : "image/png")
			.send(mode === "invalid" ? Buffer.from("not-an-image") : png)
			.timeout(1500)
		expect(r.body.code).toBe(
			mode === "storage" ? "UNEXPECTED_ERROR" : "IMAGE_DATA_INVALID"
		)
		expect(await h.prisma.userProfileImage.count()).toBe(0)
	}
)

it("stores a real PNG profile image only after successful remote upload", async () => {
	const { h, t } = s
	const website = await t.make.session(t.owner.id, t.website.id)
	h.files.upload.mockResolvedValue("png-etag")
	await request(h.app)
		.put("/user/profileImage")
		.set("Authorization", website.token)
		.set("Content-Type", "image/png")
		.send(png)
		.expect(200)
	expect(await h.prisma.userProfileImage.findFirst()).toMatchObject({
		userId: t.owner.id,
		mimeType: "image/png",
		ext: "png",
		etag: "png-etag"
	})
})
