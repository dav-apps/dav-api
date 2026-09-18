import type { PrismaClient } from "./prisma.js"
import type { RedisClientType } from "redis"
import type Stripe from "stripe"
import type { Resend } from "resend"
import type { AxiosInstance } from "axios"
import type webPush from "web-push"
import type { FileService } from "./services/fileService.js"

export interface AppDependencies {
	prisma: PrismaClient
	redis: RedisClientType
	stripe: Stripe
	resend: Resend
	files: FileService
	webhookHttp: Pick<AxiosInstance, "request">
	stripeWebhookSecret?: string
}

export interface TaskDependencies {
	prisma: PrismaClient
	redis: RedisClientType
	webPush: Pick<typeof webPush, "sendNotification">
}
