import { afterEach, beforeEach, expect, it, vi } from "vitest"
import https from "node:https"
import nock from "nock"
import { S3Client } from "@aws-sdk/client-s3"
import { createFileService } from "../../src/services/fileService.js"

const clients: S3Client[] = []
beforeEach(() => {
	// Nock needs the interim response for the SDK's Expect: 100-continue handshake.
	const original = https.request
	vi.spyOn(https, "request").mockImplementation(((
		...args: Parameters<typeof https.request>
	) => {
		const req = original(...args)
		if (req.getHeader("expect") === "100-continue")
			process.nextTick(() => req.emit("continue"))
		return req
	}) as typeof https.request)
})
function files() {
	const client = new S3Client({
		endpoint: "https://storage.example.test",
		region: "fra1",
		forcePathStyle: true,
		credentials: { accessKeyId: "test", secretAccessKey: "test" },
		maxAttempts: 1
	})
	clients.push(client)
	return createFileService(client, "test-bucket")
}
afterEach(() => clients.splice(0).forEach(client => client.destroy()))

it("uploads actual bytes through the S3 SDK with the configured bucket and content type", async () => {
	const scope = nock("https://storage.example.test", {
		reqheaders: { "content-type": "text/plain", "x-amz-acl": "public-read" }
	})
		.put("/test-bucket/object", "content")
		.query(true)
		.reply(200, "", { ETag: '"test-etag"' })
	expect(
		await files().upload("object", Buffer.from("content"), "text/plain")
	).toBe('"test-etag"')
	expect(scope.isDone()).toBe(true)
})

it("returns null when S3 rejects an upload", async () => {
	vi.spyOn(console, "log").mockImplementation(() => {})
	const scope = nock("https://storage.example.test")
		.put("/test-bucket/rejected")
		.query(true)
		.reply(403)
	expect(await files().upload("rejected", Buffer.from("content"))).toBeNull()
	expect(scope.isDone()).toBe(true)
})

it("signs existing objects for the configured bucket and returns null for missing files", async () => {
	const scope = nock("https://storage.example.test")
		.head("/test-bucket/present")
		.query(true)
		.reply(200)
		.head("/test-bucket/missing")
		.query(true)
		.reply(404)
	const service = files()
	const url = new URL(await service.getFileUrl("present"))
	expect(url.pathname).toBe("/test-bucket/present")
	expect(url.searchParams.get("X-Amz-Expires")).toBe("43200")
	expect(url.searchParams.has("X-Amz-Signature")).toBe(true)
	expect(await service.getFileUrl("missing")).toBeNull()
	expect(scope.isDone()).toBe(true)
})
