import { describe, expect, it } from "vitest";
import { FirestoreStore } from "./firestore.store.js";

describe("FirestoreStore", () => {
	it("should be defined", () => {
		expect(FirestoreStore).toBeDefined();
	});
});
