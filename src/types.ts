import { PrismaClient } from "@prisma/client"
import Stripe from "stripe"

export interface ResolverContext {
	authorization: string
	prisma: PrismaClient
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

//#region Models
export interface CheckoutSession {
	url: string
}
//#endregion
