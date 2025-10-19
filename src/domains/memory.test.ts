import { describe, expect, it } from "vitest";
import { MemoryFirestore } from "./memory.js";

describe("MemoryFirestore", () => {
	it("should be defined", () => {
		expect(MemoryFirestore).toBeDefined();
	});
});
