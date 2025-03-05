import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { makeExecutableSchema } from "@graphql-tools/schema"
import express from "express"
import http from "http"
import cors from "cors"
import { PrismaClient } from "@prisma/client"
import { createClient } from "redis"
import Stripe from "stripe"
import { Resend } from "resend"
import { typeDefs } from "./src/typeDefs.js"
import { resolvers } from "./src/resolvers.js"
import { setup as stripeWebhookSetup } from "./src/endpoints/stripeWebhook.js"
import { setup as userSetup } from "./src/endpoints/user.js"
import { setup as tableObjectSetup } from "./src/endpoints/tableObject.js"
import { setupTasks } from "./src/tasks.js"

const port = process.env.PORT || 4000
const app = express()
const httpServer = http.createServer(app)

export const prisma = new PrismaClient()
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
export const resend = new Resend(process.env.RESEND_API_KEY)

//#region Redis config
let redisDatabase = 2 // production: 1, staging: 2, test: 3

if (process.env.ENV == "production") redisDatabase = 1
else if (process.env.ENV == "test") redisDatabase = 3

export const redis = createClient({
	url: process.env.REDIS_URL,
	database: redisDatabase
})

redis.on("error", err => console.log("Redis Client Error", err))
await redis.connect()
//#endregion

let schema = makeExecutableSchema({
	typeDefs,
	resolvers
})

const server = new ApolloServer({
	schema,
	plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
})

await server.start()

// Call setup function of each endpoint file
stripeWebhookSetup(app)
userSetup(app)
tableObjectSetup(app)

if (process.env.ENV == "production") {
	// Setup cron jobs
	setupTasks()
}

app.use(
	"/",
	cors<cors.CorsRequest>(),
	express.json({ type: "application/json", limit: "50mb" }),
	expressMiddleware(server, {
		context: async ({ req }) => ({
			authorization: req.headers.authorization,
			prisma,
			redis,
			stripe,
			resend
		})
	})
)

await new Promise<void>(resolve => httpServer.listen({ port }, resolve))
console.log(`🚀 Server ready at http://localhost:${port}/`)

BigInt.prototype["toJSON"] = function () {
	return this.toString()
}
