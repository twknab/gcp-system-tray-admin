# Contract: `cloudbar` CLI

The entry point is `node dist/cli.js <command> [flags]`. The SwiftBar shim calls it with no
command, which means `render`.

| Command | Behaviour | Exit code | Stdout |
|---------|-----------|-----------|--------|
| `render` (default) | Load the cache, refresh only stale sources (all of them if `SWIFTBAR_PLUGIN_REFRESH_REASON=MenuAction`), save, then print the menu. | always 0, so SwiftBar never shows a raw error | SwiftBar lines (see `swiftbar-output.md`) |
| `refresh` | Ignore every TTL and refetch all sources. Prints nothing. The menu item calls it with `refresh=true`. | 0 | none |
| `doctor` | Run the setup checks. | 0 if every check passes, 1 if any fails | Human-readable text. With `--swiftbar`, SwiftBar lines for a submenu instead. |
| `render --fixture <name>` | Render from `tests/fixtures/<name>.json`. No network. Used in development and review. | 0 | SwiftBar lines |

**Flags**: `--config <path>` overrides `~/.config/cloudbar/config.json`. `--no-cache` runs the
command in memory only.

**Environment variables read**:

- `SWIFTBAR_PLUGIN_CACHE_PATH`
- `SWIFTBAR_PLUGIN_REFRESH_REASON`
- `OS_APPEARANCE`
- `CLOUDBAR_CONFIG`
- `GOOGLE_APPLICATION_CREDENTIALS`, which the auth library honours

**Guarantees**:

- `render` finishes within 30 s of wall time, and always prints a valid header line plus at least
  the Shortcuts section.
- No command writes anywhere except the cache directory.
- No command makes a mutating cloud call (enforced by the guard in `http.ts`).
