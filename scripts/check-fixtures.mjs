#!/usr/bin/env node
// Principle V: fixtures must only contain obviously fake identifiers.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../tests/fixtures/', import.meta.url).pathname;
const BILLING = /\b([0-9A-F]{6})-([0-9A-F]{6})-([0-9A-F]{6})\b/g;
const FAKE_BILLING = /^(\d)\1{5}-\1{6}-\1{6}$/;
const PROJECT = /(?:"projectId"\s*:\s*"|projects\/)([a-z][a-z0-9-]{4,28}[a-z0-9])/g;
const FAKE_PROJECT = /^(fake-|example-)/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const problems = [];
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(BILLING)) {
    if (!FAKE_BILLING.test(m[0])) problems.push(`${file}: billing account id ${m[0]}`);
  }
  for (const m of text.matchAll(PROJECT)) {
    if (!FAKE_PROJECT.test(m[1])) problems.push(`${file}: project id ${m[1]}`);
  }
}
if (problems.length) {
  console.error('Fixtures contain real-looking identifiers:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('fixtures ok');
