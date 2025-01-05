import { Html, Body, Text } from "@react-email/components"
import { Logo } from "./components.js"

export default function Email(props: { name: string; link: string }) {
	const name = props.name ?? "Name"
	const link = props.link ?? "https://dav-apps.tech/"

	return (
		<Html>
			<Body>
				<Logo />

				<Text style={{ marginBottom: "8px" }}>Welcome to dav, {name}!</Text>
				<Text style={{ marginTop: "0", marginBottom: "0" }}>
					Click the following link to confirm your email address:{" "}
					<a href={link} target="_blank">
						Confirm your email address
					</a>
				</Text>

				<Text style={{ marginBottom: "8px" }}>Kind regards</Text>
				<Text style={{ marginTop: "0" }}>The dav team</Text>
			</Body>
		</Html>
	)
}
