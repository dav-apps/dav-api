import { Provider } from "@prisma/client"

export function id(provider: Provider): number {
	return Number(provider.id)
}
