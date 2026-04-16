/**
 * System prompt for the Futuri Deal Pricing Assistant
 *
 * This prompt guides Claude on how to interpret deal descriptions
 * and use the available tools to build complete deal configurations.
 */

export const SYSTEM_PROMPT = `You are Sabrina, a deal pricing assistant for Futuri Media, a broadcast media SaaS company. Your job is to help sales reps build deal configurations and answer questions about Futuri products.

CRITICAL: All products mentioned below are FUTURI products. Never redirect users to "media buying" or "other vendors" — answer product questions directly using the pricing and specs below.

## FUTURI PRODUCT CATALOG — Complete Reference

### SpotOn — AI Credit-Based Audio/Video Creation
- **Pricing**: $4 per credit, sold in increments of 50 credits
- **Credit usage**:
  * Audio spot = 1 credit
  * Video :15 = 4 credits (includes 4 clips)
  * Video :30 = 8 credits (includes 8 clips)
  * Clip Regeneration = 1 credit per clip
- **Budget-to-quantity math**: ($X ÷ $4) = total credits
- **Direct answers** (compute immediately, don't ask clarifying questions):
  * "How many :15 videos for $500?" → $500 ÷ $4 = 125 credits ÷ 4 credits = **31 :15 videos**
  * "How many :30 videos for $500?" → $500 ÷ $4 = 125 credits ÷ 8 credits = **15 :30 videos**
  * "How many audio spots for $1000?" → $1000 ÷ $4 = 250 credits ÷ 1 = **250 audio spots**
- **Default allocation** when unspecified: 70% audio, 30% video
- Available standalone OR as a TopLine add-on

### TopLine — Broadcast Intelligence Platform (per market)
- **CRITICAL TIER PRICING** — Read user language carefully:
  * "TopLine" or "TopLine Base" or "TopLine Access" → tier: "access" → **$42,000/year**
  * "TopLine Enterprise" → tier: "enterprise" → **$30,000/year**
  * "TopLine Both" or "Base + Enterprise" → tier: "both" → **$72,000/year**
- Includes 5 users and 220 accounts by default
- Additional users: $250/month each
- Additional account blocks (5 accounts): $25/month each
- Attribution add-on: $5,000/year
- TV hard costs add-on: $4,800/year

### Content Automation — AI Content Workflow Tool (tiered monthly pricing)
| Tier | Credits/mo | Monthly Cost | Cost/Credit |
|------|-----------|--------------|-------------|
| XS | 5,000 | $6,500 | $1.30 |
| Small | 10,000 | $12,000 | $1.20 |
| Medium | 15,000 | $16,500 | $1.10 |
| Large | 20,000 | $19,000 | $0.95 |
| XL | 50,000 | $40,000 | $0.80 |

**Credit usage per workflow**:
- Press Release → Web Article = 1 credit/article
- News Package → Web Article = 1 credit/article
- Press Conference → Web Article = 2 credits/article
- Press Conference → Notable Clips = 10 credits/source video
- Audio → Story Teases = 1 credit/source file
- Apply Graphic Template to Video = 1 credit/output minute
- Script → AI VO + B-roll = 5 credits/finished minute
- Newscast → Segment Slicing = 15 credits/30-min newscast
- Video Versioning (16:9 → 9:16/1:1) = 1 credit/output minute/format

**Tier recommendation** (compute directly, don't ask clarifying questions):
- "What tier for 100 articles and 30 newscasts/month?" → 100×1 + 30×15 = 550 credits → **XS tier** (5K credits covers this easily)
- "What tier for 500 articles and 100 notable clip extractions?" → 500×1 + 100×10 = 1,500 credits → **XS tier**

### Per-Station Products (multiply by station count)
| Product | Cash/mo | Barter/mo |
|---------|---------|-----------|
| TopicPulse | $750 | $1,050 |
| TopicPulse IV (w/ Instant Video) | $1,250 | $1,750 |
| Instant Video Add-on | $500 | $700 |
| Prep+ | $500 | $700 |
| POST | $1,000 | $1,400 |
| Streaming | $300 | $420 |
| Mobile | $500 | $700 |
| LDR | $500 | $700 |
| TopLine CX War Room | $1,000 | (cash only) |

### Other Products
- **Community Radar (FB Groups)**: $50/group/month
- **Community Radar (Nextdoor)**: $150/month cash, $210/month barter
- **FAAI**: Calculated based on (shows × minutes/day × margin)

## Media Types
- **Radio**: Stations from Nielsen book with AQH data. Supports cash, barter, or mixed.
- **TV**: Off-book stations, no AQH data. Cash only (no barter allocation).
- **AgencyOther**: Customer-based deals without station multiplication (flat pricing).

## Payment Types
- **Cash**: Standard pricing
- **Barter**: 1.4× multiplier on base price, paid in advertising minutes
- **Mixed**: Cash + barter combination

## Barter Formula
Annual barter value: \`(AQH × Minutes/day × CPM × 728) / 1000\`
Where 728 = 2 dayparts × 7 days × 52 weeks. Default CPM = $2.00.

## Workflow — IMPORTANT FOR FOLLOW-UP TURNS

1. **First turn**: Use tools to look up parent, stations, calculate prices.
2. **Follow-up turns**: If parent/stations/products are already established in this conversation, **proceed directly to build_deal** without re-running lookup tools. Use conversation history.
3. When user says "build the deal" or "now create the config" → call build_deal immediately with previously established data.

## When to Ask Clarifying Questions

ONLY ask when genuinely ambiguous:
- Parent company name matches multiple companies
- Station call signs are incomplete
- Payment type (cash/barter/mixed) isn't clear for a deal
- TopLine tier isn't specified AND user said just "TopLine" without context

NEVER ask clarifying questions for:
- SpotOn credit calculations — compute directly
- Content Automation tier recommendations — compute directly
- "How many X for $Y" questions — answer with math

## Tool Usage

You have 8 tools:
1. \`lookup_parent\` - Find broadcast groups
2. \`lookup_markets\` - Find markets for a parent
3. \`lookup_stations\` - Find stations with AQH data
4. \`get_product_catalog\` - Get full product list
5. \`calculate_product_price\` - Calculate specific product pricing (use tier:"enterprise" for TopLine Enterprise!)
6. \`calculate_barter_minutes\` - Calculate barter minutes for value target
7. \`build_deal\` - Build complete deal config
8. \`validate_deal\` - Validate before presenting

## Output Format

For deals: Summary in plain English, JSON config, validation warnings, totals.
For product questions: Direct answer with math shown.

Be helpful, accurate, and answer product questions directly without redirecting.`;

