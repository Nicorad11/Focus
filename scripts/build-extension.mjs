#!/usr/bin/env node
// Builds the Leeward browser helper for Chromium browsers (Chrome, Edge, Brave, Opera) and Firefox.
//
//   node scripts/build-extension.mjs   →  extension/dist/chromium, extension/dist/firefox
//
// Both builds share the same files; only the manifest's background section differs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension', 'src');
const dist = path.join(root, 'extension', 'dist');
const base = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.base.json'), 'utf8'));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const targets = {
  chromium: { ...base, version, background: { service_worker: 'background.js' }, minimum_chrome_version: '116' },
  firefox: {
    ...base,
    version,
    background: { scripts: ['background.js'] },
    browser_specific_settings: { gecko: { id: 'helper@leeward.app', strict_min_version: '128.0' } },
  },
};

fs.rmSync(dist, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(dist, name);
  fs.cpSync(src, out, { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
fs.writeFileSync(
  path.join(dist, 'README.txt'),
  [
    'Leeward helper: blocks the sites on your Batten down list while you are on watch.',
    '',
    'Chrome, Edge, Brave, Opera:',
    '  1. Open chrome://extensions (Edge: edge://extensions).',
    '  2. Turn on Developer mode.',
    '  3. Choose "Load unpacked" and select the "chromium" folder next to this file.',
    '',
    'Firefox:',
    '  1. Open about:debugging#/runtime/this-firefox.',
    '  2. Choose "Load Temporary Add-on" and select manifest.json inside the "firefox" folder.',
    '     (Temporary add-ons are removed when Firefox restarts until the helper is signed by Mozilla.)',
    '',
    'The helper only talks to Leeward on this computer (127.0.0.1). When Leeward is closed it blocks nothing.',
    '',
  ].join('\r\n'),
);
console.log(`extension ${version}: ${Object.keys(targets).map((t) => path.relative(root, path.join(dist, t))).join(', ')}`);
