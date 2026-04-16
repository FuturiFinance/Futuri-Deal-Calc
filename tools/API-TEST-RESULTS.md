# API Test Results

Generated: 2026-04-16

**Status: PENDING** - Waiting for ANTHROPIC_API_KEY to be configured in Vercel

---

## Prerequisites

Before running tests:

1. **Add ANTHROPIC_API_KEY to Vercel**:
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add `ANTHROPIC_API_KEY` with your Anthropic API key
   - Redeploy the project

2. **Deploy or run locally**:
   ```bash
   npm install
   vercel dev  # For local testing
   # or
   vercel      # Deploy to preview
   ```

---

## Test Cases

### Test 1: Simple single-product deal
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Cumulus wants POST on KHCM at $700/mo cash"}],
    "context": {"mediaType": "Radio", "nielsenBook": "fall2025", "cpm": 2.00}
  }'
```

**Expected Behavior:**
- Claude looks up "Cumulus" parent company
- Finds KHCM station in Honolulu market
- Calculates POST at custom $700/mo rate
- Builds deal with 1 station, 1 product, cash payment
- Validates and returns complete deal config

**Expected Response Fields:**
```json
{
  "success": true,
  "content": [{"type": "text", "text": "...deal summary and JSON config..."}],
  "toolCalls": ["lookup_parent", "lookup_stations", "calculate_product_price", "build_deal", "validate_deal"],
  "usage": {"inputTokens": ..., "outputTokens": ..., "estimatedCost": ...}
}
```

**Actual Response:** _Run test after API key is configured_

---

### Test 2: Multi-product mixed payment deal
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Cumulus wants to add POST on KHCM at $700/mo and Streaming on all Honolulu stations at $275/mo each. Mixed deal, $400 cash per station per month."}],
    "context": {"mediaType": "Radio", "nielsenBook": "fall2025", "cpm": 2.00}
  }'
```

**Expected Behavior:**
- Looks up Cumulus and finds all Honolulu stations
- Calculates POST at $700 and Streaming at $275 (custom prices)
- Splits payment: $400 cash, remainder barter
- Calculates barter minutes based on station AQH
- Validates mixed deal configuration

**Expected Response Fields:**
- `pricingType: "mixed"`
- `cashAnnual` and `barterTargetAnnual` both > 0
- `barterAllocation` with per-station minutes

**Actual Response:** _Run test after API key is configured_

---

### Test 3: Agency/Other deal
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "New agency deal for Smith Marketing Agency in Chicago. They want TopicPulse and Prep+ at standard rates, cash payment."}],
    "context": {"mediaType": "AgencyOther"}
  }'
```

**Expected Behavior:**
- Creates agency deal (no station lookup needed)
- Uses flat pricing (count = 1) for products
- No barter allocation (agency deals use cash)

**Expected Response Fields:**
- `dealType: "agency"`
- `mediaType: "AgencyOther"`
- `customerName: "Smith Marketing Agency"`
- Products priced without station multiplication

**Actual Response:** _Run test after API key is configured_

---

### Test 4: TV deal (off-book stations)
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "ABC Stations wants TopicPulse on WLS-TV Chicago and WABC-TV New York. This is a TV deal."}],
    "context": {"mediaType": "TV"}
  }'
```

**Expected Behavior:**
- Recognizes TV deal (no Nielsen data)
- Creates off-book stations with `inBook: false`
- Forces cash-only pricing (no barter for TV)
- Validates TV-specific rules

**Expected Response Fields:**
- `mediaType: "TV"`
- `pricingType: "cash"` (forced)
- `hasOffBookStations: true`
- `barterAllocation: null`

**Actual Response:** _Run test after API key is configured_

---

### Test 5: Ambiguous request (clarifying questions)
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "iHeart wants TopLine and some TopicPulse"}],
    "context": {"mediaType": "Radio", "nielsenBook": "fall2025"}
  }'
```

**Expected Behavior:**
- Claude should ask clarifying questions:
  - Which TopLine tier (Access, Enterprise, Both)?
  - Which markets for TopLine?
  - Which stations for TopicPulse?
  - Payment type (cash, barter, mixed)?

**Expected Response:**
- Questions in the text response
- May not call build_deal until clarified
- `stopReason: "end_turn"` (waiting for user response)

**Actual Response:** _Run test after API key is configured_

---

### Test 6: TopLine multi-market deal
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "iHeartMedia wants TopLine Access for New York, Los Angeles, and Chicago markets. 10 users, 300 accounts. Cash deal."}],
    "context": {"mediaType": "Radio", "nielsenBook": "fall2025"}
  }'
```

**Expected Behavior:**
- Calculates TopLine Access at $42K/market × 3 = $126K base
- Adds overage: (10-5) users × $250 × 12 = $15K
- Adds overage: ceil((300-220)/5) × $25 × 12 = $4,800
- Total: ~$145,800/year

**Expected Response Fields:**
- `products: ["topline"]`
- `numberOfMarkets: 3`
- Annual value around $145K-$150K

**Actual Response:** _Run test after API key is configured_

---

### Test 7: Barter-only deal
**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Audacy wants TopicPulse IV on all their New York stations, full barter."}],
    "context": {"mediaType": "Radio", "nielsenBook": "fall2025", "cpm": 2.00}
  }'
```

**Expected Behavior:**
- Looks up Audacy New York stations
- Calculates barter pricing ($1,750/station × 1.4 multiplier)
- Allocates barter minutes proportionally by AQH
- Shows barter allocation per station

**Expected Response Fields:**
- `pricingType: "barter"`
- `barterAllocation.perStation` with minutes for each station
- `cashAnnual: 0`

**Actual Response:** _Run test after API key is configured_

---

## Validation Checklist

After running tests, verify:

- [ ] All 7+ tests return `success: true`
- [ ] Tool calls are logged in order
- [ ] Token usage is reasonable (<10K tokens per request)
- [ ] Cost estimates are provided
- [ ] Rate limiting headers are present
- [ ] Error handling works (test with invalid API key)

---

## Cost Tracking Example

From successful test runs, expect logs like:
```json
{
  "timestamp": "2026-04-16T12:00:00.000Z",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 3500,
  "outputTokens": 1200,
  "toolCalls": ["lookup_parent", "lookup_stations", "build_deal", "validate_deal"],
  "toolCallCount": 4,
  "cost": "0.028500",
  "durationMs": 4500
}
```

---

## Running Tests Locally

```bash
# Install dependencies
npm install

# Set environment variable
export ANTHROPIC_API_KEY=sk-ant-api03-...

# Start local dev server
npm run dev

# In another terminal, run curl commands from test.http
curl -X POST http://localhost:3000/api/agent/chat ...
```

---

## Notes

- Rate limit: 20 requests/minute per IP
- Max tokens: 4096
- Timeout: 60 seconds
- Model: claude-sonnet-4-20250514 (default)