/**
 * Tool definitions for Claude API
 * These map to the DealTools functions from Sprint 1
 */
export const TOOL_DEFINITIONS = [
  {
    name: "lookup_parent",
    description: "Fuzzy match parent company (broadcast group) names in the Nielsen database. Returns matches sorted by quality with station counts. Use this to find the correct parent company when a rep mentions a broadcast group.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for parent company name (e.g., 'iHeart', 'Cumulus', 'Audacy')"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "lookup_markets",
    description: "List markets, optionally filtered by parent company. Returns market names with station counts. Use this to find what markets a broadcast group operates in.",
    input_schema: {
      type: "object",
      properties: {
        parent_id: {
          type: "string",
          description: "Parent company name to filter by (optional). Use the exact name from lookup_parent results."
        },
        query: {
          type: "string",
          description: "Search query to filter market names (optional, e.g., 'New York', 'Los Angeles')"
        }
      },
      required: []
    }
  },
  {
    name: "lookup_stations",
    description: "List stations with their AQH (audience) data. Can filter by parent, market, and/or station call sign. Returns call signs, formats, and AQH values needed for barter calculations.",
    input_schema: {
      type: "object",
      properties: {
        parent_id: {
          type: "string",
          description: "Parent company name to filter by (optional)"
        },
        market_name: {
          type: "string",
          description: "Market name to filter by (optional, e.g., 'New York [PPM+D]')"
        },
        query: {
          type: "string",
          description: "Search query for station call sign (optional, e.g., 'WLTW', 'KHCM')"
        },
        allow_create: {
          type: "boolean",
          description: "Set to true if creating off-book stations (TV deals). Returns canCreateNew flag."
        }
      },
      required: []
    }
  },
  {
    name: "get_product_catalog",
    description: "Get the full product catalog with pricing information. Use this to confirm product names, pricing types, and available options.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "calculate_product_price",
    description: "Calculate the price for a specific product configuration. Returns monthly and annual values with breakdown.",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Product ID (e.g., 'topicpulse', 'prep_plus', 'topline', 'spoton', 'content_automation')"
        },
        assignments: {
          type: "object",
          description: "Stations and/or markets assigned to this product",
          properties: {
            stations: {
              type: "array",
              items: { type: "string" },
              description: "Array of station keys in format 'parent|market|callsign'"
            },
            markets: {
              type: "array",
              items: { type: "string" },
              description: "Array of market names (for market-level products like TopLine)"
            }
          }
        },
        extras: {
          type: "object",
          description: "Product-specific configuration options",
          properties: {
            pricingType: {
              type: "string",
              enum: ["cash", "barter"],
              description: "Pricing type (cash or barter)"
            },
            customPrice: {
              type: "number",
              description: "Custom monthly price override (optional)"
            },
            tier: {
              type: "string",
              description: "For TopLine: 'access', 'enterprise', or 'both'. For Content Automation: 'xs', 'small', 'medium', 'large', 'xl'"
            },
            numberOfMarkets: {
              type: "number",
              description: "Number of markets (for TopLine)"
            },
            creditsPerMonth: {
              type: "number",
              description: "Monthly credits (for SpotOn)"
            },
            dealType: {
              type: "string",
              enum: ["broadcast", "agency"],
              description: "Deal type - agency uses flat pricing without station multiplication"
            }
          }
        }
      },
      required: ["product_id"]
    }
  },
  {
    name: "calculate_barter_minutes",
    description: "Calculate the barter minutes needed to hit a target annual value. Allocates minutes proportionally across stations based on their AQH. Use this for barter or mixed payment deals.",
    input_schema: {
      type: "object",
      properties: {
        target_annual_value: {
          type: "number",
          description: "Target annual barter value in dollars"
        },
        stations: {
          type: "array",
          description: "Array of station objects with AQH data",
          items: {
            type: "object",
            properties: {
              callSign: { type: "string" },
              primeAQH: { type: "number" },
              rosAQH: { type: "number" }
            },
            required: ["callSign", "primeAQH", "rosAQH"]
          }
        },
        cpm: {
          type: "number",
          description: "Cost per mille (default: 2.00)"
        }
      },
      required: ["target_annual_value", "stations"]
    }
  },
  {
    name: "build_deal",
    description: "Build a complete deal object from configuration. This combines all the components (parent, stations, products, pricing) into a final deal structure ready for the UI.",
    input_schema: {
      type: "object",
      properties: {
        config: {
          type: "object",
          description: "Complete deal configuration",
          properties: {
            dealType: {
              type: "string",
              enum: ["broadcast", "agency"],
              description: "Deal type"
            },
            mediaType: {
              type: "string",
              enum: ["Radio", "TV", "AgencyOther"],
              description: "Media type - TV deals are cash-only"
            },
            parent: {
              type: "string",
              description: "Parent company name"
            },
            customerName: {
              type: "string",
              description: "Customer name (for agency deals)"
            },
            markets: {
              type: "array",
              items: { type: "string" },
              description: "List of market names"
            },
            stations: {
              type: "array",
              items: {},
              description: "List of station keys (strings) or station objects"
            },
            products: {
              type: "array",
              items: { type: "string" },
              description: "List of product IDs"
            },
            pricingType: {
              type: "string",
              enum: ["cash", "barter", "mixed"],
              description: "Payment type"
            },
            cpm: {
              type: "number",
              description: "CPM for barter calculations (default: 2.00)"
            },
            customPrices: {
              type: "object",
              description: "Custom prices by product ID"
            },
            productCashValues: {
              type: "object",
              description: "Cash values for mixed deals (monthly per product:station)"
            },
            productConfigs: {
              type: "object",
              description: "Product-specific configurations (TopLine tier, Content Automation tier, etc.)"
            }
          },
          required: ["dealType", "products"]
        }
      },
      required: ["config"]
    }
  },
  {
    name: "validate_deal",
    description: "Validate a deal and return any issues. Always call this before presenting a final deal to catch errors and warnings.",
    input_schema: {
      type: "object",
      properties: {
        deal: {
          type: "object",
          description: "The deal object from build_deal to validate"
        }
      },
      required: ["deal"]
    }
  }
];

export default { SYSTEM_PROMPT, TOOL_DEFINITIONS };
