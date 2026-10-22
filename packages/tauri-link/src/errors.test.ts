import { describe, expect, it } from "vitest";
import { toORPCError } from "./error-converter";
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

describe("toORPCError blank-message recovery", () => {
	it("renders a TaggedError's structured fields when .message is empty", () => {
		// TauriInvokeError with a string cause — the cause text IS the message.
		const invokeError = toORPCError(
			new TauriInvokeError({
				command: "raw_file_download",
				input: { path: "Cargo.toml" },
				cause: "unknown command",
			}),
		);

		expect(invokeError.code).toBe("INTERNAL_SERVER_ERROR");
		expect(invokeError.message).toBe("unknown command");

		// No usable cause — the tag + rendered fields still diagnose.
		const noCauseError = toORPCError(
			new TauriInvokeError({
				command: "raw_file_download",
				input: null,
				cause: undefined,
			}),
		);

		expect(noCauseError.message).toContain("TauriInvokeError");
		expect(noCauseError.message).toContain("raw_file_download");
	});

	it("renders ProcedureNotFoundError's path", () => {
		const error = toORPCError(
			new (class extends Error {
				_tag = "ProcedureNotFoundError";
				path = ["raw", "raw_download"];
			})(),
		);

		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).toContain("ProcedureNotFoundError");
		expect(error.message).toContain('"raw"');
	});

	it("parses Tauri's serialized rejection strings back into structured errors", () => {
		const error = toORPCError(
			'{"defined":true,"code":"NOT_FOUND","message":"file not found: Cargo.toml"}',
		);

		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("file not found: Cargo.toml");
	});

	it("surfaces plain-text Tauri rejections verbatim", () => {
		const error = toORPCError("Command raw_file_download not found");

		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).toBe("Command raw_file_download not found");
	});
});
