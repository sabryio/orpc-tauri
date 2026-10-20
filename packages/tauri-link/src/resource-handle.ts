/**
 * Rust resource handles (Tauri Resource protocol).
 *
 * A resource lives in the Rust resource table (`tauri::Manager::resources_table`);
 * JS holds only its numeric resource id (`rid`). Branding is compile-time only —
 * the wire payload is a plain `{ rid: number }` — so a branded handle never has
 * to be unwrapped at an input/output boundary.
 */

declare const ResourceBrand: unique symbol;

/**
 * A JS-side reference to an object owned by the Rust resource table.
 *
 * Producing procedures return this; consuming procedures take it (or a raw
 * number dedup'd on the wire). Closing the resource is explicit — through
 * `TauriLink.resource.close(handle)` — or automatic for resource-backed
 * streams (`tauri.resource()` meta) when the stream teardown is abnormal
 * (cancel/failure/early exit), never on normal completion.
 */
export type RustResourceHandle = {
	readonly rid: number;
	readonly [ResourceBrand]: typeof ResourceBrand;
};

/**
 * Widens a plain serialized payload (custom invoker, test fixture, raw rid)
 * into a typed handle. No runtime change — the wire format is `{ rid }`.
 */
export const asResourceHandle = (rid: number): RustResourceHandle =>
	({ rid }) as RustResourceHandle;
