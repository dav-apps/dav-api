import { PrismaClient, User } from "@prisma/client"
import { RedisClientType } from "redis"
import Stripe from "stripe"
import { Resend } from "resend"

export interface ResolverContext {
	authorization: string
	prisma: PrismaClient
	redis: RedisClientType<any, any, any>
	stripe: Stripe
	resend: Resend
}

export interface List<T> {
	total: number
	items: T[]
}

export interface ApiError {
	code: string
	message: string
	status?: number
}

export interface SessionResult {
	accessToken: string
	websiteAccessToken?: string
}

export interface CreateUserResult {
	user: User
	accessToken: string
	websiteAccessToken?: string
}

export type Currency = "EUR"
export type TableObjectPriceType = "PURCHASE" | "ORDER"
export type OrderStatus = "CREATED" | "PREPARATION" | "SHIPPED"
export type Plan = "FREE" | "PLUS" | "PRO"

//#region Models
export interface UserProfileImage {
	url: string
	etag: string
}

export interface CheckoutSession {
	url: string
}

export interface CustomerPortalSession {
	url: string
}
//#endregion
