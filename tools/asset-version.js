// Computes the cache-busting version stamp for index.html.
//
// There is no build step for this app, so the version is a content hash of the
// assets that index.html loads by URL. Any change to one of them produces a new
// stamp, which changes the URLs in index.html, which forces every browser to
// re-download them. Nobody has to remember to bump a number.
//
// tools/stamp-version.js writes the stamp into index.html; deal-tools.test.js
// fails if the stamp in index.html no longer matches the files on disk.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Assets index.html fetches at runtime. The Nielsen books are globbed so a newly
// committed radio_data_*.json is covered without editing this list.
function versionedAssets() {
  const fixed = [
    'tools/deal-tools.js',
    'tools/grid-entry.js',
    'radio_rate_card.json',
    'precisiontrak_data.json'
  ];
  const books = fs.readdirSync(ROOT)
    .filter(f => /^radio_data.*\.json$/.test(f))
    .sort();
  return fixed.concat(books).filter(rel => fs.existsSync(path.join(ROOT, rel)));
}

function computeVersion() {
  const crypto = require('crypto');
  const lines = versionedAssets().map(rel => {
    const hash = crypto.createHash('sha1')
      .update(fs.readFileSync(path.join(ROOT, rel)))
      .digest('hex');
    return `${rel}:${hash}`;
  });
  return crypto.createHash('sha1').update(lines.join('\n')).digest('hex').slice(0, 10);
}

// The three places the stamp lives in index.html.
const STAMP_SITES = [
  { label: 'deal-tools.js script tag', re: /(<script src="tools\/deal-tools\.js\?v=)([^"]*)(")/ },
  { label: 'grid-entry.js script tag', re: /(<script src="tools\/grid-entry\.js\?v=)([^"]*)(")/ },
  { label: 'APP_VERSION constant',     re: /(const APP_VERSION = ')([^']*)(')/ }
];

function readStamps(html) {
  return STAMP_SITES.map(site => {
    const m = html.match(site.re);
    return { label: site.label, value: m ? m[2] : null };
  });
}

module.exports = { ROOT, versionedAssets, computeVersion, STAMP_SITES, readStamps };
