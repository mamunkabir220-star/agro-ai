/**
 * AgroBot AI Engine — Gemini-first, fully robust
 */

import CryptoJS from 'crypto-js';
import { supabaseAdmin } from './supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

// ── Call Gemini API ──
async function callGemini(question) {
  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);

  // Collect ALL parts (thinking models may split into multiple parts)
  const parts  = data.candidates?.[0]?.content?.parts || [];
  const raw    = parts.map(p => p.text || '').join('');

  return parseGeminiResponse(raw);
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
