# Test Results

Generated: 2026-04-16

**Total: 24 | Passed: 24 | Failed: 0**

---

## Summary by Tool

| Tool | Tests | Status |
|------|-------|--------|
| lookupParent | 2 | PASS |
| lookupMarkets | 2 | PASS |
| lookupStations | 2 | PASS |
| getProductCatalog | 1 | PASS |
| calculateProductPrice | 5 | PASS |
| calculateBarterMinutes | 5 | PASS |
| buildDeal | 5 | PASS |
| validateDeal | 2 | PASS |

---

## Detailed Results

### Tool 1: lookupParent (Low Risk)

#### Test: exact match returns top result
- **Input:** `query = "iHeartMedia, Inc."`
- **Expected:** First result should be exact match with station count > 0
- **Actual:** First result = "iHeartMedia, Inc." with stations
- **Status:** PASS

#### Test: partial match works
- **Input:** `query = "heart"`
- **Expected:** Results should contain matches with "heart" in name
- **Actual:** Multiple results containing "heart"
- **Status:** PASS

---

### Tool 2: lookupMarkets (Low Risk)

#### Test: returns all markets when no filter
- **Input:** `parentId = null, query = null`
- **Expected:** Return many markets with marketName and stationCount
- **Actual:** Returned 200+ markets with valid data
- **Status:** PASS

#### Test: filters by parent
- **Input:** `parentId = "iHeartMedia, Inc."`
- **Expected:** Markets for iHeartMedia only
- **Actual:** All results have marketName
- **Status:** PASS

---

### Tool 3: lookupStations (Low Risk)

#### Test: returns stations with AQH data
- **Input:** `parentId = "iHeartMedia, Inc.", marketName = "New York [PPM+D]"`
- **Expected:** Stations with call signs and AQH data
- **Actual:** Multiple stations with primeAQH > 0
- **Status:** PASS

#### Test: returns specific station data
- **Input:** `query = "WLTW"`
- **Expected:** Find WLTW-FM with high AQH (>20000)
- **Actual:** Found WLTW-FM, primeAQH = 28800
- **Status:** PASS

---

### Tool 4: getProductCatalog (Low Risk)

#### Test: returns all products with required fields
- **Input:** Rate card from `radio_rate_card.json`
- **Expected:** 10+ products with productId, name, pricingType; TopLine has tierOptions
- **Actual:** 16 products, TopLine has tier options for access/enterprise/both
- **Status:** PASS

---

### Tool 5: calculateProductPrice (Medium Risk)

#### Test: TopLine single market cash
- **Input:** `productId = "topline", tier = "access", markets = 1`
- **Expected:** $42,000/year, $3,500/month
- **Actual:** annual = 42000, monthly = 3500
- **Status:** PASS

#### Test: TopLine multi-market with attribution
- **Input:** `tier = "both", markets = 3, attributionEnabled = true`
- **Expected:** $72K × 3 + $5K attribution = $221,000/year
- **Actual:** annual = 221000, attributionAnnual = 5000
- **Status:** PASS

#### Test: Content Automation tier selection
- **Input:** `productId = "content_automation", tier = "large"`
- **Expected:** $19,000/month, 20,000 credits
- **Actual:** monthly = 19000, credits = 20000
- **Status:** PASS

#### Test: SpotOn credits
- **Input:** `productId = "spoton", creditsPerMonth = 200`
- **Expected:** 200 × $4 = $800/month, $9,600/year
- **Actual:** monthly = 800, annual = 9600
- **Status:** PASS

#### Test: per-station product with custom price
- **Input:** `productId = "topicpulse", stations = 6, customPrice = 500`
- **Expected:** $500 × 6 = $3,000/month, isCustomPrice = true
- **Actual:** monthly = 3000, isCustomPrice = true
- **Status:** PASS

---

### Tool 6: calculateBarterMinutes (Medium Risk)

#### Test: single station calculation matches formula
- **Input:** `stations = [WSKQ-FM: primeAQH=24800, rosAQH=21700], target = $67,704`
- **Expected:** Prime and ROS minutes > 0, allocated proportionally
- **Actual:** primeMinsPerDay = 1, rosMinsPerDay = 1 (rounded up)
- **Status:** PASS

