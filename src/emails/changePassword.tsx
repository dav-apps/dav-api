import * as React from "react"
import { Html, Body, Text } from "@react-email/components"
import { Logo } from "./components.js"

export default function Email(props: { name: string; link: string }) {
	const name = props.name ?? "Name"
	const link = props.link ?? "https://dav-apps.tech/"

	return (
		<Html>
			<Body>
				<Logo />

				<Text style={{ marginBottom: "8px" }}>Hi {name},</Text>
				<Text style={{ marginTop: "0", marginBottom: "0" }}>
					Click the following link to confirm your new password:
					<br />
					<a href={link} target="_blank">
						Confirm your password
					</a>
				</Text>

				<Text style={{ marginBottom: "8px" }}>Kind regards</Text>
				<Text style={{ marginTop: "0" }}>The dav team</Text>
			</Body>
		</Html>
	)
}
