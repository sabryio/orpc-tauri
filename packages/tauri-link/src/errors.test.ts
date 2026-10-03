import { describe, expect, it } from "vitest";
import {
	AbortError,
	StreamError,
	TauriInvokeError,
	TauriListenError,
	ValidationError,
} from "./errors";

describe("TauriInvokeError", () => {
	it("should create error with command, input, and cause", () => {
		const error = new TauriInvokeError({
			command: "get_user",
			input: { id: 123 },
			cause: new Error("Network failure"),
		});

		expect(error._tag).toBe("TauriInvokeError");
		expect(error.command).toBe("get_user");
		expect(error.input).toEqual({ id: 123 });
		expect(error.cause).toBeInstanceOf(Error);
	});

	it("should be instanceof TauriInvokeError", () => {
		const error = new TauriInvokeError({
			command: "test",
			input: null,
			cause: "unknown",
		});

		expect(error).toBeInstanceOf(TauriInvokeError);
	});
});

describe("TauriListenError", () => {
	it("should create error with event and cause", () => {
		const error = new TauriListenError({
			event: "user:updated",
			cause: new Error("Listener setup failed"),
		});

		expect(error._tag).toBe("TauriListenError");
		expect(error.event).toBe("user:updated");
		expect(error.cause).toBeInstanceOf(Error);
	});
});

describe("StreamError", () => {
	it("should create error with streamId and cause", () => {
		const error = new StreamError({
			streamId: "stream-123",
			cause: "Connection lost",
		});

		expect(error._tag).toBe("StreamError");
		expect(error.streamId).toBe("stream-123");
		expect(error.cause).toBe("Connection lost");
	});

	it("should allow optional streamId", () => {
		const error = new StreamError({
			cause: "Generic stream error",
		});

		expect(error._tag).toBe("StreamError");
		expect(error.streamId).toBeUndefined();
		expect(error.cause).toBe("Generic stream error");
	});
});

describe("ValidationError", () => {
	it("should create error with path and message", () => {
		const error = new ValidationError({
			path: ["users", "get"],
			message: "Missing required field: id",
		});

		expect(error._tag).toBe("ValidationError");
		expect(error.path).toEqual(["users", "get"]);
		expect(error.message).toBe("Missing required field: id");
	});
});

describe("AbortError", () => {
	it("should create error with reason", () => {
		const error = new AbortError({
			reason: "User cancelled request",
		});

		expect(error._tag).toBe("AbortError");
		expect(error.reason).toBe("User cancelled request");
	});

	it("should allow optional reason", () => {
		const error = new AbortError({});

		expect(error._tag).toBe("AbortError");
		expect(error.reason).toBeUndefined();
	});
});

describe("Error type narrowing", () => {
	it("should narrow errors by _tag discriminant", () => {
		const errors = [
			new TauriInvokeError({ command: "test", input: null, cause: "err" }),
			new StreamError({ cause: "err" }),
			new ValidationError({ path: [], message: "err" }),
		];

		const invokeErrors = errors.filter((e) => e._tag === "TauriInvokeError");
		const streamErrors = errors.filter((e) => e._tag === "StreamError");

		expect(invokeErrors).toHaveLength(1);
		expect(streamErrors).toHaveLength(1);
		expect(invokeErrors[0]).toBeInstanceOf(TauriInvokeError);
		expect(streamErrors[0]).toBeInstanceOf(StreamError);
	});
});