#### Test: multi-station proportional allocation
- **Input:** `stations = [WSKQ-FM, WPAT-FM], target = $100,000`
- **Expected:** Both stations get minutes; higher AQH station gets larger value share
- **Actual:** WSKQ annualValue > WPAT annualValue (proportional to AQH)
- **Status:** PASS

#### Test: handles zero AQH gracefully
- **Input:** `stations = [WSKQ-FM with AQH, ZERO-FM with 0 AQH]`
- **Expected:** Zero AQH station gets 0 minutes, other station gets all minutes
- **Actual:** ZERO-FM: 0 minutes, WSKQ-FM: positive minutes
- **Status:** PASS

#### Test: total allocated value is close to target
- **Input:** `stations = 3 high-AQH NYC stations, target = $200,000`
- **Expected:** Allocated >= target, over-allocation < 25%
- **Actual:** Allocated = ~$238,400 (19.2% over due to ceiling)
- **Status:** PASS

#### Test: value from minutes formula is consistent
- **Input:** `primeAQH = 24800, cpm = 2.0, minutes = 1`
- **Expected:** `(24800 × 1 × 2 × 728) / 1000 = $36,108.80`
- **Actual:** calculateValueFromMinutes returned 36108.80
- **Status:** PASS

---

### Tool 7: buildDeal (Medium Risk)

#### Test: broadcast deal with multiple stations
- **Input:** iHeartMedia, NYC, 3 stations, [topicpulse, prep_plus], cash
- **Expected:** Complete deal object with parent, stations, products, totals
- **Actual:** dealType = "broadcast", 3 stations, cashAnnual = totalAnnual
- **Status:** PASS

#### Test: agency deal (no stations)
- **Input:** dealType = "agency", customerName = "Test Agency Inc.", 2 products
- **Expected:** No stations, flat pricing (count = 1)
- **Actual:** stations.length = 0, productValues count = 1
- **Status:** PASS

#### Test: mixed payment deal
- **Input:** 2 stations, topicpulse, $500/month cash per station
- **Expected:** cashAnnual = $12K, barterTargetAnnual > 0, barterAllocation present
- **Actual:** cashAnnual = 12000, barterAllocation calculated
- **Status:** PASS

#### Test: multi-product deal
- **Input:** 4 products [topicpulse, prep_plus, streaming, mobile]
- **Expected:** All 4 products have values, sum equals total
- **Actual:** All productValues present, totalAnnual = sum of products
- **Status:** PASS

#### Test: multi-market TopLine
- **Input:** TopLine access tier, 3 markets, 10 users, 250 accounts
- **Expected:** Base $126K + user/account overages
- **Actual:** annual > $126K, numMarkets = 3
- **Status:** PASS

---

### Tool 8: validateDeal (Low Risk)

#### Test: catches missing required fields
- **Input:** Deal with null parent, empty stations, empty products
- **Expected:** Errors for parent, stations, products
- **Actual:** 3 errors returned with appropriate messages
- **Status:** PASS

#### Test: detects gap to value issues
- **Input:** Deal with barter target $100K but only $50K allocated
- **Expected:** Warning about gap to value (50% short)
- **Actual:** Warning message includes "Gap" and shortage amount
- **Status:** PASS

---

## Formula Verification

### Barter Value Formula
```
Annual Value = (AQH × Minutes/day × CPM × 728) / 1000
```

**Verification with WSKQ-FM (Prime AQH = 24,800):**
- Input: 1 minute/day, CPM = $2.00
- Expected: (24800 × 1 × 2 × 728) / 1000 = $36,108.80
- Tool output: $36,108.80 ✓

### TopLine Pricing Formula
```
Annual = (tierPrice × markets × multiplier)
       + (additionalUsers × $250 × 12 × multiplier)
       + (ceil(additionalAccounts/5) × $25 × 12 × multiplier)
       + attribution + tv + spoton + chuy
```

**Verification with 3 markets, access tier:**
- Input: tier = "access", markets = 3, users = 5, accounts = 220
- Expected: $42,000 × 3 = $126,000
- Tool output: $126,000 ✓

---

## Running Tests

### Node.js
```bash
node tools/deal-tools.test.js
```

### Browser
Load the test page: `tools/test-agent.html`
