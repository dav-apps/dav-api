import { expect, it, vi } from "vitest"
import bcrypt from "bcrypt"
import { businessSuite } from "../helpers/business.js"
import { developerToken } from "../helpers/fixtures.js"
const s = businessSuite()

it("reports an email provider rejection and permits resending confirmation", async () => {
	const { h, t } = s
	const send = vi.mocked(h.dependencies.resend.emails.send)
	send.mockResolvedValueOnce({
		data: null,
		error: { name: "validation_error", message: "rejected" }
	})
	const query =
		"mutation($id: Int!) { sendConfirmationEmailForUser(id: $id) { id } }"
	const vars = { id: Number(t.owner.id) }
	expect(
		(await h.execute(query, vars, developerToken(t.admin))).errors
	).toHaveLength(1)
	expect(
		(await h.execute(query, vars, developerToken(t.admin))).errors
	).toBeUndefined()
	expect(send).toHaveBeenCalledTimes(2)
})

it("registers, hashes the password, sends a confirmation and consumes its token", async () => {
	const { h, t } = s
	const r = await h.execute(
		`mutation($app: Int!, $key: String!) {
		createUser(email: "new@example.test", firstName: "New", password: "Password123", appId: $app, apiKey: $key) {
			user { id confirmed } accessToken websiteAccessToken
		}
	}`,
		{ app: Number(t.app.id), key: t.dev.apiKey },
		developerToken(t.admin)
	)
	expect(r.errors).toBeUndefined()
	const user = await h.prisma.user.findFirst({
		where: { email: "new@example.test" }
	})
	expect(await bcrypt.compare("Password123", user.password)).toBe(true)
	expect(user.password).not.toBe("Password123")
	expect(await h.prisma.session.count({ where: { userId: user.id } })).toBe(2)
	expect(h.dependencies.resend.emails.send).toHaveBeenCalledWith(
		expect.objectContaining({
			to: user.email,
			react: expect.objectContaining({
				props: expect.objectContaining({
					link: expect.stringContaining(user.emailConfirmationToken)
				})
			})
		})
	)
	const mutation = `mutation($id: Int!, $token: String!) { confirmUser(id: $id, emailConfirmationToken: $token) { confirmed } }`
	expect(
		(
			await h.execute(
				mutation,
				{ id: Number(user.id), token: "wrong" },
				developerToken(t.admin)
			)
		).errors?.[0].extensions.code
	).toBe("EMAIL_CONFIRMATION_TOKEN_INCORRECT")
	expect(
		(
			await h.execute(
				mutation,
				{ id: Number(user.id), token: user.emailConfirmationToken },
				developerToken(t.admin)
			)
		).errors
	).toBeUndefined()
	expect(
		await h.prisma.user.findUnique({ where: { id: user.id } })
	).toMatchObject({ confirmed: true, emailConfirmationToken: null })
	expect(
		(
			await h.execute(
				mutation,
				{ id: Number(user.id), token: user.emailConfirmationToken },
				developerToken(t.admin)
			)
		).errors?.[0].extensions.code
	).toBe("USER_IS_ALREADY_CONFIRMED")
})

it.each(["duplicate", "validation", "developer"])(
	"rejects %s registration without rows or emails",
	async mode => {
		const { h, t } = s
		const r = await h.execute(
			`mutation($email: String!, $app: Int!, $key: String!) {
		createUser(email: $email, firstName: "New", password: "Password123", appId: $app, apiKey: $key) { user { id } }
	}`,
			{
				email:
					mode === "duplicate"
						? t.owner.email.toUpperCase()
						: mode === "validation"
							? "invalid"
							: "new@example.test",
				app: Number(t.app.id),
				key: t.dev.apiKey
			},
			developerToken(mode === "developer" ? t.dev : t.admin)
		)
		expect(r.errors?.[0].extensions.code).toBe(
			mode === "developer" ? "ACTION_NOT_ALLOWED" : "VALIDATION_FAILED"
		)
		expect(await h.prisma.user.count()).toBe(2)
		expect(await h.prisma.session.count()).toBe(3)
		expect(h.dependencies.resend.emails.send).not.toHaveBeenCalled()
	}
)

