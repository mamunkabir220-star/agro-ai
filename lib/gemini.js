/**
 * AgroBot AI Engine — Gemini-first, fully robust
 *
 * SERVER-SIDE ONLY — never runs in browser.
 * API key is stored as an environment variable and passed
 * via Authorization header (not URL) per Google's documentation.
 */

import 'server-only'; // Next.js guard: throws build error if client imports this

import CryptoJS from 'crypto-js';
import { supabaseAdmin } from './supabase';

// Key loaded from server environment variable — never exposed to client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Runtime guard — fail fast if key is missing
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set. Add it to Vercel Environment Variables.');
}

// Base URL without key in query string (key goes in header per Google docs)
// Model fallback chain — lite first (higher RPM), then full flash as backup
const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',   // 30 RPM free tier — primary
  'gemini-flash-latest',     // fallback
  'gemini-2.5-flash',        // last resort
];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You are AgroBot, an expert AI agricultural advisor for farmers in Bangladesh.

YOUR JOB:
1. Decide: is this question about agriculture, farming, plants, animals, soil, weather, fisheries, or rural life?
2. If YES → give a helpful, practical answer.
3. If NO → politely decline.

RESPONSE FORMAT — always return ONLY this JSON, nothing else before or after:
{
  "isAgro": true,
  "category": "crop",
  "language": "en",
  "answer": "Your detailed answer here (150-250 words)",
  "tips": ["Tip 1", "Tip 2", "Tip 3"],
  "followUp": ["Follow-up question 1?", "Follow-up question 2?"]
}

category must be one of: crop, soil, pest, disease, fertilizer, irrigation, livestock, fishery, weather, equipment, market, organic, other, non-agro

RULES:
- Be GENEROUS: any question about plants, trees, flowers, leaves, soil, animals, weather = agro.
- Examples of AGRO: rose plant bending, rice leaf brown, papaya yellow, cow sick, fish pond, when to plant onion.
- Examples of NON-AGRO: cricket score, politics, movie, phone repair, love advice.
- Respond in the SAME language as the question (Bengali → Bengali, English → English).
- NEVER include any text outside the JSON object. No preamble, no explanation, just the JSON.`;

// ── Normalize for cache key ──
function normalizeQuestion(text) {
  return text
    .toLowerCase().trim()
    .replace(/[^\w\s\u0980-\u09FF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(my|i|the|a|an|is|are|was|were|do|does|did|should|would|could|please|help|me|what|why|how|when|where)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function generateCacheKey(text) {
  return CryptoJS.SHA256(normalizeQuestion(text)).toString().substring(0, 64);
}

function detectLanguage(text) {
  return /[\u0980-\u09FF]/.test(text) ? 'bn' : 'en';
}

// ── Safely extract answer string from anything ──
function safeExtractAnswer(value) {
  if (!value) return '';
  // If it's already a plain string (not JSON), return it
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Looks like JSON? Try to parse and extract answer
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        return obj.answer || trimmed;
      } catch (_) {
        return trimmed;
      }
    }
    return trimmed;
  }
  // If it's an object, just get .answer
  if (typeof value === 'object' && value.answer) return value.answer;
  return String(value);
}

// ── Cache READ ──
async function readCache(cacheKey) {
  try {
    const { data } = await supabaseAdmin
      .from('ai_cache')
      .select('response, hit_count, category, language')
      .eq('query_hash', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!data) return null;

    // Bump hit count
    supabaseAdmin
      .from('ai_cache')
      .update({ hit_count: data.hit_count + 1 })
      .eq('query_hash', cacheKey)
      .then(() => {});

    // Parse stored JSON
    try {
      const parsed = JSON.parse(data.response);
      // Validate it has the right shape
      if (parsed && typeof parsed === 'object' && parsed.answer) {
        return parsed;
      }
    } catch (_) {}

    // Stored value isn't valid structured JSON — treat as plain text answer
    return {
      isAgro:   true,
      category: data.category || 'other',
      language: data.language || 'en',
      answer:   data.response,
      tips:     [],
      followUp: [],
    };
  } catch (_) {
    return null;
  }
}

// ── Cache WRITE ──
async function writeCache(cacheKey, originalQuestion, parsedResult, language) {
  try {
    await supabaseAdmin
      .from('ai_cache')
      .upsert({
        query_hash:  cacheKey,
        query_text:  originalQuestion,
        response:    JSON.stringify(parsedResult),
        language:    parsedResult.language || language,
        hit_count:   1,
        created_at:  new Date().toISOString(),
        expires_at:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'query_hash' });
  } catch (e) {
    console.error('Cache write error:', e.message);
  }
}

// ── Parse Gemini response robustly ──
function parseGeminiResponse(raw) {
  if (!raw) throw new Error('Empty response from Gemini');

  // Strip markdown fences
  let clean = raw.replace(/```json|```/gi, '').trim();

  // Remove any thinking preamble before the JSON object
  const firstBrace = clean.indexOf('{');
  if (firstBrace > 0) clean = clean.slice(firstBrace);

  // Remove anything after the last closing brace
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < clean.length - 1) {
    clean = clean.slice(0, lastBrace + 1);
  }

  // Try direct parse
  try {
    const result = JSON.parse(clean);
    if (result && result.answer) return result;
  } catch (_) {}

  // Try to find JSON object anywhere in the text
  const match = clean.match(/\{[\s\S]*"answer"[\s\S]*\}/);
  if (match) {
    try {
      const result = JSON.parse(match[0]);
      if (result && result.answer) return result;
    } catch (_) {}
  }

  // Last resort: the text IS the answer
  console.error('Could not parse Gemini JSON, using raw as answer');
  return {
    isAgro:   true,
    category: 'other',
    language: 'en',
    answer:   clean.slice(0, 800),
    tips:     [],
    followUp: [],
  };
}

// ── Call Gemini API with model fallback chain ──
async function callGemini(question) {
  let lastError;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/${model}:generateContent`;
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: {
            temperature:      0.4,
            maxOutputTokens:  1200,
            topP:             0.9,
            responseMimeType: 'application/json',
          },
        }),
      });

      const data = await res.json();

      // Rate limited → try next model
      if (data.error?.code === 429) {
        console.warn(`[AgroBot] ${model} rate limited — trying next model`);
        lastError = new Error(`${model} 429`);
        continue;
      }

      if (data.error) {
        throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const raw   = parts.map(p => p.text || '').join('');
      console.log(`[AgroBot] Responded via ${model}`);
      return parseGeminiResponse(raw);

    } catch (err) {
      if (err.message.includes('429')) {
        lastError = err;
        continue; // try next model
      }
      throw err; // real error — stop retrying
    }
  }

  throw lastError || new Error('All Gemini models exhausted');
}

