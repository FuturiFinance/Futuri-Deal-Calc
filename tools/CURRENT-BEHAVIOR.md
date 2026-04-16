# Current Behavior Documentation

This document describes how the existing Deal Calculator app works. This is a reference for building standalone tool functions that replicate this behavior exactly.

## Table of Contents
1. [Station Data Lookup](#station-data-lookup)
2. [Product Price Calculation](#product-price-calculation)
3. [Barter Minutes Calculation](#barter-minutes-calculation)
4. [Deal Object Structure](#deal-object-structure)
5. [Gap to Value Calculation](#gap-to-value-calculation)

---

## Station Data Lookup

### Data Sources
- **Nielsen book files**: `radio_data_fall2025.json`, `radio_data.json`
- **Rate card**: `radio_rate_card.json`
- Books can be uploaded/managed via Firebase

### Data Structure

Nielsen book JSON structure:
```json
{
  "parents": ["iHeartMedia, Inc.", "Audacy", ...],
  "markets": ["New York [PPM+D]", "Los Angeles [PPM+D]", ...],
  "stations": [
    {
      "parent": "iHeartMedia, Inc.",
      "market": "New York [PPM+D]",
      "station": "WLTW-FM",
      "format": "Adult Contmp.",
      "primeAQH": 28800,
      "rosAQH": 27700
    },
    ...
  ]
}
```

### Index Structure (`window.IDX`)

The app builds an index at startup:
```javascript
window.IDX = {
  parentSet: new Set(),           // Unique parent company names
  marketSet: new Set(),           // Unique market names
  stations: [],                   // All stations array
  stationsByParent: new Map(),    // Map<parentName, station[]>
  stationsByParentMarket: new Map() // Map<"parent|market", station[]>
}
```

### Key Functions

**Station key format**: `"parent|market|station"` (e.g., `"iHeartMedia, Inc.|New York [PPM+D]|WLTW-FM"`)

**`getSelectedStationsDetailed()`** (line 6142):
```javascript
function getSelectedStationsDetailed() {
  const out = [];
  (window.IDX.stationsByParent.get(window.state.parent) || []).forEach(s => {
    const key = s.parent + '|' + s.market + '|' + s.station;
    if (window.state.stations.has(key)) out.push({ ...s, key });
  });
  return out;
}
```
Returns array of `{ parent, market, station, format, primeAQH, rosAQH, key }`.

---

## Product Price Calculation

### Product Types

1. **Per-Station Products**: Price × number of stations
   - TopicPulse, Prep+, POST, Streaming, Mobile, LDR

2. **Per-Market Products**: Price × number of markets
   - TopLine, SpotOn (configured via `MARKET_LEVEL_PRODUCTS = ['topline', 'spoton']`)

3. **Flat/Agency Products**: Single price regardless of stations
   - Used in Agency deal type

4. **Tiered Products**: Configuration-driven pricing
   - Content Automation (XS/Small/Medium/Large/XL tiers)
   - TopLine (Access/Enterprise/Both tiers)

5. **Credit-Based Products**: Usage-driven pricing
   - SpotOn ($4/credit, increments of 50)

### Rate Card Structure

```json
{
  "products": [
    { "id": "topline", "name": "TopLine", "cash": null, "barter": null, "industry": "Radio/TV" },
    { "id": "topicpulse", "name": "TopicPulse", "cash": 750, "barter": 1050, "industry": "Radio/TV" },
    ...
  ],
  "barterMultiplier": 1.4,
  "lastUpdated": "2026-02-25"
}
```

- `cash`: Monthly price for cash deals (null = uses calculated/configured value)
- `barter`: Monthly price for barter deals (typically cash × 1.4)

### Special Products (lines 6289-6295)

Products with custom configuration UI:
```javascript
const SPECIAL_PRODUCTS = ['topline', 'topline_cx_war_room', 'content_automation', 'spoton', 'topicpulse_community_radar_fb', 'faai'];
const BARTER_EXCLUDED_PRODUCTS = ['topline_cx_war_room']; // Cash-only
const SPECIAL_PRODUCTS_WITH_CASH_INPUT = ['topline']; // Allow cash override
```

### TopLine Pricing (lines 3887-3977)

```javascript
const TOPLINE_PRICING = {
  tierPrices: { access: 42000, enterprise: 30000, both: 72000 }, // Annual per market
  usersIncluded: 5,
  additionalUserMonthly: 250,
  accountsIncluded: 220,
  additionalAccountBlockMonthly: 25, // per 5 accounts
  attributionAnnual: 5000,
  dataSetPrice: 1000,        // One-time per data set
  crmHourly: 300,
  crmMaintenance: 0.10,      // 10% annual
  spotonPricePerCredit: 4,
  chuyLocationSetup: 99,     // One-time
  chuyLocationMonthly: 10,
  chuyRetailerMonthly: 119,
  tvHardCostsAnnual: 4800
};
```

**`calculateTopLineCosts()`** formula (line 3905):
```javascript
baseAnnual = tierPrices[tier] × numMarkets × multiplier
usersAnnual = (usersNeeded - 5) × 250 × 12 × multiplier
accountsAnnual = ceil((accountsNeeded - 220) / 5) × 25 × 12 × multiplier
baseSubtotal = baseAnnual + usersAnnual + accountsAnnual
attributionAnnual = attributionEnabled ? 5000 × multiplier : 0
tvAnnual = tvEnabled ? 4800 × multiplier : 0
spotonAnnual = spotonCredits × 4 × 12 × multiplier
chuyLocationAnnual = chuyLocations × 10 × 12 × multiplier
chuyRetailerAnnual = chuyRetailers × 119 × 12 × multiplier

calculatedAnnual = baseSubtotal + attributionAnnual + crmMaintenance + tvAnnual + spotonAnnual + chuyLocationAnnual + chuyRetailerAnnual

// Price override if set
totalAnnual = (priceOverride > 0) ? priceOverride : calculatedAnnual
```

Where `multiplier = (pricingType === 'barter') ? 1.4 : 1`

### Content Automation Pricing (lines 3876-4181)

```javascript
const CONTENT_AUTOMATION_PRICING = {
  tiers: {
    xs:     { name: 'XS',     credits: 5000,  monthly: 6500,  costPerCredit: 1.30 },
    small:  { name: 'Small',  credits: 10000, monthly: 12000, costPerCredit: 1.20 },
    medium: { name: 'Medium', credits: 15000, monthly: 16500, costPerCredit: 1.10 },
    large:  { name: 'Large',  credits: 20000, monthly: 19000, costPerCredit: 0.95 },
    xl:     { name: 'XL',     credits: 50000, monthly: 40000, costPerCredit: 0.80 }
  }
};
```

### SpotOn Pricing (lines 3824-3831)

```javascript
const SPOTON_PRICING = {
  pricePerCredit: 4,
  creditIncrement: 50,
  defaultAudioAlloc: 70,
  defaultVideoAlloc: 30,
  audioCredits: 1,      // 1 credit per audio spot
  video15Credits: 4,    // 4 credits per :15 video
  video30Credits: 8     // 8 credits per :30 video
};
```

Monthly cost = `creditsPerMonth × 4 × multiplier`

### FB Groups Pricing

$50/group/month

### FAAI Pricing (lines 3858-3864)

```javascript
const FAAI_PRICING = {
  wordsPerMinute: 150,
  charsPerWord: 5,
  elevenLabsCostPer1000Chars: 0.20,
  llmCostPercent: 0.25,
  daysPerMonth: 30
};
```

Formula:
```
charsPerMonth = numberOfShows × minutesPerDay × 150 × 5 × 30
elevenLabsCost = (charsPerMonth / 1000) × 0.20
llmCost = elevenLabsCost × 0.25
totalAiCost = elevenLabsCost + llmCost
monthlyCash = totalAiCost / (1 - margin/100)
monthlyBarter = monthlyCash × 1.4
```

### Getting Unit List Price (line 6364)

```javascript
function getProductUnitListPrice(product) {
  if (product.isSpecialProduct && product.calculatedValue) {
    return product.calculatedValue;
  }
  const rateCardValue = product.barter || 0;
  const customPrice = window.productState.customPrices.get(product.id);
  return customPrice ?? rateCardValue;
}
```

---

## Barter Minutes Calculation

### Core Formula (lines 6612-6636)

```javascript
const BARTER_FORMULA = {
  DAYPARTS: 2,
  DAYS_PER_WEEK: 7,
  WEEKS_PER_YEAR: 52,
  ANNUAL_MULTIPLIER: 728  // 2 × 7 × 52
};

// Annual Value = (AQH × Minutes/day × CPM × 728) / 1000
function calculateValueFromMinutes(minutesPerDay, aqh, cpm) {
  if (!aqh || !cpm || !minutesPerDay) return 0;
  return (aqh * minutesPerDay * cpm * 728) / 1000;
}

// Minutes/day = (Annual Value × 1000) / (AQH × CPM × 728)
function calculateMinutesFromValue(annualValue, aqh, cpm) {
  if (!aqh || !cpm || !annualValue) return 0;
  return (annualValue * 1000) / (aqh * cpm * 728);
}
```

### Allocation Algorithm (lines 6841-7130, 7154-7277)

The barter minutes calculation:

1. **Per-product calculation**: Each product that participates in barter gets its own allocation

2. **Get assigned stations**: For each product, get assigned stations (market-level products expand to all stations in assigned markets)

3. **Calculate barter target**:
   ```
   productListPriceTotal = unitPrice × assignedStationCount (or just unitPrice for special products)
   productCashTotal = sum of per-station cash inputs
   productBarterMonthly = max(0, productListPriceTotal - productCashTotal)
   productBarterAnnual = productBarterMonthly × 12
   ```

4. **Split between Prime and ROS** proportionally by AQH:
   ```
   primeValueShare = assignedPrimeAQH / (assignedPrimeAQH + assignedRosAQH)
   rosValueShare = assignedRosAQH / (assignedPrimeAQH + assignedRosAQH)
   productPrimeAnnual = productBarterAnnual × primeValueShare
   productRosAnnual = productBarterAnnual × rosValueShare
   ```

5. **Distribute to stations** by their share of each AQH type:
   ```
   stationPrimeShare = stationPrimeAQH / totalAssignedPrimeAQH
   stationRosShare = stationRosAQH / totalAssignedRosAQH

   stationPrimeTargetValue = productPrimeAnnual × stationPrimeShare
   stationRosTargetValue = productRosAnnual × stationRosShare

   primeMinutes = ceil(calculateMinutesFromValue(stationPrimeTargetValue, stationPrimeAQH, cpm))
   rosMinutes = ceil(calculateMinutesFromValue(stationRosTargetValue, stationRosAQH, cpm))
   ```

6. **Manual overrides**: Users can override minutes; stored in `window.productState.manualMinutes` as `Map<"productId:stationKey", {prime, ros}>`

### CPM

Default CPM = $2.00 (stored in `window.productState.cpm`)

---

## Deal Object Structure

### `buildDealPayload()` (lines 2200-2245)

```javascript
{
  // Customer/Selection
  parent: string,
  markets: string[],
  stations: string[],              // Array of "parent|market|station" keys
  dealType: 'broadcast' | 'agency',
  customerName: string,            // For agency deals
  customerLocation: string,        // For agency deals

  // Pricing
  pricingType: 'cash' | 'barter' | 'mixed',
  products: string[],              // Array of product IDs
  customPrices: Object,            // productId -> customPrice
  manualMinutes: Object,           // "productId:stationKey" -> {prime, ros}
  productCashValues: Object,       // "productId:locationKey" -> cashAmount
  productAssignments: Object,      // productId -> locationKey[]
  cpm: number,

  // Product Configurations
  toplineConfig: { tier, numberOfMarkets, usersNeeded, accountsNeeded, attributionEnabled, dataSets, crmIntegrationHours, tvEnabled, spotonCredits, chuyLocations, chuyRetailers, priceOverride },
  contentAutomationConfig: { enabled, tier },
  spotonConfig: { creditsPerMonth, audioAllocation, videoAllocation },
  fbGroupsConfig: { groupCount },
  faaiConfig: { numberOfShows, minutesPerDay, margin },

  // Deal Terms
  dealMeta: { termMonths, autoRenewEnabled, autoRenewMonths, nielsenSeason, nielsenYear },
  notes: string,

  // Metadata
  nielsenBookId: string,
  proposalHTML: string
}
```

---

## Gap to Value Calculation

### `updateGapToValue()` (lines 6643-6838)

Gap to Value shows the breakdown between deal value, cash, and barter components.

1. **Calculate total deal value** (list price):
   ```
   totalAnnualValue = totalMonthlyAllStations × 12
   ```

2. **Calculate per-product breakdown**:
   - For each product, calculate:
     - `productListPriceTotal`: Sum of unit prices × assignments
     - `productCashTotal`: Sum of cash inputs for the product
     - `productBarterTarget`: `max(0, listPrice - cashTotal)`

3. **Calculate allocated barter value**:
   ```javascript
   // Sum up barter value from all products at each station
   stations.forEach(st => {
     barterPerProduct.forEach((stationMap, productId) => {
       const stationBarter = stationMap.get(st.key);
       if (stationBarter) {
         const primeValue = calculateValueFromMinutes(stationBarter.primeMinutes, st.primeAQH, cpm);
         const rosValue = calculateValueFromMinutes(stationBarter.rosMinutes, st.rosAQH, cpm);
         allocatedBarterAnnual += primeValue + rosValue;
       }
     });
   });
   ```

4. **Calculate gap**:
   ```
   totalValueAnnual = totalCashAnnual + allocatedBarterAnnual
   gap = standardProductsListPriceAnnual - totalValueAnnual

   // Shortfall if gap > 5% of target
   isShortfall = gap > 100 && (|gap| / listPrice > 0.05)
   ```

5. **Display status**:
   - Positive gap = shortfall (need more barter)
   - Negative gap = surplus (over-allocated)

---

## Key State Objects

```javascript
window.state = {
  parent: string,
  markets: Set<string>,
  stations: Set<string>,  // "parent|market|station" keys
  dealType: 'broadcast' | 'agency',
  customerName: string,
  customerLocation: string
};

window.productState = {
  selectedProducts: Set<string>,
  pricingType: 'cash' | 'barter' | 'mixed',
  customPrices: Map<productId, number>,
  cpm: number,
  manualMinutes: Map<"productId:stationKey", {prime, ros}>,
  productCashValues: Map<"productId:locationKey", number>,
  productAssignments: Map<productId, Set<locationKey>>
};

window.toplineState = { tier, numberOfMarkets, usersNeeded, accountsNeeded, ... };
window.contentAutomationState = { enabled, tier };
window.spotonState = { creditsPerMonth, audioAllocation, videoAllocation };
window.fbGroupsState = { groupCount };
window.faaiState = { numberOfShows, minutesPerDay, margin };
```

---

## Risks and Edge Cases

1. **Circular dependencies**: TopLine calculation depends on pricing type, which affects multiplier
2. **Market-level vs station-level**: TopLine and SpotOn are per-market; need to expand markets to stations for barter allocation
3. **Manual overrides**: Minutes can be manually adjusted; must preserve these
4. **Price overrides**: TopLine supports price override that bypasses calculated value
5. **Zero AQH**: Stations with 0 AQH should be skipped in barter allocation
6. **Custom prices**: Users can override rate card prices per product
7. **Agency deals**: Single flat price, no station multiplication
8. **Cash-only products**: `topline_cx_war_room` doesn't participate in barter
9. **Special products with cash input**: TopLine can have cash override despite being a special product
