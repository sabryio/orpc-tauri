/**
 * Converts a snake_case or kebab-case identifier to camelCase.
 *
 * Idempotent: camelCase input is returned unchanged, so helpers can
 * normalize defensively without affecting already-canonical values.
 *
 * - `on_event`        → `onEvent`
 * - `on_event_custom` → `onEventCustom`
 * - `on-event`        → `onEvent`
 * - `onEvent`         → `onEvent`
 */
export function camelCase(value: string): string {
	return value
		.replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
		.replace(/[-_]+/g, "");
}
