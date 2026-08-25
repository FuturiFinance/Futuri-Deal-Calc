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
      fs.readFileSync(path.join(__dirname, '..', 'radio_data_fall2025.json'), 'utf8')
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

  test('calculateLiveStreamCapture: 1080p and 720p rates', () => {
    const hd = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '1080p', months: 12 }, 1);
    assertEqual(hd.monthlyTotal, 13750, '11 streams @ 1080p = $13,750/mo');
    assertEqual(hd.annualTotal, 165000, '11 streams @ 1080p annual run rate = $165,000');
    assertEqual(hd.termTotal, 165000, '11 streams @ 1080p × 12 mo term = $165,000');

    const sd = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '720p', months: 12 }, 1);
    assertEqual(sd.monthlyTotal, 11000, '11 streams @ 720p = $11,000/mo');
    assertEqual(sd.termTotal, 132000, '11 streams @ 720p × 12 mo term = $132,000');
  });

  test('calculateLiveStreamCapture: term scales with the deal term', () => {
    const mo = 13750;
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
    assertEqual(custom.termTotal, 247500, '18mo custom term = $247,500');
  });

  test('calculateLiveStreamCapture: omitted term falls back to the 36mo deal default', () => {
    const c = DealTools.calculateLiveStreamCapture(
      { enabled: true, streamCount: 11, resolution: '1080p' }, 1);
    assertEqual(c.months, 36, 'Defaults to the deal-term default of 36 months');
    assertEqual(c.termTotal, 495000, '11 streams @ 1080p × 36 mo = $495,000');
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
    assertEqual(price.monthly, 13750, 'Capture-only monthly = capture total');
    assertEqual(price.annual, 165000, 'Capture-only annual = annual run rate');
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
    assertEqual(price.monthly, 16250, 'Tier 1 $2,500 + capture $13,750 = $16,250/mo');
    assertEqual(price.breakdown.creditMonthly, 2500, 'Credit portion stays addressable');
    assertEqual(price.breakdown.capture.monthlyTotal, 13750, 'Capture portion stays addressable');
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
    assertEqual(barter.monthly, 2100, 'Barter applies 1.4x exactly once');
  });

  test('calculateProductPrice: SpotOn audio spots divide by the audio credit cost', () => {
    // The bug this guards: audioSpots used to be the raw credit count. At 6 credits
    // per spot that reports 6x too many spots while dollars stay correct.
    const p = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    assertEqual(p.breakdown.audioCredits, 700, '70% of 1,000 credits is audio');
    assertEqual(p.breakdown.audioSpots, 116, '700 audio credits / 6 = 116 spots, not 700');
  });

  test('calculateProductPrice: SpotOn spec and broadcast video tiers', () => {
    const p = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    assertEqual(p.breakdown.videoCredits, 300, '30% of 1,000 credits is video');
    assertEqual(p.breakdown.video15Spec, 25, '300 / 12 = 25 :15 spec');
    assertEqual(p.breakdown.video30Spec, 12, '300 / 24 = 12 :30 spec');
    assertEqual(p.breakdown.video15Broadcast, 6, '300 / 45 = 6 :15 broadcast');
    assertEqual(p.breakdown.video30Broadcast, 3, '300 / 90 = 3 :30 broadcast');
    assertTrue(p.breakdown.video10s === undefined, ':10 tier is gone entirely');
  });

  test('SPOTON_PRICING: rates match the published card', () => {
    const sp = DealTools.SPOTON_PRICING;
    assertEqual(sp.pricePerCredit, 1, '$1 per credit');
    assertEqual(sp.creditIncrement, 50, 'bought in blocks of 50');
    assertEqual(sp.audioCredits, 6, 'Audio Spot (:30) = 6');
    assertEqual(sp.video15SpecCredits, 12, ':15 spec = 12');
    assertEqual(sp.video30SpecCredits, 24, ':30 spec = 24');
    assertEqual(sp.video15BroadcastCredits, 45, ':15 broadcast = 45');
    assertEqual(sp.video30BroadcastCredits, 90, ':30 broadcast = 90');
    assertTrue(sp.video10Credits === undefined, ':10 constant removed');
  });

  test('calculateProductPrice: SpotOn barter runs through the universal multiplier', () => {
    const cash = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'cash'
    });
    const barter = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 1000, pricingType: 'barter'
    });
    assertEqual(cash.monthly, 1000, '1,000 credits at $1 = $1,000/mo cash');
    assertClose(barter.monthly, 1400, 0.01, 'barter is cash x 1.4, no SpotOn-specific path');
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
    const result = DealTools.calculateBarterMinutes(target, stations, 2.0);

    // Due to rounding up (ceil), allocated value should be >= target
    assertTrue(result.total.annualValue >= target, 'Allocated value should meet or exceed target');
    // Rounding up can cause over-allocation, especially with high-AQH stations
    // Allow up to 25% over-allocation (ceiling effect on minutes)
    const overAllocation = (result.total.annualValue - target) / target;
    assertTrue(overAllocation < 0.25, `Over-allocation should be < 25%: got ${(overAllocation * 100).toFixed(1)}%`);
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
  // RUN ALL TESTS
  // ============================================================================

  log('\n=== Deal Tools Test Results ===\n');
  log(`Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  log('\n');

  // Export results for TEST-RESULTS.md generation
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { results, passCount, failCount };
  } else if (typeof window !== 'undefined') {
    window._testResults = { results, passCount, failCount };
  }

  return { results, passCount, failCount };

}));
