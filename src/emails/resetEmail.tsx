import { Html, Body, Text } from "@react-email/components"
import { Logo } from "./components.js"

export default function Email(props: {
	name: string
	newEmail: string
	link: string
}) {
	const name = props.name ?? "Name"
	const newEmail = props.newEmail ?? "hello@example.com"
	const link = props.link ?? "https://dav-apps.tech/"

	return (
		<Html>
			<Body>
				<Logo />

				<Text style={{ marginBottom: "8px" }}>Hi {name},</Text>
				<Text style={{ marginTop: "0", marginBottom: "0" }}>
					The new email address of your account is{" "}
					<span style={{ fontStyle: "italic" }}>{newEmail}</span>. If you
					didn't request to change your email address, click{" "}
					<a href={link} target="_blank">
						here
					</a>{" "}
					to undo the change. Otherwise you can ignore this email.
					<br />
				</Text>

				<Text style={{ marginBottom: "8px" }}>Kind regards</Text>
				<Text style={{ marginTop: "0" }}>The dav team</Text>
			</Body>
		</Html>
	)
}
