import nock from "nock"

// Preloaded in the real server process, not just in the Vitest parent.
nock.disableNetConnect()
nock.enableNetConnect(/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/)
