# UI Parity Check

Generated: 2026-04-16

This document tracks parity between `tools/deal-tools.js` and the existing `index.html` UI behavior.

---

## Summary

| Category | Parity Status | Notes |
|----------|---------------|-------|
| Barter Formula | MATCH | Same formula: `(AQH × Minutes × CPM × 728) / 1000` |
| TopLine Pricing | MATCH | All tiers, overages, and add-ons match |
| Content Automation Pricing | MATCH | All tiers match rate card |
| SpotOn Pricing | MATCH | $4/credit, 50-credit increments |
| Standard Products | MATCH | Per-station pricing matches rate card |
| Deal Types | MATCH | `broadcast` and `agency` behave identically |
| Barter Allocation | MATCH | Proportional AQH allocation, ceiling rounding |
| Mixed Payment | MATCH | Cash subtracted from total, remainder to barter |

---

## New Functionality (Sprint 1 Extensions)

### Media Types

The tools add a `mediaType` field not present in the original UI:

| mediaType | Behavior | UI Equivalent |
|-----------|----------|---------------|
| `Radio` | Full barter support, AQH from Nielsen book | Default `broadcast` deal |
| `TV` | Cash-only, no barter allocation | N/A (new capability) |
| `AgencyOther` | Flat pricing, no stations | `agency` deal type |

**Parity Note:** The original UI only supports Radio. TV support is a new capability for the tools API.

### Off-Book Stations

The tools support stations not found in the Nielsen book:

| Field | In-Book Station | Off-Book Station |
|-------|-----------------|------------------|
| `inBook` | `true` | `false` |
| `primeAQH` | Number > 0 | `null` |
| `rosAQH` | Number > 0 | `null` |
| `format` | From Nielsen | `'Unknown'` |

**Parity Note:** The original UI only supports stations from the Nielsen book. Off-book support enables TV deals and manual station entry.

---

## Detailed Formula Verification

### Barter Value Formula

**UI Implementation (index.html lines 1054-1060):**
```javascript
const valuePerMin = ((aqh * cpm) / 1000) * 728;
```

**Tools Implementation (deal-tools.js):**
```javascript
function calculateValueFromMinutes(minutesPerDay, aqh, cpm) {
  return (aqh * minutesPerDay * cpm * BARTER_FORMULA.ANNUAL_MULTIPLIER) / 1000;
}
// ANNUAL_MULTIPLIER = 728 (2 dayparts × 7 days × 52 weeks)
```

**Verification:**
- UI: `(24800 × 2 / 1000) × 728` = $36,108.80/minute/year
- Tools: `(24800 × 1 × 2 × 728) / 1000` = $36,108.80

### TopLine Pricing

**UI Implementation (index.html lines 135-144):**
```javascript
const TOPLINE_PRICING = {
  tiers: { access: 42000, enterprise: 30000, both: 72000 },
  usersIncluded: 5,
  additionalUserMonthly: 250,
  accountsIncluded: 220,
  additionalAccountBlockMonthly: 25,
  // ...
};
```

**Tools Implementation:**
```javascript
const TOPLINE_PRICING = {
  tierPrices: { access: 42000, enterprise: 30000, both: 72000 },
  usersIncluded: 5,
  additionalUserMonthly: 250,
  accountsIncluded: 220,
  additionalAccountBlockMonthly: 25,
  // ...
};
```

**Verification:** All values match.

---

## API Return Format Changes

### lookupParent

**Previous:** Returned array of results
**Current:** Returns object with `results` array and `canCreateNew` flag

```javascript
// Old format
const results = lookupParent('iHeart', options);
results[0].parentName; // 'iHeartMedia, Inc.'

// New format
const { results, canCreateNew } = lookupParent('iHeart', options);
results[0].parentName; // 'iHeartMedia, Inc.'
results[0].inBook;     // true
canCreateNew;          // false (exact match found)
```

### lookupStations

**Previous:** Returned array of stations
**Current:** Returns object with `results` array and `canCreateNew` flag

```javascript
// Old format
const stations = lookupStations(parent, market, query, options);
stations[0].stationCallSign; // 'WLTW-FM'

// New format
const { results, canCreateNew } = lookupStations(parent, market, query, options);
results[0].stationCallSign; // 'WLTW-FM'
results[0].inBook;          // true
canCreateNew;               // false (stations found)
```

### buildDeal

**New fields added:**
- `mediaType` - 'Radio' | 'TV' | 'AgencyOther'
- `stationDetails` - Full station objects with `inBook` flags
- `hasOffBookStations` - Boolean
- `hasMixedStations` - Boolean
- `inBookStationCount` - Number
- `offBookStationCount` - Number

---

## Test Coverage

| Test Category | Count | Status |
|---------------|-------|--------|
| lookupParent | 2 | PASS |
| lookupMarkets | 2 | PASS |
| lookupStations | 2 | PASS |
| getProductCatalog | 1 | PASS |
| calculateProductPrice | 5 | PASS |
| calculateBarterMinutes | 5 | PASS |
| buildDeal (standard) | 5 | PASS |
| buildDeal (TV) | 1 | PASS |
| buildDeal (mixed stations) | 1 | PASS |
| validateDeal | 4 | PASS |
| createOffBookStation | 1 | PASS |
| **Total** | **29** | **ALL PASS** |

---

## Known Differences

1. **Media Type Field**: New concept not in original UI. Defaults to 'Radio' for broadcast deals, 'AgencyOther' for agency deals.

2. **Off-Book Station Support**: New capability. Original UI requires all stations from Nielsen book.

3. **TV Cash-Only Enforcement**: Tools automatically force `pricingType: 'cash'` for TV deals. Original UI doesn't have this concept.

4. **API Return Format**: `lookupParent` and `lookupStations` now return objects with metadata instead of raw arrays. This enables the `canCreateNew` flag for off-book support.

---

## Backward Compatibility Notes

All existing deal calculation logic is preserved. The only breaking changes are:

1. `lookupParent()` returns `{ results, canCreateNew }` instead of array
2. `lookupStations()` returns `{ results, canCreateNew }` instead of array

Code using these functions needs to update:
```javascript
// Before
const parents = DealTools.lookupParent('iHeart', options);

// After
const { results: parents } = DealTools.lookupParent('iHeart', options);
```
