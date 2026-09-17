import { expect, it } from "vitest"
import nock from "nock"
import { createElement } from "react"
import { Resend } from "resend"
import EmailConfirmation from "../../src/emails/emailConfirmation.js"
import { sendEmail } from "../../src/services/emailService.js"

it("renders the actual confirmation template through Resend and sends its link", async () => {
	const scope = nock("https://api.resend.com")
		.post(
			"/emails",
			body =>
				body.to === "test@example.test" &&
				body.html.includes("confirm-token") &&
				body.html.includes("Test User")
		)
		.reply(200, { id: "email_test" })
	await expect(
		sendEmail(new Resend("re_test"), {
			from: "test@example.test",
			to: "test@example.test",
			subject: "Confirm",
			react: createElement(EmailConfirmation, {
				name: "Test User",
				link: "https://example.test/confirm-token"
			})
		})
	).resolves.toEqual({ id: "email_test" })
	expect(scope.isDone()).toBe(true)
})

it("turns a Resend API error response into a failed delivery", async () => {
	const scope = nock("https://api.resend.com")
		.post("/emails")
		.reply(422, { name: "validation_error", message: "Rejected" })
	await expect(
		sendEmail(new Resend("re_test"), {
			from: "test@example.test",
			to: "test@example.test",
			subject: "Test",
			html: "Test"
		})
	).rejects.toThrow("Email delivery failed")
	expect(scope.isDone()).toBe(true)
})
