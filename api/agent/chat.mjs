/**
 * Futuri Deal Calculator - Agent Chat Endpoint
 *
 * POST /api/agent/chat
 *
 * Accepts natural language deal descriptions and uses Claude with tool use
 * to build complete deal configurations.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "./system-prompt.mjs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require function for loading CommonJS modules
const require = createRequire(import.meta.url);

// Rate limiting store (in-memory, resets on cold start)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;

// Claude pricing (per million tokens) - as of 2024
const CLAUDE_PRICING = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 }
};

// Default model
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

// Cached data (loaded once per cold start)
let cachedNielsenData = null;
let cachedRateCard = null;
let cachedDealTools = null;

/**
 * Load Nielsen data from file
 */
function loadNielsenData() {
  if (cachedNielsenData) return cachedNielsenData;

  try {
    const dataPath = join(__dirname, "../../radio_data_fall2025.json");
    cachedNielsenData = JSON.parse(readFileSync(dataPath, "utf8"));
    return cachedNielsenData;
  } catch (error) {
    console.error("Failed to load Nielsen data:", error.message);
    return null;
  }
}

/**
 * Load rate card from file
 */
function loadRateCard() {
  if (cachedRateCard) return cachedRateCard;

  try {
    const dataPath = join(__dirname, "../../radio_rate_card.json");
    cachedRateCard = JSON.parse(readFileSync(dataPath, "utf8"));
    return cachedRateCard;
  } catch (error) {
    console.error("Failed to load rate card:", error.message);
    return null;
  }
}

/**
 * Load DealTools module
 */
function loadDealTools() {
  if (cachedDealTools) return cachedDealTools;

  try {
    // Use require for CommonJS module (deal-tools.js uses UMD)
    const toolsPath = join(__dirname, "../../tools/deal-tools.js");
    cachedDealTools = require(toolsPath);
    return cachedDealTools;
  } catch (error) {
    console.error("Failed to load DealTools:", error.message);
    throw error;
  }
}

/**
 * Check rate limit for IP
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Clean old entries
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.windowStart < windowStart) {
      rateLimitStore.delete(key);
    }
  }

  // Check/update for this IP
  const current = rateLimitStore.get(ip) || { count: 0, windowStart: now };

  if (current.windowStart < windowStart) {
    // Reset window
    current.count = 1;
    current.windowStart = now;
  } else {
    current.count++;
  }

  rateLimitStore.set(ip, current);

  return {
    allowed: current.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.count),
    resetAt: current.windowStart + RATE_LIMIT_WINDOW_MS
  };
}

/**
 * Execute a tool call
 */
