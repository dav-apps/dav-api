import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@as-integrations/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import express from "express"
import http from "node:http"
import cors from "cors"
import type { AppDependencies } from "./appDependencies.js"
import type { ResolverContext } from "./types.js"
import { createSchema } from "./schema.js"
import { setup as stripeWebhookSetup } from "./endpoints/stripeWebhook.js"
import { setup as userSetup } from "./endpoints/user.js"
import { setup as tableObjectSetup } from "./endpoints/tableObject.js"

// The caller owns the injected clients. Stop Apollo before closing those clients.
// Creating an app neither connects clients nor listens on a port or starts tasks.
export async function createApp(dependencies: AppDependencies) {
	// Preserve the API's existing BigInt representation, including Redis payloads.
	BigInt.prototype["toJSON"] = function () {
		return this.toString()
	}

	const app = express()
	const httpServer = http.createServer(app)
	const server = new ApolloServer<ResolverContext>({
		// The owning process closes Apollo together with its other resources.
		stopOnTerminationSignals: false,
		schema: createSchema(),
		plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
	})
	await server.start()

	stripeWebhookSetup(app, dependencies)
	userSetup(app, dependencies)
	tableObjectSetup(app, dependencies)
	app.use(
		"/",
		cors<cors.CorsRequest>(),
		express.json({ type: "application/json", limit: "50mb" }),
		expressMiddleware(server, {
			context: async ({ req }) => ({
				...dependencies,
				authorization: req.headers.authorization
			})
		})
	)
	return { app, server, httpServer }
}
