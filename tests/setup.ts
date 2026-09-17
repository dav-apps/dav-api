import { afterAll, afterEach } from "vitest"
import nock from "nock"

// Never load .env or fall back to developer credentials in this suite.
process.env.ENV = "test"
process.env.DAV_APPS_APP_ID = "1"
for (const key of [
	"DATABASE_URL",
	"REDIS_URL",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOKS_SECRET",
	"RESEND_API_KEY",
	"SPACES_ACCESS_KEY",
	"SPACES_SECRET_KEY",
	"WEBPUSH_PUBLIC_KEY",
	"WEBPUSH_PRIVATE_KEY",
	"WEBHOOK_KEY"
])
	delete process.env[key]

nock.disableNetConnect()
nock.enableNetConnect(/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/)
afterEach(() => nock.cleanAll())
afterAll(() => nock.enableNetConnect())
