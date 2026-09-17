import type { PrismaClient } from "@prisma/client"

export async function processWebhook(
	prisma: PrismaClient,
	event: { id: string; created: number },
	resource: string,
	rejectOlder: boolean,
	work: () => Promise<number>
) {
	await prisma.$transaction(
		async tx => {
			// Same resource is serialized even across independent API processes.
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resource}, 0))`
			if (await tx.webhookEvent.findUnique({ where: { id: event.id } }))
				return
			const newer =
				rejectOlder &&
				(await tx.webhookEvent.findFirst({
					where: { resource, occurredAt: { gt: event.created } }
				}))
			if (!newer && (await work()) !== 200)
				throw new Error("Webhook processing failed")
			await tx.webhookEvent.create({
				data: { id: event.id, resource, occurredAt: event.created }
			})
		},
		{ maxWait: 5000, timeout: 30000 }
	)
}

// Called under the resource lock above. Commit each successful external effect
// separately so a later failure does not cause already completed effects to repeat.
export async function webhookEffectOnce(
	prisma: PrismaClient,
	key: string,
	work: () => Promise<unknown>
) {
	if (await prisma.webhookEffect.findUnique({ where: { key } })) return
	await work()
	await prisma.webhookEffect.create({ data: { key } })
}
