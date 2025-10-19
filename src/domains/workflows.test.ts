import { describe, expect, it } from "vitest";
import { WorkflowsFirestore } from "./workflows.js";

describe("WorkflowsFirestore", () => {
	it("should be defined", () => {
		expect(WorkflowsFirestore).toBeDefined();
	});
});
