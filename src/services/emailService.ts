import type { Resend } from "resend"

// Resend reports API failures as { error }, not necessarily rejected promises.
export async function sendEmail(
	resend: Resend,
	payload: Parameters<Resend["emails"]["send"]>[0]
) {
	const result = await resend.emails.send(payload)
	if (result.error || !result.data) throw new Error("Email delivery failed")
	return result.data
}
