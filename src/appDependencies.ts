import type { PrismaClient } from "./prisma.js"
import type { RedisClient } from "./redis.js"
import type Stripe from "stripe"
import type { Resend } from "resend"
import type { AxiosInstance } from "axios"
import type webPush from "web-push"
import type { FileService } from "./services/fileService.js"

export interface AppDependencies {
	prisma: PrismaClient
	redis: RedisClient
	stripe: Stripe
	resend: Resend
	files: FileService
	webhookHttp: Pick<AxiosInstance, "request">
	stripeWebhookSecret?: string
}

export interface TaskDependencies {
	prisma: PrismaClient
	redis: RedisClient
	webPush: Pick<typeof webPush, "sendNotification">
}
