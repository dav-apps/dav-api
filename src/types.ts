import { PrismaClient } from "@prisma/client"

export interface ResolverContext {
	authorization: string
	prisma: PrismaClient
}

export interface List<T> {
	total: number
	items: T[]
}
