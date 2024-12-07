import * as React from "react"
import { Html, Body, Text } from "@react-email/components"
import { Logo } from "./components.js"

export default function Email(props: { name: string }) {
	const name = props.name ?? "Name"

	return (
		<Html>
			<Body>
				<Logo />

				<Text style={{ marginBottom: "8px" }}>Hi {name},</Text>
				<Text style={{ marginTop: "0", marginBottom: "0" }}>
					There was a problem with renewing your subscription. Your account
					was downgraded to the free plan.
				</Text>

				<Text style={{ marginTop: "0" }}>
					You can manage your subscription here:{" "}
					<a href="https://dav-apps.tech/user#plans" target="_blank">
						dav-apps.tech/user
					</a>
				</Text>

				<Text style={{ marginBottom: "8px" }}>Kind regards</Text>
				<Text style={{ marginTop: "0" }}>The dav team</Text>
			</Body>
		</Html>
	)
}