// ── MAIN EXPORT ──
export async function getAgroResponse(question) {
  const language = detectLanguage(question);
  const cacheKey = generateCacheKey(question);

  // 1. Try cache
  const cached = await readCache(cacheKey);
  if (cached) {
    return {
      success:  true,
      isAgro:   cached.isAgro !== false,
      response: safeExtractAnswer(cached.answer),   // ← always a clean string
      tips:     Array.isArray(cached.tips)     ? cached.tips     : [],
      followUp: Array.isArray(cached.followUp) ? cached.followUp : [],
      category: cached.category || 'other',
      cached:   true,
      language: cached.language || language,
    };
  }

  // 2. Call Gemini
  let parsed;
  try {
    parsed = await callGemini(question);
  } catch (err) {
    console.error('Gemini call failed:', err.message);
    return {
      success:  false,
      isAgro:   true,
      response: language === 'bn'
        ? '🔧 দুঃখিত, AI এই মুহূর্তে সাড়া দিতে পারছে না। একটু পরে আবার চেষ্টা করুন।'
        : '🔧 Sorry, the AI could not respond right now. Please try again in a moment.',
      tips: [], followUp: [], cached: false, language,
      error: err.message,
    };
  }

  // 3. Save valid response to cache
  if (parsed?.answer) {
    await writeCache(cacheKey, question, parsed, language);
  }

  return {
    success:  true,
    isAgro:   parsed.isAgro !== false,
    response: safeExtractAnswer(parsed.answer),      // ← always a clean string
    tips:     Array.isArray(parsed.tips)     ? parsed.tips     : [],
    followUp: Array.isArray(parsed.followUp) ? parsed.followUp : [],
    category: parsed.category || 'other',
    cached:   false,
    language: parsed.language || language,
  };
}

export default { getAgroResponse };