async function executeTool(toolName, toolInput, DealTools, nielsenData, rateCard) {
  const options = { data: nielsenData, rateCard };

  try {
    switch (toolName) {
      case "lookup_parent": {
        const result = DealTools.lookupParent(toolInput.query, options);
        return { success: true, result };
      }

      case "lookup_markets": {
        const result = DealTools.lookupMarkets(
          toolInput.parent_id || null,
          toolInput.query || null,
          options
        );
        return { success: true, result };
      }

      case "lookup_stations": {
        const stationOptions = {
          ...options,
          allowCreate: toolInput.allow_create || false
        };
        const result = DealTools.lookupStations(
          toolInput.parent_id || null,
          toolInput.market_name || null,
          toolInput.query || null,
          stationOptions
        );
        return { success: true, result };
      }

      case "get_product_catalog": {
        const result = DealTools.getProductCatalog(options);
        return { success: true, result };
      }

      case "calculate_product_price": {
        const assignments = toolInput.assignments || {};
        const extras = {
          ...(toolInput.extras || {}),
          rateCard
        };
        const result = DealTools.calculateProductPrice(
          toolInput.product_id,
          assignments,
          extras
        );
        return { success: true, result };
      }

      case "calculate_barter_minutes": {
        const result = DealTools.calculateBarterMinutes(
          toolInput.target_annual_value,
          toolInput.stations,
          toolInput.cpm || 2.0
        );
        return { success: true, result };
      }

      case "build_deal": {
        const config = {
          ...(toolInput.config || {}),
          data: nielsenData,
          rateCard
        };
        const result = DealTools.buildDeal(config);
        return { success: true, result };
      }

      case "validate_deal": {
        const result = DealTools.validateDeal(toolInput.deal);
        return { success: true, result };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Calculate estimated cost
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING[DEFAULT_MODEL];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return {
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: (inputCost + outputCost).toFixed(6)
  };
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get client IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";

  // Check rate limit
  const rateLimit = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimit.resetAt / 1000));

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    });
  }

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server configuration error: ANTHROPIC_API_KEY not set"
    });
  }

  // Parse request body
  const { messages, context } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Invalid request: messages array is required"
    });
  }

  // Load data and tools
  let nielsenData, rateCard, DealTools;
  try {
    nielsenData = loadNielsenData();
    rateCard = loadRateCard();
    DealTools = loadDealTools();

    if (!nielsenData) {
      return res.status(500).json({ error: "Failed to load Nielsen data" });
    }
    if (!rateCard) {
      return res.status(500).json({ error: "Failed to load rate card" });
    }
  } catch (error) {
    return res.status(500).json({ error: `Failed to load data: ${error.message}` });
  }

  // Initialize Anthropic client
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS) || MAX_TOKENS;

  // Build system prompt with context
  let systemPrompt = SYSTEM_PROMPT;
  if (context) {
    systemPrompt += `\n\n## Current Context\n`;
    if (context.mediaType) systemPrompt += `- Media Type: ${context.mediaType}\n`;
    if (context.nielsenBook) systemPrompt += `- Nielsen Book: ${context.nielsenBook}\n`;
    if (context.cpm) systemPrompt += `- Default CPM: $${context.cpm}\n`;
  }

  // Tracking
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolCalls = [];

  try {
    // Initial Claude call with prompt caching for system prompt
    // Uses cache_control to cache the system prompt across requests
    let response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }
        }
      ],
      tools: TOOL_DEFINITIONS,
      messages
    });

    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    // Agentic loop - keep processing until no more tool calls
    const conversationHistory = [...messages];
    let iterations = 0;
    const maxIterations = 20; // Safety limit

    while (response.stop_reason === "tool_use" && iterations < maxIterations) {
      iterations++;

      // Extract tool calls from response
      const toolUseBlocks = response.content.filter(block => block.type === "tool_use");

      // Execute each tool call
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const { id, name, input } = toolUse;

        console.log(`[Tool Call] ${name}:`, JSON.stringify(input).slice(0, 200));
        toolCalls.push({ name, input });

        const result = await executeTool(name, input, DealTools, nielsenData, rateCard);

        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: JSON.stringify(result)
        });
      }

      // Add assistant response and tool results to history
      conversationHistory.push({
        role: "assistant",
        content: response.content
      });
      conversationHistory.push({
        role: "user",
        content: toolResults
      });

      // Continue conversation with tool results (use cached system prompt)
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ],
        tools: TOOL_DEFINITIONS,
        messages: conversationHistory
      });

      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
    }

    // Calculate cost
    const cost = calculateCost(model, totalInputTokens, totalOutputTokens);
    const duration = Date.now() - startTime;

    // Log for observability
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolCalls: toolCalls.map(t => t.name),
      toolCallCount: toolCalls.length,
      cost: cost.totalCost,
      durationMs: duration,
      ip: ip.slice(0, 10) + "..." // Partial IP for privacy
    }));

    // Extract final response content
    const finalContent = response.content.map(block => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      return block;
    });

    // Return response
    return res.status(200).json({
      success: true,
      content: finalContent,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCost: cost.totalCost
      },
      toolCalls: toolCalls.map(t => t.name),
      durationMs: duration
    });

  } catch (error) {
    console.error("Claude API error:", error);

    // Handle specific error types
    if (error.status === 401) {
      return res.status(500).json({ error: "Invalid API key" });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: "Claude API rate limit exceeded" });
    }
    if (error.status === 529) {
      return res.status(503).json({ error: "Claude API overloaded, please retry" });
    }

    return res.status(500).json({
      error: "Failed to process request",
      details: error.message
    });
  }
}
