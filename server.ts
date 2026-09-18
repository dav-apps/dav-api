import "dotenv/config"
import { createRedisClient } from "./src/redis.js"
import { S3Client } from "@aws-sdk/client-s3"
import Stripe from "stripe"
import { Resend } from "resend"
import axios from "axios"
import webPush from "web-push"
import type { AddressInfo } from "node:net"
import { createApp } from "./src/app.js"
import { createFileService } from "./src/services/fileService.js"
import { getSpacesBucketName } from "./src/utils.js"
import { setupTasks } from "./src/tasks.js"
import { createPrismaClient } from "./src/prisma.js"

const port = Number(process.env.PORT ?? 4000)
if (!Number.isInteger(port) || port < 0 || port > 65535)
	throw new Error("PORT must be an integer between 0 and 65535")

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set")
const prisma = createPrismaClient(process.env.DATABASE_URL)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)
const s3 = new S3Client({
	endpoint: "https://fra1.digitaloceanspaces.com",
	forcePathStyle: false,
	region: "fra1",
	// DigitalOcean Spaces does not document support for the flexible checksum
	// headers the SDK started sending by default in 3.729. Keep the pre-3.729
	// behaviour until Spaces is confirmed to accept them.
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
	credentials: {
		accessKeyId: process.env.SPACES_ACCESS_KEY,
		secretAccessKey: process.env.SPACES_SECRET_KEY
	}
})

let redisDatabase = 2 // production: 1, staging: 2, test: 3
if (process.env.ENV == "production") redisDatabase = 1
else if (process.env.ENV == "test") redisDatabase = 3

const redis = createRedisClient({
	url: process.env.REDIS_URL,
	// An explicit URL database takes precedence; preserve legacy defaults otherwise.
	database:
		process.env.REDIS_URL &&
		new URL(process.env.REDIS_URL).pathname.length > 1
			? undefined
			: redisDatabase
})
redis.on("error", err => console.log("Redis Client Error", err))
let application: Awaited<ReturnType<typeof createApp>>
let stopTasks: (() => void) | undefined
let closing: Promise<void> | undefined

function shutdown(failed = false) {
	if (failed) process.exitCode = 1
	if (closing) return closing
	closing = (async () => {
		const deadline = setTimeout(() => {
			console.error("Server shutdown timed out")
			process.exit(1)
		}, 10000)
		try {
			stopTasks?.()
			try {
				await application?.server.stop()
			} finally {
				await Promise.all([
					redis.isOpen ? redis.disconnect() : Promise.resolve(),
					prisma.$disconnect()
				])
			}
		} catch (error) {
			console.error("Server shutdown failed", error)
			process.exitCode = 1
		} finally {
			s3.destroy()
			clearTimeout(deadline)
		}
	})()
	return closing
}

try {
	await prisma.$connect()
	await redis.connect()
	application = await createApp({
		prisma,
		redis,
		stripe,
		resend,
		files: createFileService(s3, getSpacesBucketName()),
		webhookHttp: axios.create(),
		stripeWebhookSecret: process.env.STRIPE_WEBHOOKS_SECRET
	})
	if (process.env.ENV == "production") {
		webPush.setVapidDetails(
			"mailto:support@dav-apps.tech",
			process.env.WEBPUSH_PUBLIC_KEY,
			process.env.WEBPUSH_PRIVATE_KEY
		)
		stopTasks = setupTasks({ prisma, redis, webPush })
	}
	const { httpServer } = application
	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject)
		httpServer.listen({ port, host: process.env.HOST }, () => {
			httpServer.off("error", reject)
			resolve()
		})
	})
	process.on("SIGTERM", () => void shutdown())
	process.on("SIGINT", () => void shutdown())
	console.log(
		`🚀 Server ready at http://localhost:${(httpServer.address() as AddressInfo).port}/`
	)
} catch (error) {
	console.error("Server startup failed", error)
	await shutdown(true)
}
