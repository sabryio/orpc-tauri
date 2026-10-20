# Tauri-Link API Enhancement Plan

A ranked, workable-in-order roadmap for polishing the public API of `packages/tauri-link`.

**Context (audit date: 2026-10-20).** The API *design* is sound and needs no renaming or restructuring. The verdict: zero-config happy path, declarative metadata, typed escape hatches — the trio a senior review looks for. The polish gap is a handful of declared-but-unwired fields and missing lifecycle affordances, listed below in implementation order.

Work through the list one by one. Check the box in the header when done.

## Status at a glance

| # | Item | Effort | Status |
|---|------|--------|--------|
| 1 | Ship `onProgress` module augmentation from the package | XS | ☑ |
| 2 | Wire or cut dead metadata (`timeout`, `tags`, `permissions`) | S | ☑ |
| 3 | Mid-stream cancellation via `AbortSignal` | M | ☑ |
| 4 | Listen-mode progress parity | M | ☐ |
| 5 | Narrow the `as TOutput` casts | XS | ☐ |
| 6 | Justify or drop the `TauriLink<TContext>` generic | XS | ☐ |
| 7 | `createTauriClient` convenience factory | XS | ☐ |
| 8 | Rust `Resource` handles — server-side cancellation | M–L | ☐ |

---

## 1. Ship the `onProgress` module augmentation from the package ☑

**Effort:** XS · **Value:** high · **Priority: do first**

### Problem

Today every consumer must hand-write an ambient module augmentation to get typed `onProgress` in call options. The web app demonstrates the boilerplate in `apps/web/src/rpc/index.ts`:

```ts
declare module "@orpc/client" {
  interface ClientOptions<T> {
    onProgress?: (info: ProgressInfo) => void;
  }
}
```

### Proposal

The package ships the augmentation itself, next to the `ProgressInfo` type export in the `/link` (and root) entrypoint, so consumers import `ProgressInfo` and get `onProgress` typed with zero boilerplate.

Implementation shape: a `.d.ts` (or inline `declare module` in `link.export.ts`) that merges:

```ts
declare module "@orpc/client" {
  interface ClientContext {
    onProgress?: (info: ProgressInfo) => void;
  }
}
```

⚠️ Verify the exact interface name against the oRPC version in use — the app currently augments `ClientOptions<T>`; match what the installed `@orpc/client` actually reads at its call-option boundary.

### Acceptance criteria

- [x] Consumer app deletes its local `declare module "@orpc/client"` block from `apps/web/src/rpc/index.ts`
- [x] `client.file.download_file(..., { onProgress: ... })` type-checks with the augmentation coming solely from the package
- [x] `bun run check-types` (web) and package `tsc --noEmit` pass
- [x] README "Transfer Progress" section notes that typing ships built-in

**Done (2026-10-20).** Implementation: `src/client-augmentation.ts` is the single-source copy; the identical block is inlined verbatim in both entrypoints (`src/index.ts`, `src/link.export.ts`) so the emitted `dist/index.d.ts` / `dist/link.export.d.ts` unconditionally carry the augmentation into consumer programs (a side-effect import would have been erased from `.d.ts` emit, so inlining was required). App-side boilerplate removed; Private augmentation merged cleanly when both entrypoints are imported (identical member declarations).

---

## 2. Wire or cut dead metadata (`timeout`, `tags`, `permissions`) ☑

**Effort:** S · **Value:** high · **Priority: do second**

### Problem

`TauriMeta` declares `timeout?: number`, `tags?: string[]`, `permissions?: string[]` in `src/types.ts`. `metadata.ts` accepts all three through every helper and `mergeTauriMeta` — but **nothing in the link reads them** (grep across `src/` finds no consumer outside merge/type definitions). A JSR user setting `tauri.timeout(5000)` gets a silent no-op.

Declared-but-unwired API is the #1 professionalism smell for a published package.

### Proposal

- **Implement `timeout`** in `public-api.ts`:
  - Unary: wrap `EffectTauriLink.call` with `Effect.timeout(meta.timeout)` in `callEffect` (needs the resolver to expose `getTimeout(path)` mirroring `getDebug`).
  - Streaming: `Stream.timeout` / `Effect.timeout` on the setup, then map the `TimeoutException` to a recognizable `ORPCError` (deadlock/timeout code consistent with oRPC).
  - Document in README Metadata API table: applies to the whole call/stream.