// ─────────────────────────────────────────────
// PRODUCT CHAT — conversion-focused AI
// ─────────────────────────────────────────────
const PRODUCT_SYSTEM_PROMPT = `You are AgroBot Sales Assistant for agro.com.bd — Bangladesh's leading agricultural marketplace.

YOUR MISSION: Help the user find the right agricultural product AND convert them into a customer within 15 questions.

CONVERSION STRATEGY based on question number:
- Q1-5:   Understand their need. Ask about crop type, problem, farm size. Be helpful.
- Q6-10:  Recommend specific products from agro.com.bd. Mention prices, benefits, availability.
- Q11-15: Create urgency. Offer to connect them with sales. Ask if they are ready to buy.
- BONUS (Q16-20): Final push. Give best deal, direct purchase link, phone number.

RESPONSE FORMAT — return ONLY this JSON:
{
  "answer": "Your helpful response here",
  "tips": ["tip 1", "tip 2"],
  "followUp": ["question 1?", "question 2?"],
  "isConverted": false,
  "conversionCTA": null,
  "language": "en"
}

isConverted: set to TRUE only if user clearly says they want to buy / place an order.
conversionCTA: when ready to convert, set to one of:
  "visit_site" | "call_now" | "whatsapp" | null

RULES:
- Always respond in same language as user (Bengali or English).
- Be warm, helpful, and professional.
- Mention agro.com.bd naturally in recommendations.
- Never be pushy in Q1-5. Build trust first.
- From Q6 onward, always include a product recommendation.
- If user says "buy", "order", "কিনতে চাই", "অর্ডার" → set isConverted: true.`;

export async function getProductResponse(question, rateInfo = {}) {
  const language = detectLanguage(question);
  const cacheKey = 'product_' + generateCacheKey(question);

  // Check cache first
  const cached = await readCache(cacheKey);
  if (cached?.answer) {
    return {
      success:       true,
      isAgro:        true,
      response:      safeExtractAnswer(cached.answer),
      tips:          Array.isArray(cached.tips)     ? cached.tips     : [],
      followUp:      Array.isArray(cached.followUp) ? cached.followUp : [],
      category:      'product',
      cached:        true,
      language:      cached.language || language,
      isConverted:   cached.isConverted  || false,
      conversionCTA: cached.conversionCTA || null,
    };
  }

  // Add funnel context
  const qNum    = (rateInfo.used || 0) + 1;
  const context = `[Question ${qNum} of 15${rateInfo.isBonus ? ' BONUS ZONE — final push!' : ''}]`;
  const fullQ   = `${context}\n\nUser: ${question}`;

  // Call Gemini with fallback chain
  let parsed;
  let lastError;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/${model}:generateContent`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: PRODUCT_SYSTEM_PROMPT }] },
          contents:           [{ role: 'user', parts: [{ text: fullQ }] }],
          generationConfig: {
            temperature:      0.6,
            maxOutputTokens:  800,
            topP:             0.9,
            responseMimeType: 'application/json',
          },
        }),
      });

      const data = await res.json();

      if (data.error?.code === 429) {
        console.warn(`[AgroBot Product] ${model} rate limited — trying next`);
        lastError = new Error(`${model} 429`);
        continue;
      }
      if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);

      const parts = data.candidates?.[0]?.content?.parts || [];
      const raw   = parts.map(p => p.text || '').join('');
      parsed = parseGeminiResponse(raw);
      console.log(`[AgroBot Product] Responded via ${model}`);
      break;

    } catch (err) {
      if (err.message.includes('429')) { lastError = err; continue; }
      throw err;
    }
  }

  if (!parsed) {
    console.error('Product Gemini failed:', lastError?.message);
    return {
      success:  false, isAgro: true,
      response: language === 'bn'
        ? '🔧 দুঃখিত, এই মুহূর্তে সাড়া দিতে পারছি না। আবার চেষ্টা করুন।'
        : '🔧 Sorry, could not respond right now. Please try again.',
      tips: [], followUp: [], cached: false, language,
      isConverted: false, conversionCTA: null,
    };
  }

  // Cache for 7 days
  if (parsed?.answer) {
    try {
      await supabaseAdmin.from('ai_cache').upsert({
        query_hash:  cacheKey,
        query_text:  question,
        response:    JSON.stringify(parsed),
        language:    parsed.language || language,
        hit_count:   1,
        created_at:  new Date().toISOString(),
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'query_hash' });
    } catch (_) {}
  }

  return {
    success:       true,
    isAgro:        true,
    response:      safeExtractAnswer(parsed?.answer),
    tips:          Array.isArray(parsed?.tips)     ? parsed.tips     : [],
    followUp:      Array.isArray(parsed?.followUp) ? parsed.followUp : [],
    category:      'product',
    cached:        false,
    language:      parsed?.language || language,
    isConverted:   parsed?.isConverted  || false,
    conversionCTA: parsed?.conversionCTA || null,
  };
}
