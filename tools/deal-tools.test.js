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
    const results = DealTools.lookupParent('iHeartMedia, Inc.', { data: nielsenData });
    assertTrue(results.length > 0, 'Should return results');
    assertEqual(results[0].parentName, 'iHeartMedia, Inc.', 'First result should be exact match');
    assertGreaterThan(results[0].stationCount, 0, 'Should have stations');
  });

  test('lookupParent: partial match works', () => {
    const results = DealTools.lookupParent('heart', { data: nielsenData });
    assertTrue(results.length > 0, 'Should return results for partial match');
    assertTrue(results.some(r => r.parentName.toLowerCase().includes('heart')), 'Results should contain "heart"');
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
    const results = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    assertGreaterThan(results.length, 0, 'Should return stations');
    assertTrue(results.every(r => r.stationCallSign), 'All stations should have call signs');
    assertTrue(results.some(r => r.primeAQH > 0), 'Some stations should have prime AQH');
  });

  test('lookupStations: returns specific station data', () => {
    const results = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', 'WLTW', { data: nielsenData });
    assertTrue(results.length > 0, 'Should find WLTW');
    assertTrue(results[0].stationCallSign.includes('WLTW'), 'Should find WLTW-FM');
    assertGreaterThan(results[0].primeAQH, 20000, 'WLTW should have high AQH');
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
      tier: 'large',
      pricingType: 'cash'
    });
    assertEqual(price.monthly, 19000, 'Content Automation Large = $19K/month');
    assertEqual(price.annual, 228000, 'Content Automation Large = $228K/year');
    assertEqual(price.breakdown.credits, 20000, 'Large tier = 20,000 credits');
  });

  test('calculateProductPrice: SpotOn credits', () => {
    const price = DealTools.calculateProductPrice('spoton', {}, {
      creditsPerMonth: 200,
      pricingType: 'cash'
    });
    // 200 credits × $4 = $800/month
    assertEqual(price.monthly, 800, 'SpotOn 200 credits = $800/month');
    assertEqual(price.annual, 9600, 'SpotOn 200 credits = $9,600/year');
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
    const stations = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    const stationKeys = stations.slice(0, 3).map(s =>
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
    assertEqual(deal.parent, 'iHeartMedia, Inc.');
    assertEqual(deal.stations.length, 3);
    assertEqual(deal.products.length, 2);
    assertGreaterThan(deal.totalAnnual, 0, 'Should have total annual value');
    assertEqual(deal.cashAnnual, deal.totalAnnual, 'Cash deal: cash should equal total');
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
    assertEqual(deal.customerName, 'Test Agency Inc.');
    assertEqual(deal.stations.length, 0);
    assertGreaterThan(deal.totalAnnual, 0, 'Should have total value');
    // Agency deals use flat pricing (count = 1)
    assertEqual(deal.productValues['topicpulse'].breakdown.count, 1, 'Agency should use flat pricing');
  });

  test('buildDeal: mixed payment deal', () => {
    const stations = DealTools.lookupStations('iHeartMedia, Inc.', 'New York [PPM+D]', null, { data: nielsenData });
    const stationKeys = stations.slice(0, 2).map(s =>
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
