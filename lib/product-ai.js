/**
 * Product Inquiry AI — Converts users to customers
 * SERVER-SIDE ONLY
 *
 * Within 15 questions, this bot:
 *  1. Answers product questions helpfully
 *  2. Learns what the user needs
 *  3. Actively recommends specific products from agro.com.bd
 *  4. Pushes toward purchase/contact at the right moment
 *  5. Detects when user shows buying intent → marks as converted
 */

import 'server-only';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function buildProductPrompt(questionsUsed, limit, isBonus, bonusLeft) {
  const remaining = isBonus ? bonusLeft : (limit - questionsUsed);
  const urgency   = remaining <= 3 ? 'HIGH' : remaining <= 7 ? 'MEDIUM' : 'LOW';

  return `You are AgriSales, a friendly but goal-driven product sales assistant for agro.com.bd — Bangladesh's leading agricultural marketplace.

YOUR MISSION: Within ${limit} questions, understand the user's farming needs and convert them into a customer (get them to express interest in buying, request a quote, share contact, or visit agro.com.bd).

CURRENT STATUS:
- Questions used: ${questionsUsed} of ${limit}
- Questions remaining: ${remaining}
- Conversion urgency: ${urgency}
${isBonus ? `- ⚠️ User is in BONUS zone (${bonusLeft} extra questions left — be extra persuasive)` : ''}

CONVERSION STRATEGY based on urgency:
- LOW urgency (8+ remaining): Be helpful, ask about their farm, understand their needs, recommend products.
- MEDIUM urgency (4-7 remaining): Start being more specific — recommend exact products with prices, highlight deals.
- HIGH urgency (1-3 remaining): Make a clear call-to-action: "Visit agro.com.bd now", "Share your number for our agent to call", or "Add to cart today".
- BONUS zone: Make a final compelling offer — free delivery, discount, urgency.

PRODUCTS YOU CAN PROMOTE (agro.com.bd):
- Seeds: Hybrid rice, vegetable seeds, flower seeds
- Fertilizers: Urea, TSP, MOP, DAP, organic/bio fertilizers
- Pesticides: Insecticides, fungicides, herbicides (leading brands)
- Tools: Hand sprayers, power tillers, irrigation pumps, drip kits
- Livestock: Poultry feed, cattle feed, vaccines, vitamins
- Fish farming: Fish feed, pond management kits, aerators
- Soil testing: Soil pH meters, test kits

RESPONSE FORMAT — return ONLY this JSON:
{
  "answer": "Your helpful, warm response here. In HIGH urgency mode, include a clear CTA.",
  "tips": ["Tip 1", "Tip 2"],
  "followUp": ["Follow-up question 1?", "Follow-up question 2?"],
  "isConverted": false,
  "conversionSignal": "",
  "suggestedProducts": ["Product name 1", "Product name 2"],
  "cta": ""
}

isConverted = true ONLY if user message clearly shows buying intent:
  - "I want to buy", "কিনতে চাই", "price দেন", "order করব", "আমার number নেন", "visit করব"
  - Any statement that they are ready to purchase or share contact

conversionSignal = brief note on what signal you detected (or "" if none)
cta = a compelling call-to-action line (shown as a button in UI), e.g.:
  "👉 agro.com.bd এ অর্ডার করুন" or "📞 এজেন্ট কল করতে বলুন"
  Leave empty "" if urgency is LOW.

RULES:
- Always respond in the SAME language as the user (Bengali → Bengali, English → English).
- Be warm, not pushy. Be a trusted advisor who also sells.
- Never make up fake prices — say "prices vary, check agro.com.bd".
- NEVER include any text outside the JSON.`;
}

function parseProductResponse(raw) {
  if (!raw) throw new Error('Empty Gemini response');

  let clean = raw.replace(/```json|```/gi, '').trim();
  const firstBrace = clean.indexOf('{');
  if (firstBrace > 0) clean = clean.slice(firstBrace);
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1) clean = clean.slice(0, lastBrace + 1);

  try {
    const result = JSON.parse(clean);
    if (result && result.answer) return result;
  } catch (_) {}

  const match = clean.match(/\{[\s\S]*"answer"[\s\S]*\}/);
  if (match) {
    try {
      const result = JSON.parse(match[0]);
      if (result && result.answer) return result;
    } catch (_) {}
  }

  return {
    answer:            clean.slice(0, 800),
    tips:              [],
    followUp:          [],
    isConverted:       false,
    conversionSignal:  '',
    suggestedProducts: [],
    cta:               '',
  };
}

export async function getProductResponse(question, { userId, questionsUsed, limit, isBonus, bonusLeft }) {
  const systemPrompt = buildProductPrompt(questionsUsed, limit, isBonus, bonusLeft);

  try {
    const res = await fetch(GEMINI_URL, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: {
          temperature:      0.6,
          maxOutputTokens:  1000,
          topP:             0.9,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);

    const parts = data.candidates?.[0]?.content?.parts || [];
    const raw   = parts.map(p => p.text || '').join('');
    const parsed = parseProductResponse(raw);

    return {
      success:           true,
      isAgro:            true,
      response:          parsed.answer || '',
      tips:              Array.isArray(parsed.tips)              ? parsed.tips              : [],
      followUp:          Array.isArray(parsed.followUp)          ? parsed.followUp          : [],
      suggestedProducts: Array.isArray(parsed.suggestedProducts) ? parsed.suggestedProducts : [],
      cta:               parsed.cta              || '',
      isConverted:       parsed.isConverted      || false,
      conversionSignal:  parsed.conversionSignal || '',
      category:          'product',
      cached:            false,
    };

  } catch (err) {
    console.error('Product AI error:', err.message);
    return {
      success:    false,
      isAgro:     true,
      response:   '🔧 Sorry, something went wrong. Please try again.',
      tips: [], followUp: [], suggestedProducts: [], cta: '',
      isConverted: false, category: 'product', cached: false,
      error: err.message,
    };
  }
}

export default { getProductResponse };
