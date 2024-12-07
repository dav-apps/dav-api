import * as React from "react"
import { Img } from "@react-email/components"

export function Logo() {
	return (
		<Img
			alt="dav Logo"
			height={50}
			src="https://dav-misc.fra1.cdn.digitaloceanspaces.com/dav-logo.png"
			style={{ marginLeft: "auto", marginRight: "auto" }}
		/>
	)
}
