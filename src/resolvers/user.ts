import { User } from "@prisma/client"
import { ResolverContext } from "../types.js"

export function id(user: User, args: any, context: ResolverContext): number {
	return Number(user.id)
}
