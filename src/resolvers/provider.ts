import { Provider } from "../prisma.js"

export function id(provider: Provider): number {
	return Number(provider.id)
}
