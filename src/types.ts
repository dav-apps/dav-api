import { PrismaClient } from "@prisma/client"

export interface ResolverContext {
	prisma: PrismaClient
}

export interface List<T> {
	total: number
	items: T[]
}