- **Cut `tags` and `permissions`** (or wire them for real):
  - Practically, Tauri capabilities are configured in `src-tauris` `capabilities/*.json`, not at call time — `permissions` at the contract layer is aspirational. Cut unless there is a concrete plan (e.g. generating a capability check stub).
  - If cut: remove fields from `TauriMeta`, `mergeTauriMeta`, and any tests; note in README changelog.

### Acceptance criteria

- [x] `tauri.timeout(5000)` causes a unary call hanging longer than 5s to reject with an oRPC-consistent timeout error (`ORPCError("TIMEOUT")`, message `"command timed out after Nms"`)
- [x] Timeout appears in README Metadata API docs with per-transport semantics (whole-call for unary, inactivity deadline for streams)
- [x] `tags` / `permissions` removed from `TauriMeta` (validated: no usage in `apps/web` or package tests; Tauri capabilities live in `src-tauri/capabilities/*.json`, not contract meta)
- [x] Package tests cover timeout firing and timeout not firing (99 tests total)

**Done (2026-10-20).** Implementation:
- `TimeoutError` (`Data.TaggedError`) added to `errors.ts` and exported from both entrypoints — fields `operation`, `timeout`, plus a derived `message` getter
- Unary: `Effect.timeoutOrElse` in `public-api.ts` `callEffect` via `ProcedureResolver.getTimeout(path)`
- Streams: `Stream.timeoutOrElse` (per-pull **inactivity** deadline) applied to the transport-agnostic stream in `link.ts` `EffectTauriLink.stream` — `StreamConfig.timeoutMs`
- `toORPCError` maps `TimeoutError` → `ORPCError("TIMEOUT", { message, data: { operation, timeout } })`
- Follow-up completed same day: stream errors are converted to `ORPCError` at the `streamToAsyncIterator` boundary (`catch (error) → throw toORPCError(error)`), so for-await rejections match unary error shape — `StreamError` causes unwrap to their Rust payload code, `TimeoutError` → `"TIMEOUT"`, unknown failures → `"INTERNAL_ERROR"`. Covered by `stream-adapter.test.ts` "boundary error conversion" suite; link.test stream timeout test asserts `ORPCError("TIMEOUT")`.
- `mergeArrayField` helper deleted along with `tags`/`permissions` from `metadata.ts` and `types.ts`
- README: Metadata API section rewritten (dead fields removed, Timeout subsection with per-transport semantics and `tauri.channel(...).meta(tauri.timeout(...))` usage), merging docs corrected (`??` semantics, command-cannot-change rule)

Note (follow-up completed same day): stream errors now reach the consumer as `ORPCError` — converted at the `streamToAsyncIterator` boundary (see note above). Unary errors pass through `toORPCError` in `call()`.

---

## 3. Mid-stream cancellation via `AbortSignal` ☑

**Effort:** M · **Value:** high · **Priority: do third**

### Problem

`AbortSignal` is checked **before** invoke only (`public-api.ts` `callEffect` → `AbortError`). Once a stream starts, aborting the signal does nothing: the Rust command keeps streaming and the consumer keeps receiving chunks. A UI cannot cancel a download.

AGENTS.md gotcha says "Tauri has no cancellation API" — that governs stopping the *Rust side*; it does not prevent tearing down the consumer side (channel close, listener unlisten), which this item addresses.

### Proposal

1. Accept `signal` in both stream creation paths (`createChannelStream`, `createEventStream`) via `StreamConfig`.
2. Use `Stream.interruptWhen` (or `Effect.raceFirst` / `Effect.interruptWhen` inside the scoped stream) with an effect that completes on `signal`'s `abort` event.
3. Rely on existing `Effect.Scope` cleanup: interrupted streams auto-unlisten (listen mode) and drop the channel (channel mode).
4. Wrap the interruption into `AbortError` → `ORPCError` at the boundary (consistent with the pre-invoke abort path, `isDefinedError` semantics decide which code).
5. Rust-side note: the command keeps running to completion — document that aborting only stops consumption; for long-running commands, Rust can check a flag or the channel `closed()` (Tauri `Channel` exposes closure detection in recent versions — verify availability of the installed tauri version) to short-circuit.

### Acceptance criteria

