import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../src/config.js';
import type { Snapshot, ViewModel } from '../../src/model/types.js';
import { buildView } from '../../src/model/view.js';
import { renderMenu } from '../../src/render/sections.js';

export const PATHS = { node: '/opt/homebrew/bin/node', cli: '/Users/me/cloudbar/dist/cli.js', docs: '/Users/me/cloudbar/docs/billing-export-setup.md' };

export function loadFixture(name: string): { snapshot: Snapshot; config: ReturnType<typeof parseConfig>; now: Date } {
  const fx = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', `${name}.json`), 'utf8')) as { snapshot: Snapshot; config?: unknown; now?: string };
  return { snapshot: fx.snapshot, config: parseConfig(fx.config ?? {}, '/Users/me/.config/cloudbar/config.json'), now: new Date(fx.now ?? '2026-10-17T12:00:00Z') };
}

export function viewOf(name: string): ViewModel {
  const f = loadFixture(name);
  return buildView(f.snapshot, f.config, f.now, PATHS);
}

export function render(view: ViewModel): string[] {
  const lines = renderMenu(view);
  assertInvariants(lines);
  return lines;
}

/** contracts/swiftbar-output.md → Invariants */
export function assertInvariants(lines: string[]): void {
  // 1. title exists and is the first line
  expect(lines[0]).toBeDefined();
  expect(lines[0]).not.toBe('---');
  for (const line of lines) {
    if (line === '---') continue;
    // 3. the text part never contains an unescaped "|"
    const idx = line.indexOf('| ');
    const text = idx === -1 ? line : line.slice(0, idx);
    expect(text.includes('|'), `unescaped | in: ${line}`).toBe(false);
  }
  // 5. Shortcuts always render
  expect(lines.some((l) => l.startsWith('Refresh |'))).toBe(true);
  expect(lines.some((l) => l.startsWith('Open Cloud Console |'))).toBe(true);
  // 6. setup issues line, if present, sits directly above "Updated"
  const issue = lines.findIndex((l) => /^⚠ \d+ setup issue/.test(l));
  const updated = lines.findIndex((l) => /^(Updated|Not updated)/.test(l));
  if (issue !== -1) {
    const between = lines.slice(issue + 1, updated);
    expect(between.every((l) => l.startsWith('--'))).toBe(true);
  }
}
