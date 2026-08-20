/**
 * Grid Entry Module for Futuri Deal Calculator
 *
 * Provides an Excel-style grid entry surface as an alternative to the
 * structured flow. Both paths assemble the SAME config and call the SAME
 * buildDeal() from deal-tools.js.
 *
 * This module is ADDITIVE ONLY - it does not modify any shared functions.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GridEntry = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  // Grid rows - each row represents a station entry
  let gridRows = [];
  let nextRowId = 1;

  // Cached Nielsen data reference
  let _nielsenData = null;

  // Reference to DealTools module (set via init)
  let DealTools = null;

  // Product catalog cache
  let productCatalog = [];

  // Global config inherited from structured flow
  let globalConfig = {
    pricingType: 'barter',
    cpm: 1.5,
    dealType: 'broadcast'
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize grid entry module
   * @param {object} options - { dealTools, nielsenData, products }
   */
  function init(options) {
    DealTools = options.dealTools;
    _nielsenData = options.nielsenData;
    productCatalog = options.products || [];
    gridRows = [];
    nextRowId = 1;
  }

  /**
   * Set global config (pricing type, CPM, deal type)
   */
  function setGlobalConfig(config) {
    if (config.pricingType) globalConfig.pricingType = config.pricingType;
    if (config.cpm !== undefined) globalConfig.cpm = config.cpm;
    if (config.dealType) globalConfig.dealType = config.dealType;
  }

  /**
   * Get global config
   */
  function getGlobalConfig() {
    return { ...globalConfig };
  }

  // ============================================================================
  // STATION RESOLUTION
  // ============================================================================

  /**
   * Resolve a call sign to station data
   * @param {string} callSign - Station call sign to look up
   * @returns {object} { matches: Array, needsDisambiguation: boolean, notFound: boolean }
   */
  function resolveCallSign(callSign) {
    if (!callSign || !callSign.trim()) {
      return { matches: [], needsDisambiguation: false, notFound: true };
    }

    const query = callSign.trim().toUpperCase();

    // Use DealTools lookupStations with no parent/market filter to find all matches
    const result = DealTools.lookupStations(null, null, query, { data: _nielsenData });

    // Filter to exact matches only (case-insensitive)
    const exactMatches = result.results.filter(s =>
      s.stationCallSign.toUpperCase() === query
    );

    if (exactMatches.length === 0) {
      // Not found - will create off-book station
      return { matches: [], needsDisambiguation: false, notFound: true, callSign: query };
    }

    if (exactMatches.length === 1) {
      // Single match - no disambiguation needed
      return {
        matches: exactMatches,
        needsDisambiguation: false,
        notFound: false,
        resolved: exactMatches[0]
      };
    }

    // Multiple matches (same call sign in different markets) - need disambiguation
    return {
      matches: exactMatches,
      needsDisambiguation: true,
      notFound: false
    };
  }

  /**
   * Parse pasted text into call signs
   * @param {string} text - Pasted text (one call sign per line)
   * @returns {string[]} Array of call signs
   */
  function parseClipboardText(text) {
    if (!text) return [];

    return text
      .split(/[\r\n]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Take first word/token if line has multiple columns
        const parts = line.split(/[\t,;]+/);
        return parts[0].trim().toUpperCase();
      })
      .filter(cs => cs.length > 0);
  }

  // ============================================================================
  // ROW MANAGEMENT
  // ============================================================================

  /**
   * Create a new grid row
   * @param {object} stationData - Resolved station data (or partial for off-book)
   * @returns {object} Row object
   */
  function createRow(stationData) {
    const isOffBook = stationData.notFound || stationData.primeAQH === null;

    const row = {
      id: nextRowId++,
      // Station info
      callSign: stationData.stationCallSign || stationData.callSign || '',
      parent: stationData.parent || 'Unknown',
      market: stationData.market || 'Unknown',
      format: stationData.format || '',
      primeAQH: isOffBook ? null : (stationData.primeAQH || 0),
      rosAQH: isOffBook ? null : (stationData.rosAQH || 0),
      inBook: !isOffBook,

      // Key for dedup and buildDeal
      key: `${stationData.parent || 'Unknown'}|${stationData.market || 'Unknown'}|${stationData.stationCallSign || stationData.callSign || ''}`,

      // Product assignment (per-row)
      product: null, // productId
      productConfig: null, // config for special products (topline, faai, etc.)

      // Minutes input
      primeMinutes: 0,
      rosMinutes: 0,

      // Computed
      annualValue: 0,

      // Status flags
      isOffBook: isOffBook,
      needsConfig: false, // true if product requires config
      isValid: true,
      validationError: null
    };

    return row;
  }

  /**
   * Add a row from resolved station data
   * Returns the row if added, null if duplicate
   */
  function addRow(stationData) {
    const row = createRow(stationData);

    // Check for duplicate by full key
    const isDuplicate = gridRows.some(r => r.key === row.key);
    if (isDuplicate) {
      return { row: null, duplicate: true, key: row.key };
    }

    gridRows.push(row);
    return { row, duplicate: false };
  }

  /**
   * Add multiple rows from call signs (handles paste)
   * @param {string[]} callSigns - Array of call signs
   * @returns {object} { added: Row[], duplicates: string[], needsDisambiguation: Array, notFound: string[] }
   */
  function addRowsFromCallSigns(callSigns) {
    const result = {
      added: [],
      duplicates: [],
      needsDisambiguation: [],
      notFound: []
    };

    for (const cs of callSigns) {
      const resolved = resolveCallSign(cs);

      if (resolved.needsDisambiguation) {
        result.needsDisambiguation.push({
          callSign: cs,
          options: resolved.matches
        });
        continue;
      }

      if (resolved.notFound) {
        // Create off-book station
        const offBookStation = DealTools.createOffBookStation({
          callSign: cs,
          parent: 'Unknown',
          market: 'Unknown'
        });
        const addResult = addRow(offBookStation);
        if (addResult.duplicate) {
          result.duplicates.push(cs);
        } else {
          result.notFound.push(cs);
          result.added.push(addResult.row);
        }
        continue;
      }

      // Single match - add directly
      const addResult = addRow(resolved.resolved);
      if (addResult.duplicate) {
        result.duplicates.push(cs);
      } else {
        result.added.push(addResult.row);
      }
    }

    return result;
  }

  /**
   * Add a disambiguated row (after user picks market)
   */
  function addDisambiguatedRow(stationData) {
    return addRow(stationData);
  }

  /**
   * Remove a row by ID
   */
  function removeRow(rowId) {
    const idx = gridRows.findIndex(r => r.id === rowId);
    if (idx >= 0) {
      gridRows.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rows
   */
  function getRows() {
    return [...gridRows];
  }

  /**
   * Clear all rows
   */
  function clearRows() {
    gridRows = [];
  }

  // ============================================================================
  // ROW UPDATES
  // ============================================================================

  /**
   * Update row product
   */
  function setRowProduct(rowId, productId) {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return null;

    row.product = productId;

    // Check if product needs config
    const product = productCatalog.find(p => p.productId === productId || p.id === productId);
    const needsConfig = product && ['tiered', 'calculated', 'credit_based', 'per_unit'].includes(product.pricingType);
    row.needsConfig = needsConfig;
    row.isValid = !needsConfig; // Invalid until config is provided

    if (!needsConfig) {
      row.productConfig = null;
    }

    recalculateRowValue(row);
    return row;
  }

  /**
   * Update row product config (for special products)
   */
  function setRowProductConfig(rowId, config) {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return null;

    row.productConfig = config;
    row.isValid = true;
    row.needsConfig = false;

    recalculateRowValue(row);
    return row;
  }

  /**
   * Update row minutes
   */
  function setRowMinutes(rowId, primeMinutes, rosMinutes) {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return null;

    row.primeMinutes = Math.max(0, parseInt(primeMinutes) || 0);
    row.rosMinutes = Math.max(0, parseInt(rosMinutes) || 0);

    recalculateRowValue(row);
    return row;
  }

  /**
   * Recalculate annual value for a row
   */
  function recalculateRowValue(row) {
    if (!row.inBook || row.isOffBook) {
      // Off-book stations: can't compute barter value
      row.annualValue = 0;
      return;
    }

    // Use DealTools.calculateValueFromMinutes
    const primeValue = DealTools.calculateValueFromMinutes(
      row.primeMinutes,
      row.primeAQH,
      globalConfig.cpm
    );
    const rosValue = DealTools.calculateValueFromMinutes(
      row.rosMinutes,
      row.rosAQH,
      globalConfig.cpm
    );

    row.annualValue = primeValue + rosValue;
  }

  /**
   * Recalculate all row values (e.g., after CPM change)
   */
  function recalculateAllValues() {
    gridRows.forEach(row => recalculateRowValue(row));
  }

  // ============================================================================
  // BUILD CONFIG FOR buildDeal()
  // ============================================================================

  /**
   * Build config object compatible with DealTools.buildDeal()
   * @param {object} extraConfig - Additional config (parent, customerName, etc.)
   */
  function buildConfig(extraConfig = {}) {
    // Collect unique markets
    const marketsSet = new Set();
    gridRows.forEach(r => {
      if (r.market && r.market !== 'Unknown') {
        marketsSet.add(r.market);
      }
    });

    // Collect station keys
    const stations = gridRows.map(r => r.key);

    // Collect products - handle market-level products correctly
    const productsSet = new Set();
    const productConfigs = {};
    const manualMinutes = {};

    gridRows.forEach(r => {
      if (r.product) {
        productsSet.add(r.product);

        // Store product config if exists
        if (r.productConfig) {
          // Merge configs for same product
          productConfigs[r.product] = {
            ...(productConfigs[r.product] || {}),
            ...r.productConfig
          };
        }
      }

      // Store manual minutes if set
      if ((r.primeMinutes > 0 || r.rosMinutes > 0) && r.inBook) {
        manualMinutes[r.key] = {
          prime: r.primeMinutes,
          ros: r.rosMinutes
        };
      }
    });

    // Build the config object
    const config = {
      dealType: globalConfig.dealType,
      pricingType: globalConfig.pricingType,
      cpm: globalConfig.cpm,

      // Station selection
      stations: stations,
      markets: Array.from(marketsSet),

      // Products
      products: Array.from(productsSet),
      productConfigs: productConfigs,

      // Manual minutes for barter allocation
      manualMinutes: Object.keys(manualMinutes).length > 0 ? manualMinutes : undefined,

      // Pass Nielsen data reference
      data: _nielsenData,

      // Merge any extra config
      ...extraConfig
    };

    // Handle TopLine specifically - count unique markets
    if (productsSet.has('topline')) {
      const toplineConfig = productConfigs.topline || {};
      // If numberOfMarkets not explicitly set, derive from selected markets
      if (!toplineConfig.numberOfMarkets) {
        toplineConfig.numberOfMarkets = marketsSet.size || 1;
      }
      // Default tier if not set
      if (!toplineConfig.tier) {
        toplineConfig.tier = 'access';
      }
      config.toplineConfig = toplineConfig;
    }

    // Handle SpotOn - also market-level
    if (productsSet.has('spoton')) {
      config.spotonConfig = productConfigs.spoton || { creditsPerMonth: 0 };
    }

    // Handle Content Automation
    if (productsSet.has('content_automation')) {
      config.contentAutomationConfig = productConfigs.content_automation || { tier: 'tier1' };
    }

    // Handle FAAI
    if (productsSet.has('faai')) {
      config.faaiConfig = productConfigs.faai || { numberOfShows: 1, minutesPerDay: 1, margin: 90 };
    }

    // Handle FB Groups
    if (productsSet.has('topicpulse_community_radar_fb')) {
      config.fbGroupsConfig = productConfigs.topicpulse_community_radar_fb || { groupCount: 0 };
    }

    return config;
  }

  /**
   * Build deal using DealTools.buildDeal()
   */
  function buildDeal(extraConfig = {}) {
    const config = buildConfig(extraConfig);
    return DealTools.buildDeal(config);
  }

  /**
   * Validate deal using DealTools.validateDeal()
   */
  function validateDeal(extraConfig = {}) {
    const deal = buildDeal(extraConfig);
    return {
      deal,
      issues: DealTools.validateDeal(deal)
    };
  }

  // ============================================================================
  // MARKET-LEVEL PRODUCT HANDLING
  // ============================================================================

  /**
   * Get unique markets from current rows
   */
  function getUniqueMarkets() {
    const markets = new Set();
    gridRows.forEach(r => {
      if (r.market && r.market !== 'Unknown') {
        markets.add(r.market);
      }
    });
    return Array.from(markets).sort();
  }

  /**
   * Check if a product is market-level (TopLine, SpotOn)
   */
  function isMarketLevelProduct(productId) {
    return DealTools.isMarketLevelProduct(productId);
  }

  /**
   * Get total station count
   */
  function getStationCount() {
    return gridRows.length;
  }

  /**
   * Get total annual value from all rows
   */
  function getTotalAnnualValue() {
    return gridRows.reduce((sum, r) => sum + (r.annualValue || 0), 0);
  }

  // ============================================================================
  // DEDUP CHECK
  // ============================================================================

  /**
   * Check if a station key already exists
   */
  function isDuplicate(parent, market, callSign) {
    const key = `${parent}|${market}|${callSign}`;
    return gridRows.some(r => r.key === key);
  }

  /**
   * Get duplicate keys from a list of station keys
   */
  function findDuplicates(stationKeys) {
    const existing = new Set(gridRows.map(r => r.key));
    return stationKeys.filter(k => existing.has(k));
  }

  // ============================================================================
  // EXPORT
  // ============================================================================

  return {
    // Initialization
    init,
    setGlobalConfig,
    getGlobalConfig,

    // Station resolution
    resolveCallSign,
    parseClipboardText,

    // Row management
    addRow,
    addRowsFromCallSigns,
    addDisambiguatedRow,
    removeRow,
    getRows,
    clearRows,

    // Row updates
    setRowProduct,
    setRowProductConfig,
    setRowMinutes,
    recalculateAllValues,

    // Deal building (calls DealTools.buildDeal)
    buildConfig,
    buildDeal,
    validateDeal,

    // Helpers
    getUniqueMarkets,
    isMarketLevelProduct,
    getStationCount,
    getTotalAnnualValue,
    isDuplicate,
    findDuplicates
  };
}));
