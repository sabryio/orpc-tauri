/**
 * Request-scoped client context — the IPC analog of HTTP headers.
 *
 * oRPC clients forward a `context` object to their link; TauriLink makes it
 * real. A link-level default (`TauriLinkOptions.context` — static object or
 * a function re-evaluated per call) merges shallowly with the per-call
 * override (`CallOptions.context`, per-call wins), and the merged object is:
 *
 * 1. injected into the invoke args under the reserved `context` key, so a
 *    Rust command that opts in receives it via a plain `context: Option<Ctx>`
 *    parameter (commands that don't declare it are untouched — same pattern
 *    as `streamId`/`eventNames`). The reserved key is the single delivery
 *    path; custom `invoke` implementations simply receive it inside `args`.
 */

export const CONTEXT_ARG = "context";

/**
 * Shallow-merges the link-level defaults with the per-call override
 * (per-call wins). Returns undefined when neither side provides one — in
 * that case invoke args are left completely untouched.
 */
export function resolveCallContext<TContext>(
	defaults: TContext | (() => TContext) | undefined,
	perCall: TContext | undefined,
): TContext | undefined {
	const base =
		typeof defaults === "function" ? (defaults as () => TContext)() : defaults;
	if (base === undefined && perCall === undefined) return undefined;

	return { ...base, ...perCall } as TContext;
}

/**
 * Copies the resolved context into the invoke args under the reserved key.
 * `undefined` args become `undefined` again — a no-context call sends no
 * args object at all (matches commands with zero parameters like `ping`).
 */
export function injectContextArg(args: unknown, context: unknown): unknown {
	if (context === undefined) return args;

	return {
		...((args as Record<string, unknown>) ?? {}),
		[CONTEXT_ARG]: context,
	};
}