- [x] Aborting mid-long-stream ends the `for await` promptly and unlistens/removes the channel
- [x] Consumer receives an error consistent with the documented abort behavior
- [x] No listener leak after abort (test with the mock listener counting unlisten calls)
- [x] Unary calls unchanged
- [x] README call-options docs updated (streaming + `signal`)

**Done (2026-10-20).** Implementation:
- `StreamConfig.signal` threaded from call options through `createEventStream` / `createChannelStream`; `link.ts` wraps the stream in `Stream.interruptWhen` with an `Effect.callback<never, AbortError>` watcher (pre-aborted signal fails immediately; listener removed in cleanup)
- `toORPCError` maps `AbortError` → `ORPCError("CLIENT_CLOSED_REQUEST", { message: "Request aborted" })` — the oRPC-sanctioned code for client-closed requests (`COMMON_ERROR_STATUS_MAP`); aborts are deliberately **not** contract-defined errors, so `isDefinedError()` stays reserved for contract `.errors()`
- Channel mode got a Scope finalizer (the interrupt only tears down *consumption*): deadens `channel.onmessage` and unregisters the Tauri IPC callback (`Channel.cleanupCallback()`), because Tauri only releases a channel on the backend's `end` envelope — without this, late `progress:` envelopes kept firing `onProgress` after cancel. Regression-tested (late envelope swallowed, callback unregistered)
- Demo wired: download card has a Cancel button; post-abort `next()` rejects once, subsequent pulls see `done` (dead, not hung); UI discriminates via `isDefinedError` + `ORPCError` code check
- Known limit preserved in docs: the Rust command still runs to completion — fixed properly by item 8 below
- Tests 104/104; verification quirk to remember: web consumes the **built** `dist/`, so package changes require `bun run build` + full `bun desktop:dev` restart (Vite re-optimization) before they reach the app

---

## 4. Listen-mode progress parity ☐

**Effort:** M · **Value:** medium · **Priority: after 1–3**

### Problem

`onProgress` is silently a no-op for `tauri.listen()` streams — it is only consumed by the channel path (`channel-stream.ts`). This contradicts the "configure once, transport-agnostic calls" story.

### Proposal

- Parse `progress:` comments in `event-stream.ts` using the same `makeProgressParser` machinery (SSE comments already exist in that envelope shape, and the Rust `Event` builder is shared between both transports).
- Allow the progress convention config on the **listen** transport variant too (`TauriTransportConfig` listen branch gains `progress?: ChannelProgressConfig`).
- Alternative (if parity is unwanted): surface the restriction in types or README rather than silently ignoring.

### Acceptance criteria

- [ ] A listen-mode stream with a Rust command emitting `.progress()` envelopes fires `onProgress`
- [ ] Progress envelopes never reach the event-stream payload (same guarantee as channel mode)
- [ ] Tests mirror the channel-mode progress tests (`channel-stream.test.ts` is the model)

---

## 5. Narrow the `as TOutput` casts ☐

**Effort:** XS · **Value:** low (cosmetic) · **Priority: any time**

### Problem

`public-api.ts` returns streams via `self.createChannelStream<TOutput>(...) as TOutput` (and the listen twin). Double-cast-through-`unknown` vibes; oRPC owns the real type contract so it works, but it is dishonest typing locally.

### Proposal

Express the boundary as it is: the link only ever produces values (payloads) — for streaming procedures `TOutput` is shaped by the oRPC client. Use a minimal, single-purpose helper:

```ts
const asProducer = <T>(it: AsyncIterableIterator<T>) => it as T;
```

with a comment explaining why (oRPC client-side typing; link contributes only the payload iterator), or a conditional type only if oRPC exposes an exported iterator-specific type to target.

### Acceptance criteria

- [ ] Each cast site is a named, documented single-purpose cast
- [ ] `tsc --noEmit` clean; no behavior change (96/96 tests)

---

## 6. Justify or drop the `TauriLink<TContext>` generic ☐

**Effort:** XS · **Value:** low · **Priority: any time**

### Problem

`TauriLink<TContext>` and `CallOptions<TContext>` carry a generic whose only consumer is `CallOptions.context`, which the link never reads or forwards (server-side context does not apply to Tauri IPC — commands receive plain args). Vestigial generics mislead users into expecting context propagation.

### Proposal

