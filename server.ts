import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { makeExecutableSchema } from "@graphql-tools/schema"
import express from "express"
import http from "http"
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import Stripe from "stripe"
import { typeDefs } from "./src/typeDefs.js"
import { resolvers } from "./src/resolvers.js"

const port = process.env.PORT || 4000
const app = express()
const httpServer = http.createServer(app)
const prisma = new PrismaClient()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

let schema = makeExecutableSchema({
	typeDefs,
	resolvers
})

const server = new ApolloServer({
	schema,
	plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
})

await server.start()

app.use(
	"/",
	cors<cors.CorsRequest>(),
	express.json({ type: "application/json", limit: "50mb" }),
	expressMiddleware(server, {
		context: async ({ req }) => ({
			authorization: req.headers.authorization,
			prisma,
			stripe
		})
	})
)

await new Promise<void>(resolve => httpServer.listen({ port }, resolve))
console.log(`🚀 Server ready at http://localhost:${port}/`)
