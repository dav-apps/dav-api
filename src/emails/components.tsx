import * as React from "react"
import { Img } from "@react-email/components"

export function Logo() {
	return (
		<div style={{ display: "flex", justifyContent: "center" }}>
			<a href="https://dav-apps.tech" target="_blank">
				<Img
					src="https://dav-misc.fra1.cdn.digitaloceanspaces.com/dav-logo.png"
					height={50}
					alt="dav Logo"
				/>
			</a>
		</div>
	)
}
