import { describe, expect, it } from "vitest";
import { camelCase } from "./casing";

describe("camelCase", () => {
	it("converts snake_case to camelCase", () => {
		expect(camelCase("on_event")).toBe("onEvent");
		expect(camelCase("event_received_custom")).toBe("eventReceivedCustom");
	});

	it("converts kebab-case to camelCase", () => {
		expect(camelCase("on-event")).toBe("onEvent");
	});

	it("collapses consecutive separators", () => {
		expect(camelCase("on__--event")).toBe("onEvent");
	});

	it("is idempotent for camelCase input", () => {
		expect(camelCase("onEvent")).toBe("onEvent");
		expect(camelCase("eventReceivedCustom")).toBe("eventReceivedCustom");
	});

	it("leaves single-word identifiers unchanged", () => {
		expect(camelCase("on")).toBe("on");
	});
});
