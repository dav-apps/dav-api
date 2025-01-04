import { PrismaClient } from "@prisma/client"
import { RedisClientType } from "redis"
import Stripe from "stripe"

export interface ResolverContext {
	authorization: string
	prisma: PrismaClient
	redis: RedisClientType<any, any, any>
	stripe: Stripe
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

export type Currency = "EUR"
export type TableObjectPriceType = "PURCHASE" | "ORDER"
export type OrderStatus = "CREATED" | "PREPARATION" | "SHIPPED"
export type Plan = "FREE" | "PLUS" | "PRO"

//#region Models
export interface CheckoutSession {
	url: string
}

export interface CustomerPortalSession {
	url: string
}
//#endregion
