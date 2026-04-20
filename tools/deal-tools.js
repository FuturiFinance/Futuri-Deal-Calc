/**
 * Futuri Deal Calculator - Standalone Tool Functions
 *
 * Universal JS module (works in browser and Node.js)
 * These functions replicate the calculation logic from the main app
 * for use by AI agents and API endpoints.
 *
 * @version 1.0.0
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.DealTools = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const BARTER_MULTIPLIER = 1.4;

  const BARTER_FORMULA = {
    DAYPARTS: 2,
    DAYS_PER_WEEK: 7,
    WEEKS_PER_YEAR: 52,
    ANNUAL_MULTIPLIER: 728  // 2 × 7 × 52
  };

  const TOPLINE_PRICING = {
    tierPrices: { access: 42000, enterprise: 30000, both: 72000 },
    usersIncluded: 5,
    additionalUserMonthly: 250,
    accountsIncluded: 220,
    additionalAccountBlockMonthly: 25,
    attributionAnnual: 5000,
    dataSetPrice: 1000,
    crmHourly: 300,
    crmMaintenance: 0.10,
    spotonPricePerCredit: 4,
    chuyLocationSetup: 99,
    chuyLocationMonthly: 10,
    chuyRetailerMonthly: 119,
    tvHardCostsAnnual: 4800
  };

  const CONTENT_AUTOMATION_PRICING = {
    tiers: {
      xs:     { name: 'XS',     credits: 5000,  monthly: 6500,  costPerCredit: 1.30 },
      small:  { name: 'Small',  credits: 10000, monthly: 12000, costPerCredit: 1.20 },
      medium: { name: 'Medium', credits: 15000, monthly: 16500, costPerCredit: 1.10 },
      large:  { name: 'Large',  credits: 20000, monthly: 19000, costPerCredit: 0.95 },
      xl:     { name: 'XL',     credits: 50000, monthly: 40000, costPerCredit: 0.80 }
    }
  };

  const SPOTON_PRICING = {
    pricePerCredit: 4,
    creditIncrement: 50,
    audioCredits: 1,
    video15Credits: 4,
    video30Credits: 8
  };

  const FB_GROUPS_PRICING = {
    pricePerGroup: 50
  };

  const FAAI_PRICING = {
    wordsPerMinute: 150,
    charsPerWord: 5,
    elevenLabsCostPer1000Chars: 0.20,
    llmCostPercent: 0.25,
    daysPerMonth: 30
  };

  const MARKET_LEVEL_PRODUCTS = ['topline', 'spoton'];
  const SPECIAL_PRODUCTS = ['topline', 'topline_cx_war_room', 'content_automation', 'spoton', 'topicpulse_community_radar_fb', 'faai'];
  const BARTER_EXCLUDED_PRODUCTS = ['topline_cx_war_room'];
  const CASH_ONLY_PRODUCTS = ['topline_cx_war_room'];

  const MEDIA_TYPES = {
    RADIO: 'Radio',
    TV: 'TV',
    AGENCY_OTHER: 'AgencyOther'
  };

  const DEFAULT_PRODUCTS = [
    { id: 'topline', name: 'TopLine', cash: null, barter: null, industry: 'Radio/TV', pricingType: 'tiered' },
    { id: 'topline_cx_war_room', name: 'TopLine CX War Room', cash: 1000, barter: null, industry: 'Radio/TV', cashOnly: true, pricingType: 'per_station' },
    { id: 'spoton', name: 'SpotOn', cash: null, barter: null, industry: 'Radio/TV', note: '$4/credit, increments of 50', pricingType: 'credit_based' },
    { id: 'topicpulse', name: 'TopicPulse', cash: 750, barter: 1050, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'instant_video', name: 'TopicPulse IV Add-on', cash: 500, barter: 700, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'topicpulse_iv', name: 'TopicPulse IV', cash: 1250, barter: 1750, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'topicpulse_community_radar_fb', name: 'TopicPulse Community Radar (FB Groups)', cash: null, barter: null, industry: 'Radio/TV', note: '$50/group', pricingType: 'per_unit' },
    { id: 'topicpulse_community_radar_nextdoor', name: 'TopicPulse Community Radar (Next Door)', cash: 150, barter: 210, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'prep_plus', name: 'Prep+', cash: 500, barter: 700, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'content_automation', name: 'Content Automation', cash: null, barter: null, industry: 'Radio/TV', pricingType: 'tiered' },
    { id: 'faai', name: 'FAAI', cash: null, barter: null, industry: 'Radio/TV', pricingType: 'calculated' },
    { id: 'post', name: 'POST', cash: 1000, barter: 1400, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'streaming', name: 'Streaming', cash: 300, barter: 420, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'mobile', name: 'Mobile', cash: 500, barter: 700, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'ldr', name: 'LDR', cash: 500, barter: 700, industry: 'Radio/TV', pricingType: 'per_station' },
    { id: 'inventory_only', name: 'Inventory Only', cash: 0, barter: 1, industry: 'Radio/TV', note: 'Set custom value for barter minutes allocation', pricingType: 'per_station' }
  ];

  // ============================================================================
  // DATA CACHE
  // ============================================================================

  let _cachedNielsenData = null;
  let _cachedRateCard = null;

  /**
   * Load Nielsen book data (for Node.js or pre-loading)
   * @param {string|object} source - File path (Node.js) or data object
   * @returns {Promise<object>} Nielsen data { parents, markets, stations }
   */
  async function loadNielsenBook(source) {
    if (typeof source === 'object' && source !== null) {
      _cachedNielsenData = source;
      return source;
    }

    // Node.js file loading
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const data = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
      _cachedNielsenData = data;
      return data;
    }

    // Browser fetch
    const response = await fetch(source);
    const data = await response.json();
    _cachedNielsenData = data;
    return data;
  }

  /**
   * Load rate card data
   * @param {string|object} source - File path (Node.js) or data object
   * @returns {Promise<object>} Rate card data
   */
  async function loadRateCard(source) {
    if (typeof source === 'object' && source !== null) {
      _cachedRateCard = source;
      return source;
    }

    if (typeof require !== 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const data = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
      _cachedRateCard = data;
      return data;
    }

    const response = await fetch(source);
    const data = await response.json();
    _cachedRateCard = data;
    return data;
  }

  /**
   * Get Nielsen data (from cache or provided)
   */
  function getNielsenData(options) {
    return (options && options.data) || _cachedNielsenData;
  }

  /**
   * Get rate card (from cache or provided)
   */
  function getRateCard(options) {
    return (options && options.rateCard) || _cachedRateCard;
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Simple fuzzy match score (higher = better match)
   */
  function fuzzyScore(query, target) {
    if (!query || !target) return 0;
    const q = query.toLowerCase().trim();
    const t = target.toLowerCase().trim();

    if (t === q) return 100;  // Exact match
    if (t.startsWith(q)) return 80;  // Starts with
    if (t.includes(q)) return 60;  // Contains

    // Simple character matching for typos
    let matches = 0;
    let qIdx = 0;
    for (let i = 0; i < t.length && qIdx < q.length; i++) {
      if (t[i] === q[qIdx]) {
        matches++;
        qIdx++;
      }
    }
    return (matches / q.length) * 40;
  }

  /**
   * Create station key
   */
  function makeStationKey(station) {
    return `${station.parent}|${station.market}|${station.station}`;
  }

  /**
   * Parse station key
   */
  function parseStationKey(key) {
    const [parent, market, station] = key.split('|');
    return { parent, market, station };
  }

  /**
   * Check if product is market-level
   */
  function isMarketLevelProduct(productId) {
    return MARKET_LEVEL_PRODUCTS.includes(productId);
  }

  /**
   * Check if product is special (has custom config UI)
   */
  function isSpecialProduct(productId) {
    return SPECIAL_PRODUCTS.includes(productId);
  }

  /**
   * Calculate value from minutes/day
   * Formula: Annual Value = (AQH × Minutes/day × CPM × 728) / 1000
   */
  function calculateValueFromMinutes(minutesPerDay, aqh, cpm) {
    if (!aqh || !cpm || !minutesPerDay) return 0;
    return (aqh * minutesPerDay * cpm * BARTER_FORMULA.ANNUAL_MULTIPLIER) / 1000;
  }

  /**
   * Calculate minutes/day from annual value
   * Formula: Minutes/day = (Annual Value × 1000) / (AQH × CPM × 728)
   */
  function calculateMinutesFromValue(annualValue, aqh, cpm) {
    if (!aqh || !cpm || !annualValue) return 0;
    return (annualValue * 1000) / (aqh * cpm * BARTER_FORMULA.ANNUAL_MULTIPLIER);
  }

  // ============================================================================
  // TOOL 1: lookupParent
  // ============================================================================

  /**
   * Fuzzy match parent company name
   * @param {string} query - Search query (partial name, typos OK)
   * @param {object} options - { data: nielsenData }
   * @returns {{results: Array<{parentId: string, parentName: string, marketCount: number, stationCount: number, inBook: boolean}>, canCreateNew: boolean}}
   */
  function lookupParent(query, options) {
    const data = getNielsenData(options);

    // If no data loaded, return empty results with canCreateNew flag
    if (!data || !data.stations) {
      return {
        results: [],
        canCreateNew: true  // Allow creating off-book parent
      };
    }

    // Build parent index
    const parentStats = new Map();
    data.stations.forEach(s => {
      if (!s.parent) return;
      if (!parentStats.has(s.parent)) {
        parentStats.set(s.parent, { markets: new Set(), stationCount: 0 });
      }
      const stats = parentStats.get(s.parent);
      stats.markets.add(s.market);
      stats.stationCount++;
    });

    // Score and filter
    const results = [];
    parentStats.forEach((stats, parentName) => {
      const score = fuzzyScore(query, parentName);
      if (score > 20) {  // Minimum threshold
        results.push({
          parentId: parentName,  // Using name as ID since that's what the app uses
          parentName: parentName,
          marketCount: stats.markets.size,
          stationCount: stats.stationCount,
          inBook: true,
          _score: score
        });
      }
    });

    // Sort by score descending
    results.sort((a, b) => b._score - a._score);

    // Remove internal score field and return with canCreateNew flag
    const cleanResults = results.map(r => {
      const { _score, ...rest } = r;
      return rest;
    });

    // canCreateNew is true if no exact match found (score < 100)
    const hasExactMatch = results.some(r => r._score === 100);

    return {
      results: cleanResults,
      canCreateNew: !hasExactMatch  // Allow creating if no exact match
    };
  }

  // ============================================================================
  // TOOL 2: lookupMarkets
  // ============================================================================

  /**
   * List markets, optionally filtered by parent
   * @param {string|null} parentId - Filter by parent company (optional)
   * @param {string|null} query - Search query (optional)
   * @param {object} options - { data: nielsenData }
   * @returns {Array<{marketName: string, stationCount: number}>}
   */
  function lookupMarkets(parentId, query, options) {
    const data = getNielsenData(options);
    if (!data || !data.stations) {
      throw new Error('Nielsen data not loaded. Call loadNielsenBook() first or pass data in options.');
    }

    // Filter stations
    let stations = data.stations;
    if (parentId) {
      stations = stations.filter(s => s.parent === parentId);
    }

    // Build market index
    const marketStats = new Map();
    stations.forEach(s => {
      if (!s.market) return;
      if (!marketStats.has(s.market)) {
        marketStats.set(s.market, 0);
      }
      marketStats.set(s.market, marketStats.get(s.market) + 1);
    });

    // Convert to array and filter by query
    let results = [];
    marketStats.forEach((count, marketName) => {
      if (!query || fuzzyScore(query, marketName) > 20) {
        results.push({
          marketName: marketName,
          stationCount: count
        });
      }
    });

    // Sort alphabetically
    results.sort((a, b) => a.marketName.localeCompare(b.marketName));

    return results;
  }

  // ============================================================================
  // TOOL 3: lookupStations
  // ============================================================================

  /**
   * List stations, optionally filtered
   * @param {string|null} parentId - Filter by parent company (optional)
   * @param {string|null} marketName - Filter by market (optional)
   * @param {string|null} query - Search query (optional)
   * @param {object} options - { data: nielsenData, allowCreate: boolean }
   * @returns {{results: Array<{stationCallSign: string, market: string, parent: string, format: string, primeAQH: number|null, rosAQH: number|null, inBook: boolean}>, canCreateNew: boolean}}
   */
  function lookupStations(parentId, marketName, query, options) {
    options = options || {};
    const data = getNielsenData(options);

    // If no data loaded, return empty results with canCreateNew
    if (!data || !data.stations) {
      return {
        results: [],
        canCreateNew: true  // Allow creating off-book stations
      };
    }

    let stations = data.stations;

    // Apply filters
    if (parentId) {
      stations = stations.filter(s => s.parent === parentId);
    }
    if (marketName) {
      stations = stations.filter(s => s.market === marketName);
    }
    if (query) {
      stations = stations.filter(s => fuzzyScore(query, s.station) > 20);
    }

    // Map to output format
    const results = stations.map(s => ({
      stationCallSign: s.station,
      market: s.market,
      parent: s.parent,
      format: s.format || '',
      primeAQH: s.primeAQH || 0,
      rosAQH: s.rosAQH || 0,
      inBook: true
    }));

    // canCreateNew based on allowCreate flag or if no results
    const canCreateNew = options.allowCreate === true || results.length === 0;

    return {
      results,
      canCreateNew
    };
  }

  /**
   * Create an off-book station entry (for manual entry of TV/unknown stations)
   * @param {object} stationData - { callSign, market, parent, format? }
   * @returns {object} Station object with inBook: false
   */
  function createOffBookStation(stationData) {
    return {
      stationCallSign: stationData.callSign,
      market: stationData.market || 'Unknown',
      parent: stationData.parent || 'Unknown',
      format: stationData.format || 'Unknown',
      primeAQH: null,  // null indicates off-book, no AQH data
      rosAQH: null,
      inBook: false
    };
  }

  // ============================================================================
  // TOOL 4: getProductCatalog
  // ============================================================================

  /**
   * Get full product list with rate cards and pricing info
   * @param {object} options - { rateCard: rateCardData }
   * @returns {Array<{productId, name, pricingType, basePrice, notes, supportsBarter, supportsCash, tierOptions?}>}
   */
  function getProductCatalog(options) {
    const rateCard = getRateCard(options);
    const products = (rateCard && rateCard.products) || DEFAULT_PRODUCTS;

    return products.map(p => {
      const result = {
        productId: p.id,
        name: p.name,
        pricingType: getPricingType(p),
        basePrice: getBasePrice(p),
        notes: p.note || null,
        supportsBarter: !BARTER_EXCLUDED_PRODUCTS.includes(p.id) && !p.cashOnly,
        supportsCash: true
      };

      // Add tier options for tiered products
      if (p.id === 'topline') {
        result.tierOptions = {
          access: { name: 'TopLine Access (Base)', annualPerMarket: 42000, description: 'Base TopLine product' },
          enterprise: { name: 'TopLine Enterprise', annualPerMarket: 30000, description: 'Enterprise tier - use tier:"enterprise"' },
          both: { name: 'TopLine Both (Access + Enterprise)', annualPerMarket: 72000, description: 'Both tiers combined' }
        };
        result.tierNote = 'IMPORTANT: When user says "TopLine Enterprise", use tier:"enterprise" ($30K/yr). Default "TopLine" alone means tier:"access" ($42K/yr).';
      } else if (p.id === 'content_automation') {
        result.tierOptions = CONTENT_AUTOMATION_PRICING.tiers;
      } else if (p.id === 'spoton') {
        result.creditPrice = SPOTON_PRICING.pricePerCredit;
        result.creditIncrement = SPOTON_PRICING.creditIncrement;
      }

      return result;
    });
  }

  function getPricingType(product) {
    if (product.pricingType) return product.pricingType;
    if (product.id === 'topline') return 'tiered';
    if (product.id === 'content_automation') return 'tiered';
    if (product.id === 'spoton') return 'credit_based';
    if (product.id === 'topicpulse_community_radar_fb') return 'per_unit';
    if (product.id === 'faai') return 'calculated';
    if (MARKET_LEVEL_PRODUCTS.includes(product.id)) return 'per_market';
    return 'per_station';
  }

  function getBasePrice(product) {
    if (product.id === 'topline') return null;  // Configured
    if (product.id === 'content_automation') return null;  // Tiered
    if (product.id === 'spoton') return null;  // Credit-based
    if (product.id === 'faai') return null;  // Calculated
    if (product.id === 'topicpulse_community_radar_fb') return 50;  // Per group
    return { cash: product.cash, barter: product.barter };
  }

  // ============================================================================
  // TOOL 5: calculateProductPrice
  // ============================================================================

  /**
   * Calculate list price for a product configuration
   * @param {string} productId - Product ID
   * @param {object} assignments - { stations?: string[], markets?: string[] }
   * @param {object} extras - Product-specific config and pricing options
   * @returns {{monthly: number, annual: number, breakdown: object}}
   */
  function calculateProductPrice(productId, assignments, extras) {
    extras = extras || {};
    const pricingType = extras.pricingType || 'cash';
    const multiplier = (pricingType === 'barter') ? BARTER_MULTIPLIER : 1;

    // Handle special products
    if (productId === 'topline') {
      return calculateTopLinePrice(assignments, extras, multiplier);
    }
    if (productId === 'content_automation') {
      return calculateContentAutomationPrice(extras, multiplier);
    }
    if (productId === 'spoton') {
      return calculateSpotOnPrice(extras, multiplier);
    }
    if (productId === 'topicpulse_community_radar_fb') {
      return calculateFbGroupsPrice(extras, multiplier);
    }
    if (productId === 'faai') {
      return calculateFaaiPrice(extras, multiplier);
    }

    // Standard per-station products
    return calculateStandardProductPrice(productId, assignments, extras, multiplier);
  }

  function calculateTopLinePrice(assignments, extras, multiplier) {
    const e = extras;
    const p = TOPLINE_PRICING;

    const tier = e.tier || 'access';
    const numMarkets = Math.max(1, e.numberOfMarkets || (assignments.markets || []).length || 1);

    const baseAnnual = (p.tierPrices[tier] || 0) * numMarkets * multiplier;

    const additionalUsers = Math.max(0, (e.usersNeeded || 5) - p.usersIncluded);
    const usersAnnual = additionalUsers * p.additionalUserMonthly * 12 * multiplier;

    const additionalAccounts = Math.max(0, (e.accountsNeeded || 220) - p.accountsIncluded);
    const accountBlocks = Math.ceil(additionalAccounts / 5);
    const accountsAnnual = accountBlocks * p.additionalAccountBlockMonthly * 12 * multiplier;

    const baseSubtotal = baseAnnual + usersAnnual + accountsAnnual;
    const attributionAnnual = e.attributionEnabled ? p.attributionAnnual * multiplier : 0;

    const dataSetOneTime = (e.dataSets || 0) * p.dataSetPrice * multiplier;
    const crmOneTime = (e.crmIntegrationHours || 0) * p.crmHourly * multiplier;
    const crmMaintenance = crmOneTime * p.crmMaintenance;

    const tvAnnual = e.tvEnabled ? p.tvHardCostsAnnual * multiplier : 0;
    const spotonAnnual = (e.spotonCredits || 0) * p.spotonPricePerCredit * 12 * multiplier;

    const chuySetup = (e.chuyLocations || 0) * p.chuyLocationSetup * multiplier;
    const chuyLocationAnnual = (e.chuyLocations || 0) * p.chuyLocationMonthly * 12 * multiplier;
    const chuyRetailerAnnual = (e.chuyRetailers || 0) * p.chuyRetailerMonthly * 12 * multiplier;

    const totalOneTime = dataSetOneTime + crmOneTime + chuySetup;
    const calculatedAnnual = baseSubtotal + attributionAnnual + crmMaintenance + tvAnnual + spotonAnnual + chuyLocationAnnual + chuyRetailerAnnual;

    // Price override support
    const totalAnnual = (e.priceOverride && e.priceOverride > 0) ? e.priceOverride : calculatedAnnual;

    return {
      monthly: totalAnnual / 12,
      annual: totalAnnual,
      breakdown: {
        tier,
        numMarkets,
        baseAnnual,
        usersAnnual,
        accountsAnnual,
        attributionAnnual,
        tvAnnual,
        spotonAnnual,
        chuyLocationAnnual,
        chuyRetailerAnnual,
        crmMaintenance,
        totalOneTime,
        calculatedAnnual,
        isOverridden: (e.priceOverride && e.priceOverride > 0)
      }
    };
  }

  function calculateContentAutomationPrice(extras, multiplier) {
    const tier = extras.tier || 'xs';
    const tierData = CONTENT_AUTOMATION_PRICING.tiers[tier] || CONTENT_AUTOMATION_PRICING.tiers.xs;

    const monthlyCost = tierData.monthly * multiplier;

    return {
      monthly: monthlyCost,
      annual: monthlyCost * 12,
      breakdown: {
        tier,
        tierName: tierData.name,
        credits: tierData.credits,
        costPerCredit: tierData.costPerCredit
      }
    };
  }

  function calculateSpotOnPrice(extras, multiplier) {
    const credits = extras.creditsPerMonth || 0;
    const monthlyCost = credits * SPOTON_PRICING.pricePerCredit * multiplier;

    // Calculate allocation (70/30 split)
    const audioCredits = Math.floor(credits * 0.70);
    const videoCredits = credits - audioCredits;

    return {
      monthly: monthlyCost,
      annual: monthlyCost * 12,
      breakdown: {
        creditsPerMonth: credits,
        pricePerCredit: SPOTON_PRICING.pricePerCredit,
        audioCredits,
        videoCredits,
        audioSpots: audioCredits,
        video15s: Math.floor(videoCredits / SPOTON_PRICING.video15Credits),
        video30s: Math.floor(videoCredits / SPOTON_PRICING.video30Credits)
      }
    };
  }

  function calculateFbGroupsPrice(extras, multiplier) {
    const groupCount = extras.groupCount || 0;
    const monthlyCost = groupCount * FB_GROUPS_PRICING.pricePerGroup * multiplier;

    return {
      monthly: monthlyCost,
      annual: monthlyCost * 12,
      breakdown: {
        groupCount,
        pricePerGroup: FB_GROUPS_PRICING.pricePerGroup
      }
    };
  }

  function calculateFaaiPrice(extras, multiplier) {
    const p = FAAI_PRICING;
    const numberOfShows = extras.numberOfShows || 0;
    const minutesPerDay = extras.minutesPerDay || 0;
    const margin = extras.margin || 90;

    const charsPerMonth = numberOfShows * minutesPerDay * p.wordsPerMinute * p.charsPerWord * p.daysPerMonth;
    const elevenLabsCost = (charsPerMonth / 1000) * p.elevenLabsCostPer1000Chars;
    const llmCost = elevenLabsCost * p.llmCostPercent;
    const totalAiCost = elevenLabsCost + llmCost;

    const monthlyCash = margin < 100 ? totalAiCost / (1 - margin / 100) : totalAiCost;
    const monthlyBarter = monthlyCash * BARTER_MULTIPLIER;

    const monthlyCost = (multiplier === BARTER_MULTIPLIER) ? monthlyBarter : monthlyCash;

    return {
      monthly: monthlyCost,
      annual: monthlyCost * 12,
      breakdown: {
        numberOfShows,
        minutesPerDay,
        margin,
        charsPerMonth,
        elevenLabsCost,
        llmCost,
        totalAiCost,
        monthlyCash,
        monthlyBarter
      }
    };
  }

  function calculateStandardProductPrice(productId, assignments, extras, multiplier) {
    const rateCard = getRateCard(extras);
    const products = (rateCard && rateCard.products) || DEFAULT_PRODUCTS;
    const product = products.find(p => p.id === productId);

    if (!product) {
      return { monthly: 0, annual: 0, breakdown: { error: 'Product not found' } };
    }

    // Custom price takes priority
    let unitPrice;
    if (extras.customPrice !== undefined && extras.customPrice !== null) {
      unitPrice = extras.customPrice;
    } else {
      // Use rate card value based on pricing type
      unitPrice = (multiplier === BARTER_MULTIPLIER)
        ? (product.barter || (product.cash * BARTER_MULTIPLIER))
        : product.cash;
    }

    if (unitPrice === null || unitPrice === undefined) {
      return { monthly: 0, annual: 0, breakdown: { error: 'No price available' } };
    }

    // Calculate count based on assignments
    let count = 1;
    if (isMarketLevelProduct(productId)) {
      count = (assignments.markets || []).length || 1;
    } else {
      count = (assignments.stations || []).length || 1;
    }

    // Agency deals use flat pricing
    if (extras.dealType === 'agency') {
      count = 1;
    }

    const monthly = unitPrice * count;

    return {
      monthly,
      annual: monthly * 12,
      breakdown: {
        productId,
        unitPrice,
        count,
        isCustomPrice: extras.customPrice !== undefined
      }
    };
  }

  // ============================================================================
  // TOOL 6: calculateBarterMinutes
  // ============================================================================

  /**
   * Calculate barter minutes to hit target value (pure auto-calc, no manual overrides)
   * @param {number} targetAnnualValue - Annual value barter should cover
   * @param {Array<{callSign: string, primeAQH: number, rosAQH: number}>} stations - Station data
   * @param {number} cpm - Cost per mille (default 2.0)
   * @returns {{perStation: Array<{callSign, primeMinsPerDay, rosMinsPerDay, annualValue}>, total: {primeMinsPerDay, rosMinsPerDay, annualValue}}}
   */
  function calculateBarterMinutes(targetAnnualValue, stations, cpm) {
    cpm = cpm || 2.0;

    if (!stations || !stations.length || !targetAnnualValue || targetAnnualValue <= 0) {
      return {
        perStation: [],
        total: { primeMinsPerDay: 0, rosMinsPerDay: 0, annualValue: 0 }
      };
    }

    // Calculate total AQH
    let totalPrimeAQH = 0;
    let totalRosAQH = 0;
    stations.forEach(s => {
      totalPrimeAQH += (Number(s.primeAQH) || 0);
      totalRosAQH += (Number(s.rosAQH) || 0);
    });

    const totalAQH = totalPrimeAQH + totalRosAQH;
    if (totalAQH <= 0 || cpm <= 0) {
      return {
        perStation: stations.map(s => ({
          callSign: s.callSign || s.stationCallSign || s.station,
          primeMinsPerDay: 0,
          rosMinsPerDay: 0,
          annualValue: 0
        })),
        total: { primeMinsPerDay: 0, rosMinsPerDay: 0, annualValue: 0 }
      };
    }

    // Split target between Prime and ROS proportionally
    const primeShare = totalPrimeAQH > 0 ? (totalPrimeAQH / totalAQH) : 0;
    const rosShare = totalRosAQH > 0 ? (totalRosAQH / totalAQH) : 0;
    const primeTargetAnnual = targetAnnualValue * primeShare;
    const rosTargetAnnual = targetAnnualValue * rosShare;

    // Calculate per-station allocation
    const perStation = [];
    let totalPrimeMins = 0;
    let totalRosMins = 0;
    let totalAllocatedValue = 0;

    stations.forEach(s => {
      const primeAQH = Number(s.primeAQH) || 0;
      const rosAQH = Number(s.rosAQH) || 0;
      const callSign = s.callSign || s.stationCallSign || s.station;

      // Station's share of each daypart's target
      const stationPrimeShare = (totalPrimeAQH > 0 && primeAQH > 0) ? (primeAQH / totalPrimeAQH) : 0;
      const stationRosShare = (totalRosAQH > 0 && rosAQH > 0) ? (rosAQH / totalRosAQH) : 0;

      const stationPrimeTarget = primeTargetAnnual * stationPrimeShare;
      const stationRosTarget = rosTargetAnnual * stationRosShare;

      // Calculate minutes (round up)
      let primeMinsPerDay = 0;
      let rosMinsPerDay = 0;

      if (primeAQH > 0) {
        primeMinsPerDay = Math.ceil(calculateMinutesFromValue(stationPrimeTarget, primeAQH, cpm));
      }
      if (rosAQH > 0) {
        rosMinsPerDay = Math.ceil(calculateMinutesFromValue(stationRosTarget, rosAQH, cpm));
      }

      // Calculate actual value from rounded minutes
      const primeValue = calculateValueFromMinutes(primeMinsPerDay, primeAQH, cpm);
      const rosValue = calculateValueFromMinutes(rosMinsPerDay, rosAQH, cpm);
      const stationValue = primeValue + rosValue;

      totalPrimeMins += primeMinsPerDay;
      totalRosMins += rosMinsPerDay;
      totalAllocatedValue += stationValue;

      perStation.push({
        callSign,
        primeMinsPerDay,
        rosMinsPerDay,
        annualValue: stationValue
      });
    });

    return {
      perStation,
      total: {
        primeMinsPerDay: totalPrimeMins,
        rosMinsPerDay: totalRosMins,
        annualValue: totalAllocatedValue
      }
    };
  }

  // ============================================================================
  // TOOL 7: calculateFAAIPrice
  // ============================================================================

  /**
   * Calculate FAAI (Futuri AI Voice) pricing based on shows and minutes per day.
   * Uses dynamic formula based on character usage, ElevenLabs costs, and margin.
   *
   * Formula:
   * - Monthly Characters = Shows × Minutes/day × 150 words × 5 chars × 30 days
   * - ElevenLabs Cost = Monthly Characters / 1000 × $0.20
   * - LLM Cost = ElevenLabs Cost × 25%
   * - Total Cost = ElevenLabs + LLM
   * - Cash Rate = Total Cost / (1 - margin)
   * - Barter Rate = Cash Rate × 1.4
   *
   * @param {number} shows - Number of shows
   * @param {number} minutesPerDay - Minutes of content per day per show
   * @param {number} [margin=0.90] - Profit margin (default 90%)
   * @returns {object} Pricing breakdown
   */
  function calculateFAAIPrice(shows, minutesPerDay, margin) {
    // Validate inputs
    shows = Number(shows) || 0;
    minutesPerDay = Number(minutesPerDay) || 0;
    margin = margin !== undefined ? Number(margin) : 0.90;

    if (shows <= 0 || minutesPerDay <= 0) {
      return {
        error: "Shows and minutes per day must be positive numbers",
        monthly: 0,
        annual: 0,
        barterMonthly: 0,
        barterAnnual: 0
      };
    }

    // Fixed constants
    const WORDS_PER_MINUTE = 150;
    const CHARS_PER_WORD = 5;
    const DAYS_PER_MONTH = 30;
    const ELEVENLABS_COST_PER_1K_CHARS = 0.20;
    const LLM_COST_MULTIPLIER = 0.25;
    const BARTER_MULTIPLIER = 1.4;

    // Calculate monthly characters
    const monthlyChars = shows * minutesPerDay * WORDS_PER_MINUTE * CHARS_PER_WORD * DAYS_PER_MONTH;

    // Calculate costs
    const elevenLabsCost = (monthlyChars / 1000) * ELEVENLABS_COST_PER_1K_CHARS;
    const llmCost = elevenLabsCost * LLM_COST_MULTIPLIER;
    const totalCost = elevenLabsCost + llmCost;

    // Calculate rates
    const cashRate = totalCost / (1 - margin);
    const barterRate = cashRate * BARTER_MULTIPLIER;

    return {
      shows,
      minutesPerDay,
      margin,
      monthlyCharacters: monthlyChars,
      costs: {
        elevenLabs: Math.round(elevenLabsCost * 100) / 100,
        llm: Math.round(llmCost * 100) / 100,
        total: Math.round(totalCost * 100) / 100
      },
      monthly: Math.round(cashRate * 100) / 100,
      annual: Math.round(cashRate * 12 * 100) / 100,
      barterMonthly: Math.round(barterRate * 100) / 100,
      barterAnnual: Math.round(barterRate * 12 * 100) / 100
    };
  }

  // ============================================================================
  // TOOL 8: buildDeal
  // ============================================================================

  /**
   * Check if a station is off-book (no AQH data)
   */
  function isOffBookStation(station) {
    return station.primeAQH === null || station.primeAQH === undefined;
  }

  /**
   * Build complete deal object matching existing proposal structure
   * @param {object} config - Complete deal configuration
   * @returns {object} Deal object
   */
  function buildDeal(config) {
    const c = config;
    const dealType = c.dealType || 'broadcast';
    let mediaType = c.mediaType || MEDIA_TYPES.RADIO;
    let pricingType = c.pricingType || 'cash';
    const cpm = c.cpm || 2.0;

    // Infer mediaType from dealType if not specified
    if (dealType === 'agency' && !c.mediaType) {
      mediaType = MEDIA_TYPES.AGENCY_OTHER;
    }

    // TV deals are always cash-only
    if (mediaType === MEDIA_TYPES.TV) {
      pricingType = 'cash';
    }

    // Get station details
    const stationDetails = (c.stations || []).map(s => {
      if (typeof s === 'string') {
        // Station key format: "parent|market|station"
        const parts = parseStationKey(s);
        // Look up AQH from data if available
        const data = getNielsenData(c);
        if (data && data.stations) {
          const found = data.stations.find(st =>
            st.parent === parts.parent &&
            st.market === parts.market &&
            st.station === parts.station
          );
          if (found) {
            return { ...found, key: s, inBook: true };
          }
        }
        // Off-book station (not found in Nielsen data)
        return { ...parts, primeAQH: null, rosAQH: null, key: s, inBook: false };
      }
      // Station passed as object - check for inBook flag or AQH presence
      if (s.inBook === false || s.primeAQH === null) {
        return { ...s, inBook: false };
      }
      return { ...s, inBook: true };
    });

    // Check for mixed in-book / off-book stations
    const inBookStations = stationDetails.filter(s => s.inBook !== false && !isOffBookStation(s));
    const offBookStations = stationDetails.filter(s => s.inBook === false || isOffBookStation(s));
    const hasMixedStations = inBookStations.length > 0 && offBookStations.length > 0;

    // Calculate product values
    const productValues = {};
    let totalAnnual = 0;

    // Merge product-specific configs (toplineConfig, etc.) into productConfigs
    // This ensures tier is found regardless of which format Claude uses
    const mergedProductConfigs = {
      ...(c.productConfigs || {}),
      topline: {
        ...(c.productConfigs?.topline || {}),
        ...(c.toplineConfig || {})
      },
      content_automation: {
        ...(c.productConfigs?.content_automation || {}),
        ...(c.contentAutomationConfig || {})
      },
      spoton: {
        ...(c.productConfigs?.spoton || {}),
        ...(c.spotonConfig || {})
      }
    };

    (c.products || []).forEach(productId => {
      const productConfig = mergedProductConfigs[productId] || {};
      const assignments = {
        stations: c.stations || [],
        markets: c.markets || []
      };

      const extras = {
        ...productConfig,
        pricingType,
        dealType,
        customPrice: (c.customPrices || {})[productId]
      };

      // CRITICAL: For TopLine, log if tier is missing (helps debug)
      if (productId === 'topline' && !extras.tier) {
        console.warn('[buildDeal] TopLine tier not specified in config. Defaulting to access. Config received:', JSON.stringify(productConfig));
      }

      const price = calculateProductPrice(productId, assignments, extras);
      productValues[productId] = price;
      totalAnnual += price.annual;
    });

    // Calculate cash and barter components for mixed deals
    let totalCashAnnual = 0;
    let totalBarterTargetAnnual = 0;

    if (pricingType === 'mixed') {
      // Sum up per-product-per-location cash values
      Object.entries(c.productCashValues || {}).forEach(([key, value]) => {
        totalCashAnnual += (value || 0) * 12;  // Cash values are monthly
      });
      totalBarterTargetAnnual = Math.max(0, totalAnnual - totalCashAnnual);
    } else if (pricingType === 'barter') {
      totalBarterTargetAnnual = totalAnnual;
    } else {
      totalCashAnnual = totalAnnual;
    }

    // Calculate barter minutes (only for in-book stations with AQH data)
    let barterAllocation = null;
    const effectiveBarterPricingType = (mediaType === MEDIA_TYPES.TV) ? 'cash' : pricingType;

    if ((effectiveBarterPricingType === 'barter' || effectiveBarterPricingType === 'mixed') && mediaType !== MEDIA_TYPES.TV) {
      // Only include in-book stations with AQH data for barter
      const stationsForBarter = inBookStations.map(s => ({
        callSign: s.station,
        primeAQH: s.primeAQH || 0,
        rosAQH: s.rosAQH || 0
      }));

      barterAllocation = calculateBarterMinutes(totalBarterTargetAnnual, stationsForBarter, cpm);

      // Add off-book stations to allocation with 0 minutes (cash-only)
      if (offBookStations.length > 0) {
        offBookStations.forEach(s => {
          barterAllocation.perStation.push({
            callSign: s.station,
            primeMinsPerDay: 0,
            rosMinsPerDay: 0,
            annualValue: 0,
            isOffBook: true,
            note: 'Off-book station (no AQH) - cash only'
          });
        });
      }

      // Apply manual overrides if provided
      if (c.manualMinutes) {
        barterAllocation.perStation = barterAllocation.perStation.map(s => {
          const manualKey = Object.keys(c.manualMinutes).find(k => k.endsWith(s.callSign));
          if (manualKey && c.manualMinutes[manualKey]) {
            const manual = c.manualMinutes[manualKey];
            const newPrime = manual.prime !== undefined ? manual.prime : s.primeMinsPerDay;
            const newRos = manual.ros !== undefined ? manual.ros : s.rosMinsPerDay;

            // Recalculate value with manual minutes
            const station = stationDetails.find(st => st.station === s.callSign);
            const primeValue = calculateValueFromMinutes(newPrime, station?.primeAQH || 0, cpm);
            const rosValue = calculateValueFromMinutes(newRos, station?.rosAQH || 0, cpm);

            return {
              ...s,
              primeMinsPerDay: newPrime,
              rosMinsPerDay: newRos,
              annualValue: primeValue + rosValue,
              isManualOverride: true
            };
          }
          return s;
        });

        // Recalculate totals
        barterAllocation.total = barterAllocation.perStation.reduce((acc, s) => ({
          primeMinsPerDay: acc.primeMinsPerDay + s.primeMinsPerDay,
          rosMinsPerDay: acc.rosMinsPerDay + s.rosMinsPerDay,
          annualValue: acc.annualValue + s.annualValue
        }), { primeMinsPerDay: 0, rosMinsPerDay: 0, annualValue: 0 });
      }
    }

    // Build deal object
    const deal = {
      // Customer/Selection
      dealType,
      mediaType,
      parent: c.parent || null,
      customerName: c.customerName || null,
      customerLocation: c.customerLocation || null,
      markets: c.markets || [],
      stations: c.stations || [],
      stationDetails,  // Include full station details with inBook flags

      // Pricing
      pricingType,
      products: c.products || [],
      productValues,
      customPrices: c.customPrices || {},
      productCashValues: c.productCashValues || {},
      productAssignments: c.productAssignments || {},
      cpm,

      // Off-book tracking
      hasOffBookStations: offBookStations.length > 0,
      hasMixedStations,
      inBookStationCount: inBookStations.length,
      offBookStationCount: offBookStations.length,

      // Product configs (merged from multiple sources)
      toplineConfig: mergedProductConfigs.topline || null,
      contentAutomationConfig: mergedProductConfigs.content_automation || null,
      spotonConfig: mergedProductConfigs.spoton || null,
      fbGroupsConfig: c.fbGroupsConfig || null,
      faaiConfig: c.faaiConfig || null,
      productConfigs: mergedProductConfigs,  // Include full merged configs

      // Calculated values
      totalAnnual,
      totalMonthly: totalAnnual / 12,
      cashAnnual: totalCashAnnual,
      cashMonthly: totalCashAnnual / 12,
      barterTargetAnnual: totalBarterTargetAnnual,
      barterTargetMonthly: totalBarterTargetAnnual / 12,
      barterAllocation,

      // Deal terms
      dealMeta: c.dealMeta || {
        termMonths: 36,
        autoRenewEnabled: false,
        autoRenewMonths: 12
      },
      notes: c.notes || '',

      // Metadata
      nielsenBookId: c.nielsenBookId || null,
      createdAt: new Date().toISOString()
    };

    return deal;
  }

  // ============================================================================
  // TOOL 8: validateDeal
  // ============================================================================

  /**
   * Validate deal and return issues
   * @param {object} deal - Deal object from buildDeal
   * @returns {Array<{severity: 'info'|'warning'|'error', message: string}>}
   */
  function validateDeal(deal) {
    const issues = [];

    if (!deal) {
      return [{ severity: 'error', message: 'Deal object is null or undefined' }];
    }

    // Check required fields
    if (deal.dealType === 'broadcast') {
      if (!deal.parent) {
        issues.push({ severity: 'error', message: 'Parent company is required for broadcast deals' });
      }
      if (!deal.stations || deal.stations.length === 0) {
        issues.push({ severity: 'error', message: 'At least one station is required for broadcast deals' });
      }
    } else if (deal.dealType === 'agency') {
      if (!deal.customerName) {
        issues.push({ severity: 'error', message: 'Customer name is required for agency deals' });
      }
    }

    if (!deal.products || deal.products.length === 0) {
      issues.push({ severity: 'error', message: 'At least one product is required' });
    }

    // TV deal validations
    if (deal.mediaType === MEDIA_TYPES.TV) {
      if (deal.pricingType !== 'cash') {
        issues.push({
          severity: 'warning',
          message: 'TV deals should be cash-only. Barter pricing will be ignored.'
        });
      }
      issues.push({
        severity: 'info',
        message: 'TV deal - no barter allocation (cash only)'
      });
    }

    // Off-book station validations
    if (deal.hasOffBookStations) {
      issues.push({
        severity: 'info',
        message: `${deal.offBookStationCount} off-book station(s) detected - no AQH data available`
      });

      if ((deal.pricingType === 'barter' || deal.pricingType === 'mixed') && deal.offBookStationCount > 0) {
        issues.push({
          severity: 'warning',
          message: 'Off-book stations cannot receive barter allocation (no AQH). They will be cash-only.'
        });
      }
    }

    // Mixed in-book/off-book validation
    if (deal.hasMixedStations) {
      issues.push({
        severity: 'info',
        message: `Mixed deal: ${deal.inBookStationCount} in-book stations (can receive barter), ${deal.offBookStationCount} off-book (cash only)`
      });
    }

    // Check for missing product assignments
    if (deal.dealType === 'broadcast' && deal.productAssignments) {
      deal.products.forEach(productId => {
        const assignments = deal.productAssignments[productId];
        if (assignments && assignments.length === 0) {
          issues.push({
            severity: 'warning',
            message: `Product "${productId}" has no station/market assignments`
          });
        }
      });
    }

    // Check gap to value for barter/mixed deals
    if (deal.pricingType === 'barter' || deal.pricingType === 'mixed') {
      if (deal.barterAllocation && deal.barterTargetAnnual > 0) {
        const allocatedValue = deal.barterAllocation.total?.annualValue || 0;
        const gap = deal.barterTargetAnnual - allocatedValue;
        const gapPercent = Math.abs(gap) / deal.barterTargetAnnual;

        if (gap > 0 && gapPercent > 0.10) {
          issues.push({
            severity: 'warning',
            message: `Gap to value: Barter allocation is ${Math.round(gapPercent * 100)}% short of target ($${Math.round(gap).toLocaleString()} annual shortfall)`
          });
        }

        // Check for over-allocation (> 110%)
        if (allocatedValue > deal.barterTargetAnnual * 1.10) {
          const overPercent = (allocatedValue / deal.barterTargetAnnual - 1) * 100;
          issues.push({
            severity: 'warning',
            message: `Barter over-allocated by ${Math.round(overPercent)}% (${Math.round(allocatedValue - deal.barterTargetAnnual).toLocaleString()} annual surplus)`
          });
        }
      }

      // Check for stations with zero AQH
      if (deal.barterAllocation && deal.barterAllocation.perStation) {
        const zeroAQH = deal.barterAllocation.perStation.filter(s =>
          s.primeMinsPerDay === 0 && s.rosMinsPerDay === 0
        );
        if (zeroAQH.length > 0) {
          issues.push({
            severity: 'info',
            message: `${zeroAQH.length} station(s) have zero AQH and cannot receive barter allocation`
          });
        }
      }
    }

    // Check for cash-only products in barter deal
    if (deal.pricingType === 'barter') {
      const cashOnlySelected = deal.products.filter(p => CASH_ONLY_PRODUCTS.includes(p));
      if (cashOnlySelected.length > 0) {
        issues.push({
          severity: 'warning',
          message: `Cash-only product(s) selected in barter deal: ${cashOnlySelected.join(', ')}`
        });
      }
    }

    // Check margin for FAAI
    if (deal.faaiConfig && deal.faaiConfig.margin < 50) {
      issues.push({
        severity: 'warning',
        message: `FAAI margin is ${deal.faaiConfig.margin}% - typically should be 50% or higher`
      });
    }

    // Info: deal summary
    issues.push({
      severity: 'info',
      message: `Deal summary: ${deal.products.length} products, $${Math.round(deal.totalAnnual).toLocaleString()}/year, ${deal.pricingType} payment`
    });

    return issues;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // Data loading
    loadNielsenBook,
    loadRateCard,

    // Tools
    lookupParent,
    lookupMarkets,
    lookupStations,
    getProductCatalog,
    calculateProductPrice,
    calculateBarterMinutes,
    calculateFAAIPrice,
    buildDeal,
    validateDeal,

    // Helpers (exposed for testing)
    calculateValueFromMinutes,
    calculateMinutesFromValue,
    createOffBookStation,
    isOffBookStation,

    // Constants (exposed for reference)
    BARTER_FORMULA,
    BARTER_MULTIPLIER,
    TOPLINE_PRICING,
    CONTENT_AUTOMATION_PRICING,
    SPOTON_PRICING,
    DEFAULT_PRODUCTS,
    MEDIA_TYPES
  };

}));