it("resets passwords only with a nonempty, single-use token", async () => {
	const { h, t } = s
	const mutation = `mutation($id: Int!, $token: String) { setPasswordOfUser(id: $id, password: "Changed123", passwordConfirmationToken: $token) { id } }`
	for (const token of [null, "", "wrong"]) {
		const r = await h.execute(
			mutation,
			{ id: Number(t.owner.id), token },
			developerToken(t.admin)
		)
		expect(r.errors?.[0].extensions.code).toBe(
			"PASSWORD_CONFIRMATION_TOKEN_INCORRECT"
		)
	}
	expect(
		(
			await h.execute(
				`mutation($email: String!) { sendPasswordResetEmailForUser(email: $email) { id } }`,
				{ email: t.owner.email },
				developerToken(t.admin)
			)
		).errors
	).toBeUndefined()
	const pending = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(pending.password).toBe(t.owner.password)
	expect(pending.passwordConfirmationToken).toBeTruthy()
	const variables = {
		id: Number(t.owner.id),
		token: pending.passwordConfirmationToken
	}
	expect(
		(await h.execute(mutation, variables, developerToken(t.admin))).errors
	).toBeUndefined()
	const changed = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(await bcrypt.compare("Changed123", changed.password)).toBe(true)
	expect(changed.passwordConfirmationToken).toBeNull()
	expect(
		(await h.execute(mutation, variables, developerToken(t.admin)))
			.errors?.[0].extensions.code
	).toBe("PASSWORD_CONFIRMATION_TOKEN_INCORRECT")
})

it("requires the website session and confirmation before applying a new password", async () => {
	const { h, t } = s
	const query = 'mutation { updateUser(password: "Changed123") { id } }'
	expect(
		(await h.execute(query, {}, t.session.token)).errors?.[0].extensions.code
	).toBe("ACTION_NOT_ALLOWED")
	const website = await t.make.session(t.owner.id, t.website.id)
	expect((await h.execute(query, {}, website.token)).errors).toBeUndefined()
	const pending = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(pending.password).toBe(t.owner.password)
	const confirm = `mutation($id: Int!, $token: String!) { saveNewPasswordOfUser(id: $id, passwordConfirmationToken: $token) { id } }`
	expect(
		(
			await h.execute(
				confirm,
				{ id: Number(t.owner.id), token: "wrong" },
				developerToken(t.admin)
			)
		).errors?.[0].extensions.code
	).toBe("PASSWORD_CONFIRMATION_TOKEN_INCORRECT")
	expect(
		(
			await h.execute(
				confirm,
				{
					id: Number(t.owner.id),
					token: pending.passwordConfirmationToken
				},
				developerToken(t.admin)
			)
		).errors
	).toBeUndefined()
	const changed = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(await bcrypt.compare("Changed123", changed.password)).toBe(true)
	expect(changed.newPassword).toBeNull()
})

it("confirms an email change, updates Stripe and allows a single rollback", async () => {
	const { h, t } = s
	const update = vi
		.spyOn(s.stripe.customers, "update")
		.mockResolvedValue({ id: "cus_test" } as any)
	await h.prisma.user.update({
		where: { id: t.owner.id },
		data: { stripeCustomerId: "cus_test" }
	})
	const website = await t.make.session(t.owner.id, t.website.id)
	expect(
		(
			await h.execute(
				'mutation { updateUser(email: "changed@example.test") { email } }',
				{},
				website.token
			)
		).errors
	).toBeUndefined()
	const pending = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(pending.email).toBe(t.owner.email)
	const confirm = `mutation($id: Int!, $token: String!) { saveNewEmailOfUser(id: $id, emailConfirmationToken: $token) { email } }`
	expect(
		(
			await h.execute(
				confirm,
				{ id: Number(t.owner.id), token: "wrong" },
				developerToken(t.admin)
			)
		).errors?.[0].extensions.code
	).toBe("EMAIL_CONFIRMATION_TOKEN_INCORRECT")
	expect(
		(
			await h.execute(
				confirm,
				{ id: Number(t.owner.id), token: pending.emailConfirmationToken },
				developerToken(t.admin)
			)
		).errors
	).toBeUndefined()
	expect(update).toHaveBeenCalledWith("cus_test", {
		email: "changed@example.test"
	})
	const changed = await h.prisma.user.findUnique({ where: { id: t.owner.id } })
	expect(changed).toMatchObject({
		email: "changed@example.test",
		oldEmail: t.owner.email,
		newEmail: null
	})
	const reset = `mutation($id: Int!, $token: String!) { resetEmailOfUser(id: $id, emailConfirmationToken: $token) { email } }`
	const vars = {
		id: Number(t.owner.id),
		token: changed.emailConfirmationToken
	}
	expect(
		(await h.execute(reset, vars, developerToken(t.admin))).errors
	).toBeUndefined()
	expect(
		(await h.execute(reset, vars, developerToken(t.admin))).errors?.[0]
			.extensions.code
	).toBe("OLD_EMAIL_OF_USER_IS_EMPTY")
	expect(
		(await h.prisma.user.findUnique({ where: { id: t.owner.id } })).email
	).toBe(t.owner.email)
})
