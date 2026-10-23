#!/usr/bin/env node
// Writes the current asset content hash into index.html's cache-busting sites.
//
//   node tools/stamp-version.js         rewrite index.html if the stamp is stale
//   node tools/stamp-version.js --check exit 1 if the stamp is stale (no writes)
//
// Run this after changing tools/deal-tools.js, tools/grid-entry.js, the rate
// card, precisiontrak_data.json, or a radio_data_*.json book. The test suite
// fails if you forget.

const fs = require('fs');
const path = require('path');
const { ROOT, computeVersion, STAMP_SITES, readStamps } = require('./asset-version.js');

const INDEX = path.join(ROOT, 'index.html');
const checkOnly = process.argv.includes('--check');

const version = computeVersion();
let html = fs.readFileSync(INDEX, 'utf8');

const missing = STAMP_SITES.filter(site => !site.re.test(html));
if (missing.length) {
  console.error('stamp-version: could not find in index.html:');
  missing.forEach(site => console.error(`  - ${site.label}`));
  process.exit(1);
}

const stale = readStamps(html).filter(s => s.value !== version);
if (!stale.length) {
  console.log(`stamp-version: index.html is current at v=${version}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`stamp-version: index.html is STALE. Expected v=${version}.`);
  stale.forEach(s => console.error(`  - ${s.label} has v=${s.value}`));
  console.error('Run: npm run stamp');
  process.exit(1);
}

STAMP_SITES.forEach(site => {
  html = html.replace(site.re, `$1${version}$3`);
});
fs.writeFileSync(INDEX, html);
console.log(`stamp-version: index.html stamped v=${version} (${stale.length} site(s) updated)`);
