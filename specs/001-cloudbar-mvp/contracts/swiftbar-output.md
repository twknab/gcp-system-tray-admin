# Contract: SwiftBar output

## Line grammar

Each line is `<text> | key=value key=value…`:

- `---` is a separator.
- Each leading `--` nests one submenu level deeper.
- The first block, before the first `---`, is the title. A single line is used.

Allowed parameters:

- `sfimage`, `sfcolor`, `sfconfig`
- `color`, `font`, `size`
- `href`, `bash`, `param0..N`, `terminal=false`, `refresh=true`
- `tooltip`, `length`, `trim`, `dropdown=false`

Exact semantics are in research.md R14.

Text is escaped:

- A literal `|` is replaced with `│` (U+2502).
- Every resource or user-supplied string is trimmed and capped with `length=60`. The full value
  goes in `tooltip=`.

## Status vocabulary (FR-020)

| Level | sfimage | sfcolor | Text suffix (submenus) |
|-------|---------|---------|------------------------|
| healthy | `checkmark.circle.fill` | `#34C759` | — |
| degraded | `exclamationmark.triangle.fill` | `#FF9F0A` | "degraded: <reason>" |
| down | `xmark.octagon.fill` | `#FF3B30` | "down: <reason>" |
| unknown | `questionmark.circle` | `#8E8E93` | "<reason>" (e.g. "not monitored") |

## Layout (in order)

```text
$24.82 | sfimage=cloud.fill sfcolor=<overall> dropdown=true        ← title; amount omitted when unavailable; "~$24.82" when partial
---
Billing | sfimage=creditcard
October to date      $24.82 (partial 2 of 3 accounts)
September            $31.45
Budget "Monthly cap"  $50.00 · $25.18 left
Cost data as of 3h ago                                             ← "stale" label when > 24h
--<Account name>  $20.10 MTD · $28.00 last month · budget …        ← one per account
--<Account> Costs unavailable — export not set up | href=<docs>
---
Cloud Run (4) | sfimage=<worst> sfcolor=<worst>
--api · hughes-intel | sfimage=… sfcolor=…
----State: Ready · rev 00042
----Location: us-central1
----Status: healthy
----Open in Console | href=https://console.cloud.google.com/run/detail/…
--and 3 more | href=<service console>                              ← when > 25
--Unavailable in 2 projects
----roam-guru: permission denied: run.services.list
Cloud SQL (2) | …
Vertex AI (3) · us-central1 | …
Cloud Storage (8 buckets · 412 GB) | …                              ← "(partial)" if any size unavailable
---
Alerts | sfimage=bell
No open alerts · 7 policies                                         ← or one line per alert with severity icon + age + href
---
Projects (6) | sfimage=folder
--Hughes Intelligence · 23 APIs | href=https://console.cloud.google.com/home/dashboard?project=…
---
⚠ 2 setup issues | sfimage=exclamationmark.triangle sfcolor=#FF9F0A   ← only when a check fails
--Credentials expired — run: gcloud auth application-default login
Updated 3m ago | color=#8E8E93 size=11
Refresh | sfimage=arrow.clockwise bash=<node> param0=<cli> param1=refresh terminal=false refresh=true
Run setup check… | sfimage=stethoscope bash=<node> param0=<cli> param1=doctor terminal=true
Settings… | sfimage=gearshape bash=/usr/bin/open param0=-t param1=<config path> terminal=false
Open Cloud Console | sfimage=globe href=https://console.cloud.google.com/
```

## Invariants (asserted by render snapshot tests)

1. The title line always exists. It contains no amount when spend is unavailable, and `~` plus
   "(partial…)" in the billing section when spend is partial.
2. Every group header's count equals the number of items, including the "and N more" overflow.
3. No line contains an unescaped `|` in its text part.
4. No item is shown with the healthy symbol unless its Status is `healthy`. Cloud Storage items
   never are.
5. The Shortcuts section always renders, even in the "no cache, no network" state.
6. The "⚠ N setup issues" line appears if and only if at least one `fail` finding exists. It sits
   directly above "Updated …".
7. The four status levels use four different `sfimage` values. Every non-healthy line in a
   submenu carries a text label, so status never depends on colour alone (FR-020).
