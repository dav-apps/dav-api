import { Html, Body, Text } from "@react-email/components"
import { Logo } from "./components.js"

export default function Email(props: { name: string; plan: number }) {
	const name = props.name ?? "Name"
	const plan = props.plan == 2 ? "Pro" : "Plus"

	return (
		<Html>
			<Body>
				<Logo />

				<Text style={{ marginBottom: "8px" }}>Hi {name},</Text>
				<Text style={{ marginTop: "0", marginBottom: "0" }}>
					There was a problem with renewing your subscription. Please
					update your payment method to continue using dav {plan}.
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
