import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('mobile viewport allows user zoom for accessibility', () => {
  const match = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);
  assert.ok(match, 'viewport meta tag missing');
  const content = match[1];
  assert.match(content, /width=device-width/);
  assert.match(content, /initial-scale=1(?:\.0)?/);
  assert.doesNotMatch(content, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(content, /maximum-scale\s*=\s*1(?:\.0)?/i);
});
