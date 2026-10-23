/**
 * Deal Tools Test Suite
 *
 * Tests for tools/deal-tools.js
 * Can run in browser (load deal-tools.js first) or Node.js (require)
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js
    const DealTools = require('./deal-tools.js');
    const path = require('path');
    const fs = require('fs');

    // Load test data
    const nielsenData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'radio_data_spring2026.json'), 'utf8')
    );
    const rateCard = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'radio_rate_card.json'), 'utf8')
    );

    factory(DealTools, nielsenData, rateCard, console.log, console.error);
  } else {
    // Browser - expects DealTools to be loaded globally
    factory(root.DealTools, root._testNielsenData, root._testRateCard, console.log, console.error);
  }
}(typeof self !== 'undefined' ? self : this, function(DealTools, nielsenData, rateCard, log, error) {
  'use strict';

  const results = [];
  let passCount = 0;
  let failCount = 0;

  function test(name, fn) {
    try {
      fn();
      results.push({ name, status: 'PASS', error: null });
      passCount++;
      log(`✓ ${name}`);
    } catch (e) {
      results.push({ name, status: 'FAIL', error: e.message });
      failCount++;
      error(`✗ ${name}: ${e.message}`);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
  }

  function assertClose(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`${message || 'Assertion failed'}: expected ~${expected}, got ${actual} (tolerance: ${tolerance})`);
    }
  }

  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || 'Expected true');
    }
  }

  function assertGreaterThan(actual, threshold, message) {
    if (actual <= threshold) {
      throw new Error(`${message || 'Assertion failed'}: expected > ${threshold}, got ${actual}`);
    }
  }

  // ============================================================================
  // TOOL 1: lookupParent (Low Risk - 2 tests)
  // ============================================================================

  test('lookupParent: exact match returns top result', () => {
    const response = DealTools.lookupParent('iHeartMedia, Inc.', { data: nielsenData });
    assertTrue(response.results.length > 0, 'Should return results');
    assertEqual(response.results[0].parentName, 'iHeartMedia, Inc.', 'First result should be exact match');
    assertGreaterThan(response.results[0].stationCount, 0, 'Should have stations');
    assertTrue(response.results[0].inBook === true, 'In-book parent should have inBook: true');
  });

  test('lookupParent: partial match works', () => {
    const response = DealTools.lookupParent('heart', { data: nielsenData });
    assertTrue(response.results.length > 0, 'Should return results for partial match');
    assertTrue(response.results.some(r => r.parentName.toLowerCase().includes('heart')), 'Results should contain "heart"');
    assertTrue(response.canCreateNew !== undefined, 'Should have canCreateNew flag');
  });

  // ============================================================================
  // TOOL 2: lookupMarkets (Low Risk - 2 tests)
  // ============================================================================

  test('lookupMarkets: returns all markets when no filter', () => {
    const results = DealTools.lookupMarkets(null, null, { data: nielsenData });
    assertGreaterThan(results.length, 10, 'Should return many markets');
    assertTrue(results.every(r => r.marketName && r.stationCount >= 0), 'All results should have marketName and stationCount');
  });

  test('lookupMarkets: filters by parent', () => {
    const results = DealTools.lookupMarkets('iHeartMedia, Inc.', null, { data: nielsenData });
    assertGreaterThan(results.length, 0, 'Should return markets for iHeartMedia');
    // Verify all results have marketName
    assertTrue(results.every(r => r.marketName), 'All results should have marketName');
  });

  // ============================================================================
  // TOOL 3: lookupStations (Low Risk - 2 tests)
  // ============================================================================

  test('lookupStations: returns stations with AQH data', () => {
    const response = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    assertGreaterThan(response.results.length, 0, 'Should return stations');
    assertTrue(response.results.every(r => r.stationCallSign), 'All stations should have call signs');
    assertTrue(response.results.some(r => r.primeAQH > 0), 'Some stations should have prime AQH');
    assertTrue(response.results.every(r => r.inBook === true), 'All results should be in-book');
  });

  test('lookupStations: returns specific station data', () => {
    const response = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', 'WLTW', { data: nielsenData });
    assertTrue(response.results.length > 0, 'Should find WLTW');
    assertTrue(response.results[0].stationCallSign.includes('WLTW'), 'Should find WLTW-FM');
    assertGreaterThan(response.results[0].primeAQH, 20000, 'WLTW should have high AQH');
    assertTrue(response.canCreateNew !== undefined, 'Should have canCreateNew flag');
  });

  // ============================================================================
  // TOOL 4: getProductCatalog (Low Risk - 1 test)
  // ============================================================================

  test('getProductCatalog: returns all products with required fields', () => {
    const products = DealTools.getProductCatalog({ rateCard });
    assertGreaterThan(products.length, 10, 'Should return many products');
    assertTrue(products.every(p => p.productId && p.name && p.pricingType), 'All products should have required fields');
    const topline = products.find(p => p.productId === 'topline');
    assertTrue(topline && topline.tierOptions, 'TopLine should have tier options');
  });

  // ============================================================================
  // TOOL 5: calculateProductPrice (Medium Risk - 5 tests)
  // ============================================================================

  test('calculateProductPrice: TopLine single market cash', () => {
    const price = DealTools.calculateProductPrice('topline', { markets: ['New York'] }, {
      tier: 'access',
      numberOfMarkets: 1,
      pricingType: 'cash'
    });
    assertEqual(price.annual, 42000, 'TopLine Access single market = $42K/year');
    assertEqual(price.monthly, 3500, 'TopLine Access single market = $3,500/month');
    assertEqual(price.breakdown.tier, 'access');
  });

  test('calculateProductPrice: TopLine multi-market with attribution', () => {
    const price = DealTools.calculateProductPrice('topline', { markets: ['New York', 'Los Angeles', 'Chicago'] }, {
      tier: 'both',
      numberOfMarkets: 3,
      attributionEnabled: true,
      pricingType: 'cash'
    });
    // Both tier = $72K/market, 3 markets = $216K, plus $5K attribution = $221K
    assertEqual(price.annual, 221000, 'TopLine Both 3 markets + attribution = $221K/year');
    assertTrue(price.breakdown.attributionAnnual === 5000, 'Attribution should be $5K');
  });

  test('calculateProductPrice: Content Automation tier selection', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'tier4',
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 15000, 'Content Automation Tier 4 = $15K/month');
    assertEqual(price.annual, 180000, 'Content Automation Tier 4 = $180K/year');
    assertEqual(price.breakdown.credits, 13045, 'Tier 4 = 13,045 credits');
    assertEqual(price.breakdown.costPerCredit, 1.15, 'Tier 4 = $1.15/credit');
  });

  test('calculateProductPrice: Content Automation custom tier', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'custom',
      customMonthly: 1500,
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 1500, 'Custom $1,500/mo passes through');
    assertEqual(price.breakdown.credits, 1000, '$1,500 ÷ $1.50 = 1,000 credits');
  });

  test('calculateProductPrice: Content Automation enterprise is metered above the floor', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'enterprise',
      enterpriseCredits: 10833,
      pricingType: 'cash'
    });
    // 10,833 × $1.05 = $11,374.65 → $11,375, above the tier3 floor of $10,000
    assertEqual(price.monthly, 11375, '10,833 credits = $11,375/month');
    assertEqual(price.breakdown.credits, 10833, 'Enterprise reports entered credits');
    assertEqual(price.breakdown.costPerCredit, 1.05, 'Enterprise = $1.05/credit');
  });

  test('calculateProductPrice: Content Automation enterprise floors at the covered tier', () => {
    // 13,500 × $1.05 = $14,175, but 13,500 covers Tier 4's 13,045 allotment,
    // so the price may not fall below Tier 4's $15,000.
    const floored = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'enterprise',
      enterpriseCredits: 13500,
      pricingType: 'cash'
    });
    assertEqual(floored.monthly, 15000, '13,500 credits floors at $15,000/month');

    // 20,000 × $1.05 = $21,000, already above the $15,000 floor
    const metered = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'enterprise',
      enterpriseCredits: 20000,
      pricingType: 'cash'
    });
    assertEqual(metered.monthly, 21000, '20,000 credits = $21,000/month');
  });

  test('calculateProductPrice: Content Automation enterprise below threshold is unpriced', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'enterprise',
      enterpriseCredits: 8000,
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 0, 'Below 8,336 credits does not price as enterprise');
    assertTrue(!!price.breakdown.message, 'Below-threshold enterprise explains why');
  });

  test('getCaptureRate: ladder boundaries resolve to the right tier', () => {
    const cases = [
      [1,'1080p',1750,'1-4 streams'], [4,'1080p',1750,'1-4 streams'],
      [5,'1080p',1500,'5-14 streams'], [14,'1080p',1500,'5-14 streams'],
      [15,'1080p',1350,'15-29 streams'], [29,'1080p',1350,'15-29 streams'],
      [30,'1080p',1250,'30+ streams'], [500,'1080p',1250,'30+ streams'],
      [1,'720p',1400,'1-4 streams'], [5,'720p',1200,'5-14 streams'],
      [15,'720p',1080,'15-29 streams'], [30,'720p',1000,'30+ streams']
    ];
    cases.forEach(([n,res,rate,label]) => {
      const r = DealTools.getCaptureRate(n, res);
      assertEqual(r.ratePerStream, rate, `${n} streams @ ${res} = $${rate}`);
      assertEqual(r.label, label, `${n} streams is ${label}`);
    });
  });

  test('calculateLiveStreamCapture: pricing is flat per tier, not marginal', () => {
    // 5 streams must be 5 x $1,500, never 4 x $1,750 + 1 x $1,500 (= $8,500).
    const five = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 5, resolution: '1080p', months: 12 }, 1);
    assertEqual(five.monthlyTotal, 7500, '5 streams = 5 x $1,500');

    // The cliff is intended: 4 streams costs LESS per month than 5 despite a higher rate.
    const four = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 4, resolution: '1080p', months: 12 }, 1);
    assertEqual(four.monthlyTotal, 7000, '4 streams = 4 x $1,750');
    assertTrue(four.monthlyTotal < five.monthlyTotal, 'cliff at the 4->5 boundary is present');
  });

  test('calculateLiveStreamCapture: ladder totals across tiers and resolutions', () => {
    const t = (n,res,m) => DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: n, resolution: res, months: m }, 1);
    assertEqual(t(1,'1080p',12).monthlyTotal, 1750, '1 stream 1080p');
    assertEqual(t(1,'1080p',12).annualTotal, 21000, '1 stream 1080p annual');
    assertEqual(t(15,'1080p',12).monthlyTotal, 20250, '15 streams 1080p');
    assertEqual(t(30,'1080p',12).monthlyTotal, 37500, '30 streams 1080p');
    assertEqual(t(1,'720p',12).monthlyTotal, 1400, '1 stream 720p');
    assertEqual(t(5,'720p',12).monthlyTotal, 6000, '5 streams 720p');
    assertEqual(t(15,'720p',12).monthlyTotal, 16200, '15 streams 720p');
    assertEqual(t(30,'720p',12).monthlyTotal, 30000, '30 streams 720p');
    // Term still derives from the deal term
    const eleven = t(11,'1080p',36);
    assertEqual(eleven.monthlyTotal, 16500, '11 streams 1080p monthly');
    assertEqual(eleven.annualTotal, 198000, '11 streams 1080p annual');
    assertEqual(eleven.termTotal, 594000, '11 streams 1080p over 36 months');
  });

  test('calculateLiveStreamCapture: 1080p and 720p rates', () => {
    // 11 streams falls in the 5-14 tier: $1,500 / $1,200
    const hd = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '1080p', months: 12 }, 1);
    assertEqual(hd.monthlyTotal, 16500, '11 streams @ 1080p = $16,500/mo');
    assertEqual(hd.annualTotal, 198000, '11 streams @ 1080p annual run rate = $198,000');
    assertEqual(hd.termTotal, 198000, '11 streams @ 1080p × 12 mo term = $198,000');

    const sd = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '720p', months: 12 }, 1);
    assertEqual(sd.monthlyTotal, 13200, '11 streams @ 720p = $13,200/mo');
    assertEqual(sd.termTotal, 158400, '11 streams @ 720p × 12 mo term = $158,400');
  });

  test('calculateLiveStreamCapture: term scales with the deal term', () => {
    const mo = 16500;   // 11 streams falls in the 5-14 tier: 11 x $1,500
    [12, 24, 36, 48, 60].forEach(months => {
      const c = DealTools.calculateLiveStreamCapture(
        { enabled: true, streamCount: 11, resolution: '1080p', months }, 1);
      assertEqual(c.monthlyTotal, mo, `${months}mo: monthly is term-independent`);
      assertEqual(c.annualTotal, mo * 12, `${months}mo: annual run rate is always monthly × 12`);
      assertEqual(c.termTotal, mo * months, `${months}mo: term total scales with the deal term`);
    });

    // An 18-month custom term is honored exactly.
    const custom = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '1080p', months: 18 }, 1);
    assertEqual(custom.termTotal, 297000, '18mo custom term = $297,000');
  });

  test('calculateLiveStreamCapture: omitted term falls back to the 36mo deal default', () => {
    const c = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '1080p' }, 1);
    assertEqual(c.months, 36, 'Defaults to the deal-term default of 36 months');
    assertEqual(c.termTotal, 594000, '11 streams @ 1080p × 36 mo = $594,000');
  });

  test('calculateLiveStreamCapture: disabled or zero streams yields nothing', () => {
    const off = DealTools.calculateLiveStreamCapture({ enabled: false, streamCount: 11, months: 12 }, 1);
    assertEqual(off.monthlyTotal, 0, 'Disabled capture is $0');
    const zero = DealTools.calculateLiveStreamCapture({ enabled: true, streamCount: 0, months: 12 }, 1);
    assertEqual(zero.monthlyTotal, 0, 'Zero streams is $0');
  });

  test('calculateProductPrice: capture-only Content Automation deal is valid', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'none',
      capture: { enabled: true, streamCount: 11, resolution: '1080p', months: 12 },
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 16500, 'Capture-only monthly = capture total');
    assertEqual(price.annual, 198000, 'Capture-only annual = annual run rate');
    assertEqual(price.breakdown.credits, 0, 'No credits on a capture-only deal');
    assertEqual(price.breakdown.tierName, 'None', 'Tier is None, not a phantom Tier 1');
    assertTrue(price.breakdown.hasCredits === false, 'hasCredits is false');
    assertTrue(price.breakdown.contributesNothing === false, 'Capture alone still contributes');
  });

  test('calculateProductPrice: neither credits nor capture contributes nothing', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'none',
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 0, 'No credits and no capture = $0');
    assertTrue(price.breakdown.contributesNothing === true, 'Flagged as contributing nothing');
  });

  test('calculateProductPrice: credits and capture combine', () => {
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'tier1',
      capture: { enabled: true, streamCount: 11, resolution: '1080p', months: 12 },
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 19000, 'Tier 1 $2,500 + capture $16,500 = $19,000/mo');
    assertEqual(price.breakdown.creditMonthly, 2500, 'Credit portion stays addressable');
    assertEqual(price.breakdown.capture.monthlyTotal, 16500, 'Capture portion stays addressable');
  });

  test('calculateProductPrice: capture does not affect the Enterprise unlock', () => {
    // Capture dollars are not credits; an 8,000-credit deal stays below the 8,336
    // threshold no matter how much capture is attached.
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'enterprise',
      enterpriseCredits: 8000,
      capture: { enabled: true, streamCount: 50, resolution: '1080p', months: 12 },
      pricingType: 'cash'
    });
    assertEqual(price.breakdown.creditMonthly, 0, 'Still below the Enterprise threshold');
    assertTrue(!!price.breakdown.message, 'Still explains the threshold');
    assertEqual(price.breakdown.capture.monthlyTotal, 62500, 'Capture still prices normally');
  });

  test('calculateProductPrice: Content Automation trusts the resolved price from the UI', () => {
    // buildConfigFromState sends the already-resolved price. Custom deals used to
    // reach the agent as $0 because only the tier label was sent.
    const price = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'custom',
      credits: 1000,
      monthlyPrice: 1500,
      costPerCredit: 1.50,
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 1500, 'Resolved custom price is honored');
    assertEqual(price.breakdown.credits, 1000, 'Resolved credits are honored');

    // monthlyPrice is pre-multiplier, so barter applies once and only once
    const barter = DealTools.calculateProductPrice('content_automation', {}, {
      tier: 'custom',
      credits: 1000,
      monthlyPrice: 1500,
      costPerCredit: 1.50,
      pricingType: 'barter'
    });
    assertClose(barter.monthly, 1500 * DealTools.BARTER_MULTIPLIER, 0.01,
      'Barter multiplier applies exactly once');
  });

  test('calculateProductPrice: SpotOn audio spots divide by the audio credit cost', () => {
    // The bug this guards: audioSpots used to be the raw credit count. At 3 credits
    // per spot that reports 6x too many spots while dollars stay correct.
    const p = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    assertEqual(p.breakdown.audioCredits, 700, '70% of 1,000 credits is audio');
    assertEqual(p.breakdown.audioSpots, 233, '700 audio credits / 3 = 233 spots, not 700');
  });

  test('calculateProductPrice: SpotOn video counts, one product by length', () => {
    const p = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    assertEqual(p.breakdown.videoCredits, 300, '30% of 1,000 credits is video');
    assertEqual(p.breakdown.video15s, 9, '300 / 32 = 9 :15s');
    assertEqual(p.breakdown.video30s, 4, '300 / 64 = 4 :30s');
    // The spec/broadcast tiers are retired; nothing should still report them.
    assertTrue(p.breakdown.video15Spec === undefined, 'spec tier gone');
    assertTrue(p.breakdown.video30Broadcast === undefined, 'broadcast tier gone');
  });

  test('calculateProductPrice: SpotOn dollars are unchanged by the video reprice', () => {
    // Only the number of spots a pool buys changes -- never the price of the pool.
    [50, 750, 1000].forEach(credits => {
      const p = DealTools.calculateProductPrice('spoton', {}, { creditsPerMonth: credits, pricingType: 'cash' });
      assertEqual(p.monthly, credits, `${credits} credits = $${credits}/mo at $1/credit`);
      assertEqual(p.annual, credits * 12, `${credits} credits = $${credits * 12}/yr`);
    });
  });

  test('calculateProductPrice: SpotOn 750-credit deal', () => {
    const p = DealTools.calculateProductPrice('spoton', {}, { creditsPerMonth: 750, pricingType: 'cash' });
    assertEqual(p.breakdown.audioCredits, 525, '70% of 750 is audio');
    assertEqual(p.breakdown.videoCredits, 225, '30% of 750 is video');
    assertEqual(p.breakdown.audioSpots, 175, '525 / 3 = 175 audio spots');
    assertEqual(p.breakdown.video15s, 7, '225 / 32 = 7 :15s');
    assertEqual(p.breakdown.video30s, 3, '225 / 64 = 3 :30s');
  });

  test('SPOTON_PRICING: rates match the published card', () => {
    const sp = DealTools.SPOTON_PRICING;
    assertEqual(sp.pricePerCredit, 1, '$1 per credit');
    assertEqual(sp.creditIncrement, 50, 'bought in blocks of 50');
    assertEqual(sp.audioCredits, 3, 'Audio Spot (:30) = 3');
    assertEqual(sp.video15Credits, 32, 'Video :15 = 32');
    assertEqual(sp.video30Credits, 64, 'Video :30 = 64');
    assertTrue(sp.video10Credits === undefined, ':10 constant removed');
    assertTrue(sp.video15SpecCredits === undefined, 'spec constants removed');
    assertTrue(sp.video30BroadcastCredits === undefined, 'broadcast constants removed');
  });

  test('barter minutes formula is unaffected by the multiplier change', () => {
    assertEqual(DealTools.BARTER_FORMULA.ANNUAL_MULTIPLIER, 728, '2 x 7 x 52 = 728');
    // 2 min/day at 1,000 AQH and $1.50 CPM
    assertEqual(DealTools.calculateValueFromMinutes(2, 1000, 1.5), 2184, 'value from minutes');
    assertEqual(DealTools.calculateMinutesFromValue(2184, 1000, 1.5), 2, 'round-trips back');
  });

  test('BARTER_MULTIPLIER is derived from the agency and network fees', () => {
    assertEqual(DealTools.AGENCY_FEE, 0.15, 'agency fee 15%');
    assertEqual(DealTools.NETWORK_FEE, 0.23, 'network fee 23%');
    const expected = 1 / ((1 - 0.15) * (1 - 0.23));
    assertClose(DealTools.BARTER_MULTIPLIER, expected, 1e-12, 'multiplier = 1 / ((1-a)(1-n))');
    assertClose(DealTools.BARTER_MULTIPLIER, 1.5279, 0.0001, 'about 1.5279');
    assertEqual(DealTools.LEGACY_BARTER_MULTIPLIER, 1.4, 'legacy rate preserved for saved deals');
    // Barter nets the same as cash once both fees come off the top.
    const gross = 100 * DealTools.BARTER_MULTIPLIER;
    assertClose(gross * (1 - 0.15) * (1 - 0.23), 100, 0.0001, 'nets back to the cash value');
  });

  test('published barter targets at the fee-derived multiplier', () => {
    const topline = DealTools.calculateProductPrice('topline', { markets: ['New York'] }, {
      tier: 'both', numberOfMarkets: 1, pricingType: 'barter'
    });
    assertClose(topline.annual, 110008, 1, 'TopLine Both barter = $110,008/yr');

    const spoton = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'barter'
    });
    assertClose(spoton.annual, 18335, 1, 'SpotOn 1,000 credits barter = $18,335/yr');
  });

  test('calculateProductPrice: SpotOn barter runs through the universal multiplier', () => {
    const cash = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    const barter = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'barter'
    });
    assertEqual(cash.monthly, 1000, '1,000 credits at $1 = $1,000/mo cash');
    assertClose(barter.monthly, 1000 * DealTools.BARTER_MULTIPLIER, 0.01,
      'barter is cash x the universal multiplier, no SpotOn-specific path');
    // Deliverable counts are credit-derived and must NOT scale with the barter multiplier
    assertEqual(barter.breakdown.audioSpots, cash.breakdown.audioSpots, 'counts unchanged by barter');
  });

  test('calculateProductPrice: SpotOn credits', () => {
    const price = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 200,
      pricingType: 'cash'
    });
    // 200 credits × $1 = $200/month
    assertEqual(price.monthly, 200, 'SpotOn 200 credits = $200/month');
    assertEqual(price.annual, 2400, 'SpotOn 200 credits = $2,400/year');
    assertEqual(price.breakdown.creditsPerMonth, 200);
  });

  test('calculateProductPrice: per-station product with custom price', () => {
    const price = DealTools.calculateProductPrice('topicpulse', {
      stations: ['s1', 's2', 's3', 's4', 's5', 's6']
    }, {
      customPrice: 500,  // Custom monthly rate
      pricingType: 'cash',
      rateCard
    });
    // Custom price $500 × 6 stations = $3,000/month
    assertEqual(price.monthly, 3000, 'TopicPulse custom price 6 stations = $3K/month');
    assertTrue(price.breakdown.isCustomPrice, 'Should indicate custom price');
  });

  // ============================================================================
  // TOOL 6: calculateBarterMinutes (Medium Risk - 5 tests)
  // ============================================================================

  test('calculateBarterMinutes: single station calculation matches formula', () => {
    // Using the known example: WSKQ-FM with Prime AQH 24,800
    // Formula: Minutes = (Value × 1000) / (AQH × CPM × 728)
    // For $36,108.80 annual value: (36108.80 × 1000) / (24800 × 2 × 728) = 1 minute
    const stations = [{ callSign: 'WSKQ-FM', primeAQH: 24800, rosAQH: 21700 }];
    const result = DealTools.calculateBarterMinutes(67704, stations, 2.0);  // Combined Prime + ROS target

    assertEqual(result.perStation.length, 1, 'Should have one station');
    // Prime share = 24800 / (24800 + 21700) = 53.3%
    // ROS share = 21700 / (24800 + 21700) = 46.7%
    assertGreaterThan(result.perStation[0].primeMinsPerDay, 0, 'Should have prime minutes');
    assertGreaterThan(result.perStation[0].rosMinsPerDay, 0, 'Should have ROS minutes');
  });

  test('calculateBarterMinutes: multi-station proportional allocation', () => {
    const stations = [
      { callSign: 'WSKQ-FM', primeAQH: 24800, rosAQH: 21700 },
      { callSign: 'WPAT-FM', primeAQH: 12000, rosAQH: 10600 }
    ];
    const result = DealTools.calculateBarterMinutes(100000, stations, 2.0);

    assertEqual(result.perStation.length, 2, 'Should have two stations');

    // Both stations should have minutes allocated
    const wskq = result.perStation[0];
    const wpat = result.perStation[1];
    assertGreaterThan(wskq.primeMinsPerDay + wskq.rosMinsPerDay, 0, 'WSKQ should have minutes');
    assertGreaterThan(wpat.primeMinsPerDay + wpat.rosMinsPerDay, 0, 'WPAT should have minutes');

    // Higher AQH station (WSKQ) gets larger share of target value
    // But needs same-ish minutes per dollar because value = AQH * mins * constant
    assertGreaterThan(wskq.annualValue, wpat.annualValue, 'Higher AQH station gets larger value share');
  });

  test('calculateBarterMinutes: handles zero AQH gracefully', () => {
    const stations = [
      { callSign: 'WSKQ-FM', primeAQH: 24800, rosAQH: 21700 },
      { callSign: 'ZERO-FM', primeAQH: 0, rosAQH: 0 }
    ];
    const result = DealTools.calculateBarterMinutes(50000, stations, 2.0);

    assertEqual(result.perStation.length, 2, 'Should have two stations');
    assertEqual(result.perStation[1].primeMinsPerDay, 0, 'Zero AQH station gets zero prime minutes');
    assertEqual(result.perStation[1].rosMinsPerDay, 0, 'Zero AQH station gets zero ROS minutes');
    assertGreaterThan(result.perStation[0].primeMinsPerDay, 0, 'Non-zero AQH station gets minutes');
  });

  test('calculateBarterMinutes: total allocated value is close to target', () => {
    const stations = [
      { callSign: 'WLTW-FM', primeAQH: 28800, rosAQH: 27700 },
      { callSign: 'WWPR-FM', primeAQH: 27800, rosAQH: 25700 },
      { callSign: 'WHTZ-FM', primeAQH: 27400, rosAQH: 26300 }
    ];
    const target = 200000;
    const cpm = 2.0;
    const result = DealTools.calculateBarterMinutes(target, stations, cpm);

    // Minutes are whole numbers, so only discrete totals are reachable. On stations this
    // large a single ROS minute on the smallest is worth ~$37k -- 19% of this target --
    // so the allocator rounds to the NEAREST reachable total and can land under it.
    // This test used to assert allocated >= target on the assumption that minutes are
    // always rounded up. They are not, and the engine has been right the whole time:
    // it allocated $196,414 against $200,000 and the suite reported a false failure.
    // What the allocator does guarantee is that no better whole-minute allocation
    // exists -- the miss is smaller than one minute on the cheapest station.
    const smallestRosAQH = Math.min(...stations.map(s => s.rosAQH));
    const oneMinuteValue = DealTools.calculateValueFromMinutes(1, smallestRosAQH, cpm);
    const miss = Math.abs(result.total.annualValue - target);

    assertTrue(miss < oneMinuteValue,
      `Allocation should land within one minute-increment ($${Math.round(oneMinuteValue)}) ` +
      `of target: missed by $${Math.round(miss)}`);
  });

  test('calculateBarterMinutes: value from minutes formula is consistent', () => {
    // Test that calculateValueFromMinutes matches expected formula
    const primeAQH = 24800;
    const cpm = 2.0;
    const minutes = 1;

    // Formula: (AQH × Minutes × CPM × 728) / 1000
    const expectedValue = (primeAQH * minutes * cpm * 728) / 1000;
    const actualValue = DealTools.calculateValueFromMinutes(minutes, primeAQH, cpm);

    assertClose(actualValue, expectedValue, 0.01, 'Value calculation should match formula');
    assertClose(actualValue, 36108.80, 1, 'Should be approximately $36,108.80');
  });

  // ============================================================================
  // TOOL 7: buildDeal (Medium Risk - 5 tests)
  // ============================================================================

  test('buildDeal: broadcast deal with multiple stations', () => {
    const response = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    const stationKeys = response.results.slice(0, 3).map(s =>
      `${s.parent}|${s.market}|${s.stationCallSign}`
    );

    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      parent: 'iHeartMedia, Inc.',
      markets: ['New York [PPM+D]'],
      stations: stationKeys,
      products: ['topicpulse', 'prep_plus'],
      pricingType: 'cash',
      data: nielsenData,
      rateCard
    });

    assertEqual(deal.dealType, 'broadcast');
    assertEqual(deal.mediaType, 'Radio', 'Default media type should be Radio');
    assertEqual(deal.parent, 'iHeartMedia, Inc.');
    assertEqual(deal.stations.length, 3);
    assertEqual(deal.products.length, 2);
    assertGreaterThan(deal.totalAnnual, 0, 'Should have total annual value');
    assertEqual(deal.cashAnnual, deal.totalAnnual, 'Cash deal: cash should equal total');
    assertTrue(deal.hasOffBookStations === false, 'Should have no off-book stations');
  });

  test('buildDeal: agency deal (no stations)', () => {
    const deal = DealTools.buildDeal({
      dealType: 'agency',
      customerName: 'Test Agency Inc.',
      customerLocation: 'New York, NY',
      products: ['topicpulse', 'streaming'],
      pricingType: 'cash',
      rateCard
    });

    assertEqual(deal.dealType, 'agency');
    assertEqual(deal.mediaType, 'AgencyOther', 'Agency deal should default to AgencyOther media type');
    assertEqual(deal.customerName, 'Test Agency Inc.');
    assertEqual(deal.stations.length, 0);
    assertGreaterThan(deal.totalAnnual, 0, 'Should have total value');
    // Agency deals use flat pricing (count = 1)
    assertEqual(deal.productValues['topicpulse'].breakdown.count, 1, 'Agency should use flat pricing');
  });

  test('buildDeal: mixed payment deal', () => {
    const response = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    const stationKeys = response.results.slice(0, 2).map(s =>
      `${s.parent}|${s.market}|${s.stationCallSign}`
    );

    // Set up cash values for mixed deal (monthly per product per station)
    const productCashValues = {};
    stationKeys.forEach(sk => {
      productCashValues[`topicpulse:${sk}`] = 500;  // $500/month cash per station
    });

    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      parent: 'iHeartMedia, Inc.',
      markets: ['New York [PPM+D]'],
      stations: stationKeys,
      products: ['topicpulse'],
      pricingType: 'mixed',
      productCashValues,
      cpm: 2.0,
      data: nielsenData,
      rateCard
    });

    assertEqual(deal.pricingType, 'mixed');
    // Cash = $500 × 2 stations × 12 months = $12,000
    assertEqual(deal.cashAnnual, 12000, 'Cash should be $12K/year');
    assertGreaterThan(deal.barterTargetAnnual, 0, 'Should have barter target');
    assertTrue(deal.barterAllocation !== null, 'Should have barter allocation');
  });

  test('buildDeal: multi-product deal', () => {
    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      parent: 'iHeartMedia, Inc.',
      markets: ['New York [PPM+D]'],
      stations: ['iHeartMedia, Inc.|New York [PPM+D]|WLTW-FM'],
      products: ['topicpulse', 'prep_plus', 'streaming', 'mobile'],
      pricingType: 'cash',
      data: nielsenData,
      rateCard
    });

    assertEqual(deal.products.length, 4);
    assertTrue(deal.productValues['topicpulse'], 'Should have topicpulse value');
    assertTrue(deal.productValues['prep_plus'], 'Should have prep_plus value');
    assertTrue(deal.productValues['streaming'], 'Should have streaming value');
    assertTrue(deal.productValues['mobile'], 'Should have mobile value');

    // Sum of individual products should equal total
    const productSum = Object.values(deal.productValues).reduce((sum, p) => sum + p.annual, 0);
    assertEqual(deal.totalAnnual, productSum, 'Total should equal sum of products');
  });

  test('buildDeal: multi-market TopLine', () => {
    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      parent: 'iHeartMedia, Inc.',
      markets: ['New York [PPM+D]', 'Los Angeles [PPM+D]', 'Chicago [PPM]'],
      stations: ['iHeartMedia, Inc.|New York [PPM+D]|WLTW-FM'],
      products: ['topline'],
      pricingType: 'cash',
      toplineConfig: {
        tier: 'access',
        numberOfMarkets: 3,
        usersNeeded: 10,
        accountsNeeded: 250
      },
      productConfigs: {
        topline: {
          tier: 'access',
          numberOfMarkets: 3,
          usersNeeded: 10,
          accountsNeeded: 250
        }
      },
      data: nielsenData
    });

    // TopLine Access = $42K/market × 3 markets = $126K base
    // Additional users: (10-5) × $250 × 12 = $15K
    // Additional accounts: ceil((250-220)/5) × $25 × 12 = 6 blocks × $300 = $1,800
    const toplineValue = deal.productValues['topline'];
    assertGreaterThan(toplineValue.annual, 126000, 'Multi-market TopLine should be > $126K base');
    assertEqual(toplineValue.breakdown.numMarkets, 3, 'Should have 3 markets');
  });

  // ============================================================================
  // TV Deal Tests (Test D)
  // ============================================================================

  test('buildDeal: TV deal is forced cash-only', () => {
    // Create a TV deal with off-book stations
    const tvStations = [
      DealTools.createOffBookStation({ callSign: 'WLS-TV', market: 'Chicago', parent: 'ABC Stations' }),
      DealTools.createOffBookStation({ callSign: 'WABC-TV', market: 'New York', parent: 'ABC Stations' })
    ];

    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      mediaType: 'TV',
      parent: 'ABC Stations',
      markets: ['Chicago', 'New York'],
      stations: tvStations,
      products: ['topicpulse', 'prep_plus'],
      pricingType: 'barter',  // Should be forced to cash
      data: nielsenData,
      rateCard
    });

    assertEqual(deal.mediaType, 'TV', 'Should be TV media type');
    assertEqual(deal.pricingType, 'cash', 'TV deal should be forced to cash');
    assertTrue(deal.barterAllocation === null, 'TV deal should have no barter allocation');
    assertTrue(deal.hasOffBookStations, 'Should have off-book stations');
    assertEqual(deal.offBookStationCount, 2, 'Should have 2 off-book stations');
    assertEqual(deal.stationDetails.every(s => s.inBook === false), true, 'All stations should be off-book');
  });

  test('validateDeal: TV deal gets correct warnings', () => {
    const tvDeal = {
      dealType: 'broadcast',
      mediaType: 'TV',
      parent: 'ABC Stations',
      stations: ['WLS-TV', 'WABC-TV'],
      products: ['topicpulse'],
      pricingType: 'cash',
      hasOffBookStations: true,
      offBookStationCount: 2,
      inBookStationCount: 0
    };

    const issues = DealTools.validateDeal(tvDeal);
    assertTrue(issues.some(i => i.message.includes('TV deal')), 'Should mention TV deal');
    assertTrue(issues.some(i => i.message.includes('cash only') || i.message.includes('no barter')), 'Should mention cash only');
  });

  // ============================================================================
  // Mixed In-Book/Off-Book Tests (Test E)
  // ============================================================================

  test('buildDeal: mixed in-book and off-book stations', () => {
    // Get an in-book station
    const response = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', 'WLTW', { data: nielsenData });
    const inBookStation = response.results[0];

    // Create an off-book station
    const offBookStation = DealTools.createOffBookStation({
      callSign: 'KNEW-FM',
      market: 'New York',
      parent: 'iHeartMedia, Inc.'
    });

    const deal = DealTools.buildDeal({
      dealType: 'broadcast',
      parent: 'iHeartMedia, Inc.',
      markets: ['New York [PPM+D]'],
      stations: [
        `${inBookStation.parent}|${inBookStation.market}|${inBookStation.stationCallSign}`,
        offBookStation  // Pass the off-book station object directly
      ],
      products: ['topicpulse'],
      pricingType: 'barter',
      cpm: 2.0,
      data: nielsenData,
      rateCard
    });

    assertTrue(deal.hasMixedStations, 'Should have mixed stations');
    assertEqual(deal.inBookStationCount, 1, 'Should have 1 in-book station');
    assertEqual(deal.offBookStationCount, 1, 'Should have 1 off-book station');

    // Barter should only be allocated to in-book station
    assertTrue(deal.barterAllocation !== null, 'Should have barter allocation');
    const inBookAllocation = deal.barterAllocation.perStation.find(s => !s.isOffBook);
    const offBookAllocation = deal.barterAllocation.perStation.find(s => s.isOffBook);

    assertGreaterThan(inBookAllocation.annualValue, 0, 'In-book station should have barter value');
    assertEqual(offBookAllocation.annualValue, 0, 'Off-book station should have zero barter value');
  });

  test('validateDeal: mixed stations get correct info messages', () => {
    const mixedDeal = {
      dealType: 'broadcast',
      mediaType: 'Radio',
      parent: 'iHeartMedia, Inc.',
      stations: ['station1', 'station2'],
      products: ['topicpulse'],
      pricingType: 'barter',
      hasMixedStations: true,
      hasOffBookStations: true,
      inBookStationCount: 1,
      offBookStationCount: 1
    };

    const issues = DealTools.validateDeal(mixedDeal);
    assertTrue(issues.some(i => i.message.includes('Mixed deal')), 'Should mention mixed deal');
    assertTrue(issues.some(i => i.message.includes('off-book') && i.message.includes('cash only')),
      'Should mention off-book stations are cash only');
  });

  // ============================================================================
  // createOffBookStation helper tests
  // ============================================================================

  test('createOffBookStation: creates proper off-book station object', () => {
    const station = DealTools.createOffBookStation({
      callSign: 'TEST-TV',
      market: 'Test Market',
      parent: 'Test Parent'
    });

    assertEqual(station.stationCallSign, 'TEST-TV');
    assertEqual(station.market, 'Test Market');
    assertEqual(station.parent, 'Test Parent');
    assertEqual(station.format, 'Unknown');
    assertEqual(station.primeAQH, null, 'Off-book station should have null primeAQH');
    assertEqual(station.rosAQH, null, 'Off-book station should have null rosAQH');
    assertEqual(station.inBook, false);
  });

  // ============================================================================
  // TOOL 8: validateDeal (Low Risk - 2 tests)
  // ============================================================================

  test('validateDeal: catches missing required fields', () => {
    const badDeal = {
      dealType: 'broadcast',
      parent: null,
      stations: [],
      products: []
    };

    const issues = DealTools.validateDeal(badDeal);
    assertTrue(issues.some(i => i.severity === 'error'), 'Should have errors');
    assertTrue(issues.some(i => i.message.includes('Parent')), 'Should flag missing parent');
    assertTrue(issues.some(i => i.message.includes('station')), 'Should flag missing stations');
    assertTrue(issues.some(i => i.message.includes('product')), 'Should flag missing products');
  });

  test('validateDeal: detects gap to value issues', () => {
    // Create deal with barter allocation that's short of target
    const deal = {
      dealType: 'broadcast',
      parent: 'Test Parent',
      stations: ['Test|Market|Station'],
      products: ['topicpulse'],
      pricingType: 'barter',
      barterTargetAnnual: 100000,
      barterAllocation: {
        perStation: [{ callSign: 'Station', primeMinsPerDay: 1, rosMinsPerDay: 1, annualValue: 50000 }],
        total: { primeMinsPerDay: 1, rosMinsPerDay: 1, annualValue: 50000 }  // 50% short
      }
    };

    const issues = DealTools.validateDeal(deal);
    assertTrue(issues.some(i => i.severity === 'warning' && i.message.includes('Gap')),
      'Should warn about gap to value');
  });

  // ============================================================================
  // BARTER PRICING: ENGINE MUST MATCH THE UI
  // ============================================================================
  //
  // One rule for every product: list at the cash rate, subtract the cash the rep
  // entered against that product, gross the remainder up by the deal's multiplier.
  // Expected values were measured in the live UI (2 stations: KAAR-FM 100/100 AQH,
  // KACL-FM 400/400, CPM 1.5). If the engine drifts, the chat agent quotes a different
  // barter target than the proposal for the same deal.

  (function barterPricingParity() {
    const S = ['Townsquare Media|Butte-Bozeman, MT|KAAR-FM',
               'Townsquare Media|Bismarck-Mnt-Dcknsn (Wlstn)|KACL-FM'];
    const M = ['Butte-Bozeman, MT', 'Bismarck-Mnt-Dcknsn (Wlstn)'];
    const MULT = DealTools.BARTER_MULTIPLIER;          // 1.5278838808250574
    const LEGACY = DealTools.LEGACY_BARTER_MULTIPLIER; // 1.4

    function mixedTargetMonthly(productId, config, cashByLocation, marketLevel, rate) {
      const productCashValues = {};
      Object.entries(cashByLocation).forEach(([loc, val]) => {
        productCashValues[`${productId}:${loc}`] = val;
      });
      const c = {
        products: [productId], stations: S, markets: M, dealType: 'broadcast',
        pricingType: 'mixed', cpm: 1.5,
        productAssignments: { [productId]: marketLevel ? M : S },
        productCashValues,
        productConfigs: { [productId]: config },
        barterMultiplier: rate
      };
      const r = DealTools.calculateMixedBarterTargets(
        c, { stations: S, markets: M }, c.productConfigs, rate || MULT);
      return r.perProduct[productId].targetAnnual / 12;
    }

    function unitPrice(productId, pricingType, rate) {
      return DealTools.calculateProductPrice(
        productId,
        { stations: [S[0]], markets: [M[0]] },
        { pricingType, dealType: 'broadcast', barterMultiplier: rate }
      ).monthly;
    }

    // ---- Rate-card barter price is cash x the deal's multiplier ----

    test('rate card: TopicPulse barter is cash x multiplier, not the barter column', () => {
      // Rate card still says 1050 (a hardcoded 1.4x). Pricing must ignore it.
      assertClose(unitPrice('topicpulse', 'barter'), 750 * MULT, 0.01,
        'TopicPulse barter should be 750 x 1.5279 = $1,145.91, not the 1050 column');
      assertClose(unitPrice('topicpulse', 'cash'), 750, 0.01,
        'TopicPulse cash is unchanged at $750');
    });

    test('rate card: a legacy deal still prices barter at 1.4x', () => {
      assertClose(unitPrice('topicpulse', 'barter', LEGACY), 1050, 0.01,
        'A deal saved at 1.4x should still quote TopicPulse barter at $1,050');
    });

    test('rate card: every product follows cash x multiplier on barter', () => {
      [['post', 1000], ['streaming', 300], ['mobile', 500], ['ldr', 500],
       ['prep_plus', 500], ['topicpulse_iv', 1250], ['instant_video', 500],
       ['topicpulse_community_radar_nextdoor', 150]].forEach(([id, cash]) => {
        assertClose(unitPrice(id, 'barter'), cash * MULT, 0.01,
          `${id} barter should be ${cash} x multiplier`);
        assertClose(unitPrice(id, 'barter', LEGACY), cash * LEGACY, 0.01,
          `${id} on a legacy deal should still be ${cash} x 1.4`);
      });
    });

    test('rate card: inventory_only keeps its sentinel, it is not multiplied', () => {
      // cash is 0 and barter 1 is a visibility sentinel, not a price.
      assertClose(unitPrice('inventory_only', 'barter'), 1, 0.01,
        'inventory_only should stay at its sentinel value, not collapse to 0');
    });

    // ---- Mixed barter target, per product ----

    const mixedCases = [
      { name: 'SpotOn (1,000 credits, $600/mo cash)',
        id: 'spoton', config: { creditsPerMonth: 1000 },
        cash: { [M[0]]: 300, [M[1]]: 300 }, marketLevel: true,
        expected: (1000 - 600) * MULT },                      // 611.15

      { name: 'FAAI (2 shows x 5 min, $300/mo cash)',
        id: 'faai', config: { numberOfShows: 2, minutesPerDay: 5, margin: 90 },
        cash: { [S[0]]: 150, [S[1]]: 150 }, marketLevel: false,
        expected: (562.5 - 300) * MULT },                     // 401.07

      { name: 'Content Automation (tier1, $1,000/mo cash)',
        id: 'content_automation', config: { enabled: true, tier: 'tier1' },
        cash: { [S[0]]: 500, [S[1]]: 500 }, marketLevel: false,
        expected: (2500 - 1000) * MULT },                     // 2291.83

      // $72,000/yr list with $30,000/yr cash = $64,171/yr barter. TopLine used to be
      // grossed up on its full list with the cash never netted: $110,008 on top of the
      // $30,000, against a $72,000 deal.
      { name: 'TopLine (both tier, 1 market, $30,000/yr cash)',
        id: 'topline', config: { tier: 'both', numberOfMarkets: 1 },
        cash: { [M[0]]: 2500 }, marketLevel: true,
        expected: (6000 - 2500) * MULT },                     // 5347.59/mo = 64171/yr

      // 750 x 2 stations at the CASH rate, less $500 cash, grossed up once.
      { name: 'TopicPulse (rate card, 2 stations, $500/mo cash)',
        id: 'topicpulse', config: {},
        cash: { [S[0]]: 250, [S[1]]: 250 }, marketLevel: false,
        expected: (1500 - 500) * MULT }                       // 1527.88
    ];

    mixedCases.forEach(tc => {
      test(`mixed barter target matches UI: ${tc.name}`, () => {
        const got = mixedTargetMonthly(tc.id, tc.config, tc.cash, tc.marketLevel);
        assertClose(got, tc.expected, 0.01,
          `${tc.id}: engine $${got.toFixed(2)}/mo vs UI $${tc.expected.toFixed(2)}/mo`);
      });
    });

    test('TopLine mixed: $72,000 list with $30,000 cash asks for $64,171 of barter', () => {
      const annual = mixedTargetMonthly(
        'topline', { tier: 'both', numberOfMarkets: 1 }, { [M[0]]: 2500 }, true) * 12;
      assertClose(annual, (72000 - 30000) * MULT, 1,
        `Expected $64,171/yr, got $${Math.round(annual)}/yr`);
    });

    test('mixed barter target: a legacy deal uses its stored 1.4x', () => {
      const got = mixedTargetMonthly(
        'topicpulse', {}, { [S[0]]: 250, [S[1]]: 250 }, false, LEGACY);
      assertClose(got, (1500 - 500) * LEGACY, 0.01,
        'A legacy mixed deal should gross the remainder up at 1.4x');
    });

    test('mixed barter target: total is the sum of the per-product targets', () => {
      const c = {
        products: ['spoton', 'topicpulse'], stations: S, markets: M, dealType: 'broadcast',
        pricingType: 'mixed', cpm: 1.5,
        productAssignments: { spoton: M, topicpulse: S },
        productCashValues: {
          [`spoton:${M[0]}`]: 300, [`spoton:${M[1]}`]: 300,
          [`topicpulse:${S[0]}`]: 250, [`topicpulse:${S[1]}`]: 250
        },
        productConfigs: { spoton: { creditsPerMonth: 1000 }, topicpulse: {} }
      };
      const r = DealTools.calculateMixedBarterTargets(
        c, { stations: S, markets: M }, c.productConfigs, MULT);
      const sum = Object.values(r.perProduct).reduce((a, p) => a + p.targetAnnual, 0);
      assertClose(r.totalAnnual, sum, 0.01, 'Total should equal the sum of per-product targets');
      assertClose(r.totalAnnual / 12, (1000 - 600) * MULT + (1500 - 500) * MULT, 0.01,
        'Two-product mixed deal should total both products\' targets');
    });

    // ---- Cash and all-barter deals ----

    test('cash deal: no product is multiplied', () => {
      assertClose(unitPrice('topicpulse', 'cash'), 750, 0.01, 'TopicPulse cash stays $750');
      const d = DealTools.buildDeal({
        products: ['topicpulse'], stations: S, markets: M,
        dealType: 'broadcast', pricingType: 'cash', cpm: 1.5
      });
      assertClose(d.totalAnnual, 750 * 2 * 12, 1, 'Cash deal is 2 stations x $750 x 12');
      assertEqual(d.barterTargetAnnual, 0, 'Cash deal has no barter target');
      assertEqual(d.mixedBarterTargets, null, 'Cash deal has no per-product mixed breakdown');
    });

    test('all-barter deal: target is the full list at cash x multiplier', () => {
      const d = DealTools.buildDeal({
        products: ['topicpulse'], stations: S, markets: M,
        dealType: 'broadcast', pricingType: 'barter', cpm: 1.5
      });
      assertClose(d.totalAnnual, 750 * MULT * 2 * 12, 1,
        'Barter deal is 2 stations x (750 x 1.5279) x 12');
      assertClose(d.barterTargetAnnual, d.totalAnnual, 1,
        'All-barter deal targets its whole value');
    });

    test('all-barter legacy deal: target uses the stored 1.4x', () => {
      const d = DealTools.buildDeal({
        products: ['topicpulse'], stations: S, markets: M,
        dealType: 'broadcast', pricingType: 'barter', cpm: 1.5,
        barterMultiplier: LEGACY
      });
      assertClose(d.totalAnnual, 1050 * 2 * 12, 1,
        'A legacy barter deal still prices TopicPulse at $1,050/station');
    });
  })();

  // ============================================================================
  // PRICING RULES VERSION (stale-quote banner)
  // ============================================================================

  test('pricing rules: a deal saved before versioning is flagged', () => {
    // No pricingRulesVersion at all -- every deal saved before today.
    assertTrue(DealTools.dealNeedsPricingRulesWarning({ pricingType: 'mixed' }),
      'A mixed deal with no version should be flagged');
    assertTrue(DealTools.dealNeedsPricingRulesWarning({ pricingType: 'barter' }),
      'A barter deal with no version should be flagged');
  });

  test('pricing rules: a deal at the CURRENT rate but old rules is still flagged', () => {
    // The case a rate comparison missed entirely: saved at 1.5279, so its rate matches
    // and the old banner stayed hidden, yet it reprices under the version 2 rules.
    assertTrue(DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'mixed', barterMultiplier: DealTools.BARTER_MULTIPLIER
    }), 'A mixed deal at the current rate with no version should still be flagged');
  });

  test('pricing rules: a legacy 1.4x mixed deal is flagged', () => {
    assertTrue(DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'mixed', barterMultiplier: DealTools.LEGACY_BARTER_MULTIPLIER,
      pricingRulesVersion: 1
    }), 'A legacy 1.4x mixed deal should be flagged');
  });

  test('pricing rules: a deal saved under the current rules is not flagged', () => {
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'mixed', pricingRulesVersion: DealTools.PRICING_RULES_VERSION
    }), 'A deal at the current rules version should not be flagged');
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'barter', pricingRulesVersion: DealTools.PRICING_RULES_VERSION
    }), 'A current barter deal should not be flagged');
  });

  test('pricing rules: cash deals never show the banner', () => {
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({ pricingType: 'cash' }),
      'A cash deal with no version should not be flagged');
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'cash', pricingRulesVersion: 1
    }), 'A version 1 cash deal should not be flagged');
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({}),
      'An empty deal defaults to cash and should not be flagged');
  });

  test('pricing rules: a future version is not flagged', () => {
    assertTrue(!DealTools.dealNeedsPricingRulesWarning({
      pricingType: 'mixed', pricingRulesVersion: DealTools.PRICING_RULES_VERSION + 1
    }), 'A deal from a newer build should not be flagged by an older one');
  });

  test('pricing rules: index.html saves the version with every deal', () => {
    if (typeof module !== 'object' || !module.exports) return;
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assertTrue(/pricingRulesVersion: PRICING_RULES_VERSION/.test(html),
      'buildDealPayload must store pricingRulesVersion, or saved deals cannot be flagged');
    assertTrue(/Number\(payload\.pricingRulesVersion\) \|\| 1/.test(html),
      'loadDeal must default a missing pricingRulesVersion to 1');
  });

  // ============================================================================
  // CASH KEY: MARKET-LEVEL PRODUCTS STORE CASH UNDER THE MARKET
  // ============================================================================

  test('cash key: market-level products key off the market, station-level off the station', () => {
    const station = {
      market: 'Butte-Bozeman, MT',
      key: 'Townsquare Media|Butte-Bozeman, MT|KAAR-FM'
    };
    // TopLine and SpotOn are priced per market.
    assertEqual(DealTools.cashKeyForStation('topline', station),
      'topline:Butte-Bozeman, MT', 'TopLine cash is keyed by market');
    assertEqual(DealTools.cashKeyForStation('spoton', station),
      'spoton:Butte-Bozeman, MT', 'SpotOn cash is keyed by market');
    // Rate-card products are priced per station.
    assertEqual(DealTools.cashKeyForStation('topicpulse', station),
      'topicpulse:Townsquare Media|Butte-Bozeman, MT|KAAR-FM',
      'TopicPulse cash is keyed by station');
  });

  test('cash key: the Financial Allocation reads cash through the shared rule', () => {
    if (typeof module !== 'object' || !module.exports) return;
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    // The bug was generateFinancialAllocation reading getCashKey(p.id, st.key)
    // unconditionally, so market-level products reported $0 cash.
    assertTrue(/DealTools\.cashKeyForStation\(p\.id, st\)/.test(html),
      'generateFinancialAllocation must use the shared cash-key rule');
    assertTrue(!/getCashKey\(p\.id, st\.key\)/.test(html),
      'No path should still read a market-level product cash off the station key');
  });

  // ============================================================================
  // ALLOCATION GROUPING: BARTER IS COUNTED ONCE PER STATION
  // ============================================================================
  //
  // Barter minutes belong to the station, not the product. Each product that
  // allocates barter emits its own row per station carrying that station's FULL
  // minutes and barter value, so summing the rows counted the same airtime once per
  // product. The reported case: SpotOn + FAAI on 3 stations showed $27,082 of barter
  // and "193% covered" against $13,541 of real airtime on a $14,003 deal.

  (function allocationGrouping() {
    // The three stations from the reported deal, with their actual barter values.
    const STATIONS = [
      { station: 'WAHR-F2', market: 'Huntsville-Decatur (Florence)', primeAQH: 1200, rosAQH: 1100, barterValue: 5023.20, primeMinutes: 2, rosMinutes: 2 },
      { station: 'WAHR-FM', market: 'Huntsville-Decatur (Florence)', primeAQH: 1100, rosAQH: 900,  barterValue: 4368.00, primeMinutes: 2, rosMinutes: 2 },
      { station: 'WRTT-FM', market: 'Huntsville-Decatur (Florence)', primeAQH: 2200, rosAQH: 1900, barterValue: 4149.60, primeMinutes: 0, rosMinutes: 2 }
    ];
    const REAL_AIRTIME = 5023.20 + 4368.00 + 4149.60;   // 13,540.80

    // Build the rows the allocation emits: one per station PER PRODUCT, each carrying
    // the station's full barter value.
    function rowsFor(products, revenuePerStationPerProduct) {
      const rows = [];
      products.forEach(product => {
        STATIONS.forEach(st => {
          rows.push({
            station: st.station, market: st.market, product,
            primeAQH: st.primeAQH, rosAQH: st.rosAQH,
            revenueAllocated: revenuePerStationPerProduct,
            cashAnnual: 0,
            barterValue: st.barterValue,
            primeMinutes: st.primeMinutes, rosMinutes: st.rosMinutes,
            stationType: 'Barter'
          });
        });
      });
      return rows;
    }

    [1, 2, 3].forEach(productCount => {
      const products = ['SpotOn', 'FAAI', 'TopicPulse'].slice(0, productCount);
      test(`allocation grouping: ${productCount} product(s) on shared stations count barter once`, () => {
        const r = DealTools.groupAllocationRowsByStation(rowsFor(products, 1000));

        assertEqual(r.stations.length, 3, 'Three stations should collapse to three rows');
        assertClose(r.totals.barterValue, REAL_AIRTIME, 0.01,
          `Barter must equal the stations counted once ($${REAL_AIRTIME.toFixed(2)}), ` +
          `not multiplied by the ${productCount} product(s)`);
        // Revenue IS per product and must still accumulate.
        assertClose(r.totals.revenueAllocated, 1000 * 3 * productCount, 0.01,
          'Revenue should sum across every product on every station');
        r.stations.forEach(g => {
          assertEqual(g.products.length, productCount,
            `${g.station} should list all ${productCount} product(s) underneath`);
        });
        assertEqual(r.totals.productStations, 3, 'Three product stations');
        assertEqual(r.totals.inventoryStations, 0, 'No inventory-only stations');
      });
    });

    test('allocation grouping: barter total is independent of product count', () => {
      const one = DealTools.groupAllocationRowsByStation(rowsFor(['SpotOn'], 1000));
      const two = DealTools.groupAllocationRowsByStation(rowsFor(['SpotOn', 'FAAI'], 1000));
      const three = DealTools.groupAllocationRowsByStation(rowsFor(['SpotOn', 'FAAI', 'TopicPulse'], 1000));
      assertClose(one.totals.barterValue, two.totals.barterValue, 0.01,
        'Adding a second product must not change the airtime');
      assertClose(two.totals.barterValue, three.totals.barterValue, 0.01,
        'Adding a third product must not change the airtime');
    });

    test('allocation grouping: reproduces the reported deal', () => {
      // SpotOn $7,560 + FAAI $6,443 = $14,003, split equally across 3 stations.
      const rows = [];
      [['SpotOn', 7560], ['FAAI', 6443]].forEach(([product, annual]) => {
        STATIONS.forEach(st => rows.push({
          station: st.station, market: st.market, product,
          primeAQH: st.primeAQH, rosAQH: st.rosAQH,
          revenueAllocated: annual / 3, cashAnnual: 0,
          barterValue: st.barterValue,
          primeMinutes: st.primeMinutes, rosMinutes: st.rosMinutes,
          stationType: 'Barter'
        }));
      });
      const r = DealTools.groupAllocationRowsByStation(rows);
      assertClose(r.totals.revenueAllocated, 14003, 1, 'Deal value $14,003');
      assertClose(r.totals.barterValue, 13541, 1,
        'Barter $13,541, not the $27,082 the double count reported');
      const coverage = r.totals.barterValue / r.totals.revenueAllocated * 100;
      assertClose(coverage, 96.7, 0.2, `Coverage ~96.7%, not 193%: got ${coverage.toFixed(1)}%`);
      r.stations.forEach(g => assertClose(g.revenueAllocated, 4667.67, 1,
        `${g.station} revenue should be the sum of both products`));
    });

    test('allocation grouping: inventory-only stations carry barter but no products', () => {
      const rows = [
        { station: 'WAHR-F2', market: 'M', product: 'SpotOn', revenueAllocated: 1000,
          cashAnnual: 0, barterValue: 5000, primeMinutes: 2, rosMinutes: 2, stationType: 'Barter' },
        { station: 'WINV-FM', market: 'M', product: 'Inventory Only', revenueAllocated: 0,
          cashAnnual: 0, barterValue: 2000, primeMinutes: 1, rosMinutes: 1, stationType: 'Inventory' }
      ];
      const r = DealTools.groupAllocationRowsByStation(rows);
      const inv = r.stations.find(g => g.station === 'WINV-FM');
      assertTrue(inv.isInventory, 'Inventory station should be flagged');
      assertEqual(inv.products.length, 0, 'Inventory station has no product sub-rows');
      assertClose(inv.barterValue, 2000, 0.01, 'Inventory station still contributes barter');
      assertEqual(r.totals.productStations, 1, 'One product station');
      assertEqual(r.totals.inventoryStations, 1, 'One inventory station');
      assertClose(r.totals.barterValue, 7000, 0.01, 'Both stations contribute barter once');
    });

    test('allocation grouping: a zero-minute product row cannot clobber the station', () => {
      // An off-book or zero-barter product row must not pull the station's airtime to 0.
      const rows = [
        { station: 'WAHR-F2', market: 'M', product: 'SpotOn', revenueAllocated: 500,
          cashAnnual: 0, barterValue: 5023.20, primeMinutes: 2, rosMinutes: 2, stationType: 'Barter' },
        { station: 'WAHR-F2', market: 'M', product: 'CashOnlyProduct', revenueAllocated: 500,
          cashAnnual: 0, barterValue: 0, primeMinutes: 0, rosMinutes: 0, stationType: 'Barter' }
      ];
      const r = DealTools.groupAllocationRowsByStation(rows);
      assertClose(r.stations[0].barterValue, 5023.20, 0.01, 'Station keeps its real barter value');
      assertEqual(r.stations[0].primeMinutes, 2, 'Station keeps its real prime minutes');
      assertClose(r.stations[0].revenueAllocated, 1000, 0.01, 'Revenue still sums');
    });

    test('allocation grouping: mixed deals accumulate cash per product, barter once', () => {
      const rows = [];
      ['SpotOn', 'FAAI'].forEach(product => STATIONS.forEach(st => rows.push({
        station: st.station, market: st.market, product,
        revenueAllocated: 1000, cashAnnual: 600,
        barterValue: st.barterValue,
        primeMinutes: st.primeMinutes, rosMinutes: st.rosMinutes, stationType: 'Mixed'
      })));
      const r = DealTools.groupAllocationRowsByStation(rows);
      assertClose(r.totals.cashAnnual, 600 * 3 * 2, 0.01,
        'Cash is per product and accumulates');
      assertClose(r.totals.barterValue, REAL_AIRTIME, 0.01,
        'Barter is per station and is counted once');
    });
  })();

  // ============================================================================
  // CACHE-BUSTING VERSION STAMP (Node only -- needs the filesystem)
  // ============================================================================

  if (typeof module === 'object' && module.exports) {
    const fs = require('fs');
    const path = require('path');
    const { ROOT, computeVersion, readStamps, versionedAssets } = require('./asset-version.js');

    test('APP_VERSION stamp in index.html matches the assets on disk', () => {
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const expected = computeVersion();
      const stamps = readStamps(html);

      stamps.forEach(s => {
        assertTrue(s.value !== null,
          `index.html is missing its ${s.label} -- cache busting is broken`);
      });

      const stale = stamps.filter(s => s.value !== expected);
      assertTrue(stale.length === 0,
        'index.html cache-busting stamp is stale. Expected v=' + expected + ' but found ' +
        stale.map(s => `${s.label}=${s.value}`).join(', ') +
        '. A versioned asset (' + versionedAssets().join(', ') + ') changed without ' +
        're-stamping index.html, so browsers will keep serving the old file. ' +
        'Fix: npm run stamp');
    });
  }

  // ============================================================================
  // RUN ALL TESTS
  // ============================================================================

  log('\n=== Deal Tools Test Results ===\n');
  log(`Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  log('\n');

  // Export results for TEST-RESULTS.md generation
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { results, passCount, failCount };
    // Exit non-zero so a real failure actually fails `npm run test:tools`. Until the
    // stale calculateBarterMinutes assertion above was corrected the suite always had
    // one failure, so it could only ever exit 0 and regressions went unnoticed.
    if (typeof process !== 'undefined' && process.exitCode === undefined && failCount > 0) {
      process.exitCode = 1;
    }
  } else if (typeof window !== 'undefined') {
    window._testResults = { results, passCount, failCount };
  }

  return { results, passCount, failCount };

}));
