import { PrismaClient } from "@prisma/client"
import { createClient, RedisClientType } from "redis"
import { S3Client } from "@aws-sdk/client-s3"
import Stripe from "stripe"
import { Resend } from "resend"
import axios from "axios"
import webPush from "web-push"
import { createApp } from "./src/app.js"
import { createFileService } from "./src/services/fileService.js"
import { getSpacesBucketName } from "./src/utils.js"
import { setupTasks } from "./src/tasks.js"

const port = process.env.PORT || 4000
const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)
const s3 = new S3Client({
	endpoint: "https://fra1.digitaloceanspaces.com",
	forcePathStyle: false,
	region: "fra1",
	credentials: {
		accessKeyId: process.env.SPACES_ACCESS_KEY,
		secretAccessKey: process.env.SPACES_SECRET_KEY
	}
})

let redisDatabase = 2 // production: 1, staging: 2, test: 3
if (process.env.ENV == "production") redisDatabase = 1
else if (process.env.ENV == "test") redisDatabase = 3

const redis: RedisClientType = createClient({
	url: process.env.REDIS_URL,
	database: redisDatabase
})
redis.on("error", err => console.log("Redis Client Error", err))
await redis.connect()

const { httpServer } = await createApp({
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
	setupTasks({ prisma, redis, webPush })
}

await new Promise<void>(resolve => httpServer.listen({ port }, resolve))
console.log(`🚀 Server ready at http://localhost:${port}/`)
