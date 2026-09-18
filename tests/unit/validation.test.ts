import { expect, it } from "vitest"
import {
	validateFirstNameLength,
	validatePasswordLength,
	validatePropertyValueLength,
	validatePrice
} from "../../src/services/validationService.js"
import { getTotalStorageOfUser } from "../../src/utils.js"
import type { User } from "../../src/prisma.js"

it.each([
	[validateFirstNameLength, 2, 20],
	[validatePasswordLength, 7, 25]
] as const)("checks both boundaries of %s", (validate, min, max) => {
	expect(validate("a".repeat(min - 1))).toBeDefined()
	expect(validate("a".repeat(min))).toBeUndefined()
	expect(validate("a".repeat(max))).toBeUndefined()
	expect(validate("a".repeat(max + 1))).toBeDefined()
})

it("checks property size and price limits", () => {
	expect(validatePropertyValueLength("a".repeat(65000))).toBeUndefined()
	expect(validatePropertyValueLength("a".repeat(65001))).toBeDefined()
	for (const price of [0, 100000]) expect(validatePrice(price)).toBeUndefined()
	for (const price of [-1, 100001]) expect(validatePrice(price)).toBeDefined()
})

it.each([
	[false, 2, 1000000000n],
	[true, 0, 2000000000n],
	[true, 1, 15000000000n],
	[true, 2, 50000000000n]
] as const)(
	"calculates storage for confirmed=%s, plan=%s",
	(confirmed, plan, bytes) => {
		expect(getTotalStorageOfUser({ confirmed, plan } as User)).toBe(bytes)
	}
)
