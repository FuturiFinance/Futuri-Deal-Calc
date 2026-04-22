#!/usr/bin/env node
/**
 * Convert PrecisionTrak CSV to JSON lookup file
 * Normalizes call signs to standard format (WXYZ-FM, KABC-AM)
 */

const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = path.join(__dirname, '..', '6216PrecisionTrak6295146.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

// Parse CSV (simple parser for this specific format)
const lines = csvContent.split('\n');
const stations = {};

// Skip header row
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Parse CSV line (handles quoted fields)
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());

  if (fields.length < 8) continue;

  const [rawCallSign, msa, format, rawSimulcast, hdRaw, multicasts, owner, lma] = fields;

  // Normalize call sign - add dash before AM/FM/HD suffix if missing
  function normalizeCallSign(cs) {
    if (!cs) return null;
    cs = cs.trim().toUpperCase();
    if (!cs) return null;

    // If already has dash in right place, return as-is
    if (/-[AFH][MD]$/.test(cs)) return cs;

    // Add dash before AM, FM, HD suffix
    // Match patterns like WXYZFM, WABCAM, KZZZHD
    const match = cs.match(/^([A-Z0-9]+)(FM|AM|HD)$/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    // Also handle HD2, HD3, etc.
    const hdMatch = cs.match(/^([A-Z0-9]+)(HD[0-9])$/);
    if (hdMatch) {
      return `${hdMatch[1]}-${hdMatch[2]}`;
    }

    // Return as-is if no pattern match
    return cs;
  }

  const callSign = normalizeCallSign(rawCallSign);
  if (!callSign) continue;

  // Normalize simulcast call sign
  const simulcast = normalizeCallSign(rawSimulcast);

  // Parse HD status
  const hd = hdRaw && hdRaw.toLowerCase() === 'yes';

  // Store station data
  stations[callSign] = {
    msa: msa || null,
    format: format || null,
    simulcast: simulcast,
    hd: hd,
    multicasts: multicasts || null,
    owner: owner || null,
    lma: lma || null
  };
}

// Write JSON file
const outputPath = path.join(__dirname, '..', 'precisiontrak_data.json');
const output = {
  generated: new Date().toISOString(),
  source: '6216PrecisionTrak6295146.csv',
  stationCount: Object.keys(stations).length,
  stations: stations
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`Converted ${Object.keys(stations).length} stations to ${outputPath}`);

// Show some examples
console.log('\nSample stations:');
const samples = Object.entries(stations).slice(0, 5);
samples.forEach(([cs, data]) => {
  console.log(`  ${cs}: format=${data.format}, hd=${data.hd}, simulcast=${data.simulcast}`);
});

// Show simulcast examples
console.log('\nStations with simulcast partners:');
let simulcastCount = 0;
Object.entries(stations).forEach(([cs, data]) => {
  if (data.simulcast && simulcastCount < 5) {
    console.log(`  ${cs} <-> ${data.simulcast}`);
    simulcastCount++;
  }
});

// Show HD stations count
const hdCount = Object.values(stations).filter(s => s.hd).length;
console.log(`\nHD stations: ${hdCount}`);