Either drop the generic (hardcode `TauriLink` non-generic; keep `CallOptions.context` only if oRPC's client contract requires the field), **or** document explicitly that it exists solely to satisfy oRPC's client type and is not sent anywhere.

### Acceptance criteria

- [ ] Generic removed or documented with its single-purpose justification
- [ ] oRPC client construction still type-checks against the (possibly simpler) link type

---

## 7. `createTauriClient` convenience factory ☐

**Effort:** XS · **Value:** medium DX sugar · **Priority: optional, last**

### Problem

Every app writes the same two-step setup in `rpc/index.ts`:

```ts
const link = new TauriLink(contract);
export const client = createORPCClient(link);
```

### Proposal

```ts
export const createTauriClient = (contract: Contract, options?: TauriLinkOptions) =>
  createORPCClient(new TauriLink(contract, options));
```

Export from both entrypoints, keep `TauriLink` exported for advanced use (the demo app mounts the link for interceptor tricks, so the class stays public).

### Acceptance criteria

- [ ] `createTauriClient` exported from `orpc-tauri` and `orpc-tauri/link`
- [ ] Web app `rpc/index.ts` optionally adopts it (no requirement)
- [ ] README quick-start shows the one-liner alongside the explicit two-step

---

## 8. Rust `Resource` handles — server-side cancellation and stateful handles ☑

**Effort:** M–L · **Value:** high (closes the one limit item 3 preserved) · **Priority: after 4; optional**

> **Done notes.** Shipped as designed. `TauriResourceConfig` (`autoClose` default true,
> `??` merge) + `tauri.resource()` meta; `RustResourceHandle`/`asResourceHandle` in
> `src/resource-handle.ts`; host close via the built-in `plugin:resources|close` IPC driven by
> `TauriInvoker` (zero new services, zero mock-layer churn); `handle:<rid>` envelope parsing in
> `src/streaming/handle.ts` (first announcement wins, malformed swallowed), wired into **both**
> transports in `channel-stream.ts` / `event-stream.ts`; abnormal-exit auto-close via the stream
> `Scope` finalizer (`resourceTeardown` in `stream-utils.ts`) — success exits never close; early
> consumer exit works because `streamToAsyncIterator` now calls `reader.cancel()` on unfinished
> streams (previously only `releaseLock`); `TauriLink.resource.close()` facade. Rust demo in
> `commands/resource.rs` (`db_open`/`db_query`/`db_close` + `resource_file_download` with a
> `TransferHandle` whose `Resource::close` flips the cancel token; worker drops its own rid on
> completion), plus `Event::default().handle(rid)` builder in broadcast.rs. Contract: `resource.*`
> routes with `ResourceHandleSchema`; demo UI in `routes/-components/resource-tab.tsx`
> (lifecycle + cancellable transfer). Tests: envelope parsing, close-on-abort/failure/early-exit,
> no-close-on-done, first-wins, autoClose:false, plus link-level abort/.return() teardown
> (113 passing).

### Problem

Item 3 made cancellation client-safe, but deliberately stopped at the webview boundary:
abort interrupts consumption, unregisters the channel — and **the Rust task keeps running**
(the AGENTS.md gotcha: "Tauri has no server-side cancellation"). A cancelled 2 GB download burns
CPU/network to completion invisibly. Symmetrically, the library has no story for *stateful* 
Rust-side objects (connections, workers, live sessions): oRPC calls are stateless `{input → output}`.

Tauri ships the primitive already — the **Resource protocol** (`@tauri-apps/api/core`
`Resource` class, `core:resources:allow-close` in the default permission set): Rust
allocates an object into the resource table, hands back a numeric `rid`, and any
`Resource.close()` (or `using`/`await using` dispose) drops it **server-side, deterministically**.

### Design principle

The link does **not** invent resource management — Tauri owns the `rid` protocol and
lifecycle permissions. The link contributes exactly what it already owns elsewhere:
1. **The contract layer** — typed, metadata-driven declarations (like `tauri.channel(...)`)
2. **The JS-side lifecycle** — binding handle teardown to the Effect `Scope` finalizers
   (like listener unlisten / channel unregister, no manual cleanup for users)

### API shape

#### Contract metadata (`src/metadata.ts`, `src/types.ts`)

```ts
// Marks a procedure as resource-backed. Presence drives lifecycle inside the link.
tauri.resource({ autoClose?: boolean })   // default: autoClose = true (see semantics)
```

```ts
interface TauriMeta {
  // ...
  resource?: { autoClose?: boolean };  // merged with ??-semantics like the other singular fields
}
```

#### Typed handles (`src/types.ts` — exported from both entrypoints)

```ts
declare const ResourceBrand: unique symbol;

/** A JS-side reference to an object owned by the Rust resource table. */
export type RustResourceHandle = {
  readonly rid: number;
  readonly [ResourceBrand]: typeof ResourceBrand;
};

/** Widens a plain serialized payload into a handle (for custom invokers/tests). */
export const asResourceHandle = (rid: number): RustResourceHandle => ...
```

Consumer ergonomics stay oRPC-native: a producing procedure's output types as a plain
`RustResourceHandle` (verify contract schema accepts the branded type — with zod it is
`z.object({ rid: z.number() }).brand()` or the link maps post-validation;
**decide during implementation**); a consuming procedure's input takes
`RustResourceHandle | number` on the wire (`rid`), so branding is pure compile-time.

#### Lifecycle service (`src/services/resource.ts`)

```ts
// Wraps `new Resource(rid).close()` from @tauri-apps/api/core — a thin public-API
// shim, mockable like TauriInvoker / TauriListener / TauriChannelFactory.
export interface TauriResourceService {
  close(handle: RustResourceHandle): Promise<void>;  // Effect-wrapped at call sites
}
```

#### Resource facade (`src/public-api.ts`)

Public escape hatches for the stateful-handle pattern (mirrors `.call` / `.stream`):

```ts
// On TauriLink (Promise facade):
link.resource.open(proc, input, options?)          // thin alias: call a resource-producing procedure
link.resource.close(handle: RustResourceHandle)    // explicit close; idempotent (Tauri core tolerates)
```

No new `CallOptions` members — auto-close is metadata-driven, not per-call.

#### Server-side cancellation protocol (wire convention, mirrors `progress:`)

For **streaming** procedures marked `tauri.resource()`, the Rust command announces the
task's handle once, as a data-less control envelope (same envelope family as
`flush` / `progress:` / `done`):

```text
comment: "handle:<rid>"     // exactly once, before/with the first data chunk
```

`src/streaming/handle.ts`: `parseHandleEnvelope(comment)` + `HANDLE_PREFIX` const —
swallowed by the parser pipeline like unknown/progress comments; never yielded.

#### Link lifecycle semantics (`link.ts` / `channel-stream.ts` / `event-stream.ts`)

| Stream exit | `autoClose: true` (default) | `autoClose: false` |
|---|---|---|
| Normal completion (`done`) | no close — Rust owns its lifecycle (command likely already dropped the resource on completion) | no close |
| Consumer cancel (abort) | **close rid** after channel/listener teardown (the item-3 finalizer gains `TauriResourceService.close`) | no close |
| Failure (error event / invoke error) | **close rid** | no close |
| Consumer early exit (`.return()` / `break`) | **close rid** | no close |

Rules:
- Close runs **after** message-pipeline teardown, **never rethrows** — a failed close is
  logged (via injected logger) and never masks the cancellation/failure cause of the iterator.
- Close is best-effort, bounded — the finalizer must not block or await indefinitely;
  bound the close invoke with the same short-deadline conventions item 2 introduced.
- `handle:<rid>` absent (unmarked stream, or server didn't announce) → finalizer no-ops.
  This keeps the feature **fully backward compatible**: old Rust commands are unaffected.
- Composes with the item-2 inactivity timeout: whichever fires first tears the stream
  down, and the finalizer closes the resource regardless of the exit cause.

#### Rust-side reference shape (README documentation, not package code)

```rust
#[tauri::command]
async fn download_file(
    input: DownloadFileInput,
    on_event: Channel<Event>,
    window: tauri::WebviewWindow,
) -> Result<usize, AppError>
{
    // Handle owns its CancellationToken; dropping the resource cancels the task.
    let handle = TransferHandle::new(on_event, CancellationToken::new());
    let rid = window.resources_table().add(handle)?;             // allocate in resource table
    on_event.send(Event::default().comment(&format!("handle:{rid}")))?;  // announce once

    // Spawn the worker; the chunk loop checks the token each iteration.
    // Normal completion: the worker removes its own resource (self-lifecycle).
    Ok(total)
}
```

The link only *consumes* this convention; Rust apps opt in with ~10 lines. **Documented
constraint**: the announcing envelope is sent exactly once per stream; duplicate
`handle:` comments are ignored by the link (first wins).

#### Shape example — backend ⇄ client (illustrative, no implementation)

Only signatures and the control flow; bodies are `todo!()`-level. Three scenarios:
**resource-producing call → resource-consuming call → explicit close** (stateful handles),
and **cancellable stream** (server-side cancellation via `handle:<rid>`).

**Rust backend — `commands/db.rs` (stateful handles):**

```rust
// Result payload of `db_open`: the ONLY contract obligation the link cares
// about — `{ rid }` serialized. The struct contents stay app-private.
#[derive(Debug, Serialize)]
pub struct ResourceRef {
    pub rid: u32,
}

#[tauri::command]
pub async fn db_open(
    input: DbOpenInput,                 // { path: string }
    window: tauri::WebviewWindow,       // access to the resource table
) -> Result<ResourceRef, AppError> {
    // todo: open app-private state (never crosses the wire)
    let conn = DatabaseConn::open(&input.path).await?;
    // todo: add to the resource table; Drop closes the connection
    let rid = window.resources_table().add(conn)?;
    Ok(ResourceRef { rid })
}

#[tauri::command]
pub async fn db_query(
    input: DbQueryInput,   // { handle: { rid: number } | number, sql: string }
    window: tauri::WebviewWindow,
) -> Result<Vec<Row>, AppError> {
    // todo: resources_table().get::<DatabaseConn>(input.handle.rid)
    //       (accepts { rid } or a bare number — normalize on the Rust side)
    //       missing rid => NOT_FOUND
    todo!()
}

#[tauri::command]
pub async fn db_close(
    input: DbCloseInput, // { handle: { rid } | number }
    window: tauri::WebviewWindow,
) -> Result<(), AppError> {
    // todo: resources_table().remove(input.handle.rid) — idempotent;
    //       missing rid => Ok(()) (both the link's auto-close and the
    //       manual facade funnel into this same shape)
    todo!()
}
```

**Rust backend — `commands/file.rs` (cancellable download, resource-backed stream):**

```rust
#[tauri::command]
pub async fn download_file(
    input: DownloadFileInput,
    window: tauri::WebviewWindow,
    on_event: tauri::ipc::Channel<Event>,   // transport param name, verbatim
) -> Result<usize, AppError> {
    // Envelope order (control comments are data-less, never yielded):
    //   1. "flush"        — connection setup (already implemented)
    //   2. "handle:<rid>" — NEW: announce this task's resource id, exactly once
    //   3. "progress:r/t" — progress ticks (already implemented)
    //   4. "message"      — payload chunks
    //   5. "done"         — terminal (already implemented); worker removes its resource
    //
    // todo: register a TransferHandle { token, worker } in the resource table;
    //       Drop of the resource cancels the token (drop-on-close).
    // todo: chunk loop checks the token each iteration — server-side cancellation;
    //       the link's auto-close on abort reaches it with zero Rust additions.
    todo!()
}
```

**Contract — `apps/web/src/rpc/contract.ts` (metadata declarations only):**

```ts
// Shared schema: over-the-wire it is a plain `{ rid }`; the brand is erased
// at this boundary and lives purely in TS.
export const ResourceRefSchema = z.object({ rid: z.number().int().min(0) });

db: {
  // resource-PRODUCING call: metadata marks it; output schema stays plain
  db_open: oc
    .meta(tauri.resource())                 // presence => link exposes lifecycle hooks
    .input(z.object({ path: z.string() }))
    .output(ResourceRefSchema),             // types as RustResourceHandle client-side

  // resource-CONSUMING call: input accepts the branded handle (or raw rid)
  db_query: oc
    .meta(tauri.resource())                 // informs link the call depends on a live resource
    .input(z.object({
      handle: ResourceRefSchema,            // accepted: { rid } | number on the wire
      sql: z.string(),
    }))
    .output(z.array(RowSchema)),

  db_close: oc
    .meta(tauri.resource({ autoClose: false })) // explicit manual close, opt-out of auto
    .input(z.object({ handle: ResourceRefSchema }))
    .output(z.void()),
},

file: {
  // Channel stream + resource-backed task: BOTH metas compose (like item 2 did)
  download_file: oc
    .meta(tauri.channel("on_event"), tauri.resource()) // default autoClose = true
    .input(z.object({
      input: z.object({ total_bytes: z.number().int().optional() }),
    }))
    .output(asyncIteratorObject(FileChunkSchema)),
},
```

**Client — app code (`for await` + cancellation, stateful handles):**

```ts
// ── Stateful-handle pattern: open -> use(rid) -> close ─────────────────
const handle = await client.db.db_open({ input: { path: "app.db" } });
// handle: RustResourceHandle — plain { rid: 1 }

const rows = await client.db.db_query({
  input: { handle, sql: "select * from planets" },
});

await link.resource.close(handle);          // explicit: resource table Drop => conn closed
// …or get the raw primitive any time:
await new Resource(handle.rid).close();     // @tauri-apps/api/core, same target

// ── Cancellable-stream pattern: server-side teardown on abort ──────────
const controller = new AbortController();

const download = await client.file.download_file(
  { input: { total_bytes: 16 * 1024 * 1024 } },
  {
    signal: controller.signal,              // item 3: consumer-side teardown
    onProgress: (info) => bar.update(info),
  },
);

for await (const chunk of download) {
  bar.paint(chunk);
}
// controller.abort() here ⇒
//   1. Scope teardown (item 3): interrupt + unregister channel
//   2. Item 8 finalizer: `handle:<rid>` was announced → Resource.close(rid)
//   3. Rust: token cancelled → worker exits within one DEMO_DELAY tick
// for-await rejects: ORPCError("CLIENT_CLOSED_REQUEST") — same shape as item 3
```

**What exists at each layer after item 8 lands:**

| Layer | Ships in the item? | Shape shipped |
|---|---|---|
| `ResourceRef`/wire `{ rid }` | ✅ link (types + docs) | `RustResourceHandle` brand, `asResourceHandle` |
| Rust `commands/db.rs` commands | ✅ demo app (signatures → body) | stateful-handle demo pattern |
| `download_file` handle envelope + token loop | ✅ demo app | server-side cancellation reference |
| `link.resource.{open,close}` facade | ✅ link | promise methods mirroring `.call` / `.stream` |
| `tauri.resource` meta + auto-close finalizer | ✅ link | the control plane of this feature |


### Acceptance criteria

- [ ] `tauri.resource()` meta flows end-to-end: resolver, `StreamConfig`/call path, merge (`??`)
- [ ] `RustResourceHandle` branded type exported from both entrypoints; over-the-wire payload is plain `{ rid: number }` — branding is erased at the boundary, zero runtime difference
- [ ] `TauriResourceService`: `close(handle)` wraps `@tauri-apps/api/core` Resource close; mockable in tests like other services
- [ ] Interrupted (aborted) marked stream: finalizer invokes close once with the announced rid; failed close is swallowed and logged, not propagated
- [ ] Failed marked stream: same close-once guarantee; normal completion: **no** close by default
- [ ] No `handle:` envelope present → byte-identical behavior to today (existing 104 tests untouched)
- [ ] Rust demo `download_file` resource-backed: after UI cancel, worker stops within one `DEMO_DELAY` tick (visible in log/console — no phantom "complete" after cancel)
- [ ] README: "Resource-backed streams" section (wire convention table + Rust reference shape + lifecycle semantics), AGENTS.md conventions + gotchas updated
- [ ] Web demo: cancelling the download stops production server-side (worker halts within one `DEMO_DELAY` tick)

### Explicitly out of scope (recorded, deferred)

- Generic "stateful connection" client sugar (auto-generated granular method objects over the rid) — a consumer pattern, not a link concern; revisit only with a real demand case.
- Rust-side capability declarations beyond the default `core:resources` set.

---

## Reference: audit evidence

- Exports: `packages/tauri-link/src/index.ts`, `src/link.export.ts` (dual entrypoints)
- Public surface: `src/public-api.ts` (`TauriLink`, `callEffect`, `createChannelStream`, `createEventStream`)
- Meta types: `src/types.ts` (`TauriMeta`, `CallOptions`, `TauriTransportConfig`, `TauriLinkOptions`)
- Transport resolution: `src/resolvers/procedure-resolver.ts` `getTransport()` — default `channel` in all fallback cases
- Dead fields: grep `timeout|permissions|tags` in `src/` — only `types.ts`, `metadata.ts` (merge), `meta.export.ts` docs mention
- Progress machinery: `src/streaming/progress.ts` (`parseProgress(prefix)`, `makeProgressParser`), `src/streaming/channel-stream.ts` (only consumer)
