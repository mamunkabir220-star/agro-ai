/**
 * AgroBot AI Engine — Gemini-first architecture
 *
 * Philosophy:
 *  - NO dumb keyword filter. Gemini decides if a question is agro-related.
 *  - Smart caching: store question + answer + metadata for reuse & analytics.
 *  - Semantic similarity: normalize questions before hashing so similar
 *    questions hit the same cache entry.
 *  - Structured response: every answer includes confidence, topic category,
 *    and follow-up suggestions — useful for future features.
 */

import CryptoJS from 'crypto-js';
import { supabaseAdmin } from './supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ─────────────────────────────────────────────
// SYSTEM PROMPT — Gemini is the sole judge
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are AgroBot, an expert AI agricultural advisor for farmers in Bangladesh.

YOUR JOB:
1. First decide: is this question related to agriculture, farming, plants, animals, soil, weather, fisheries, or rural livelihoods? 
2. If YES → give a helpful, practical answer.
3. If NO → politely decline and suggest what you CAN help with.

RESPONSE FORMAT (always respond with valid JSON, nothing else):
{
  "isAgro": true or false,
  "category": one of ["crop", "soil", "pest", "disease", "fertilizer", "irrigation", "livestock", "fishery", "weather", "equipment", "market", "organic", "other", "non-agro"],
  "language": "bn" or "en",
  "answer": "your full answer here",
  "tips": ["tip 1", "tip 2"],
  "followUp": ["suggested follow-up question 1", "suggested follow-up question 2"]
}

RULES:
- Be GENEROUS: any question about plants, trees, flowers, leaves, soil, animals, weather, farming lifestyle = agro.
- Examples of AGRO: rose plant bending, rice leaf turning brown, papaya yellow leaves, cow not eating, fish pond smell, when to plant onion, soil ph, what fertilizer for tomato.
- Examples of NON-AGRO: cricket score, politics, movie, cooking recipe, phone repair, love advice.
- Answer in the SAME language the user asked (Bengali → Bengali, English → English).
- Keep answers practical and suitable for Bangladeshi farming conditions.
- For "answer" field: be detailed but clear (150-250 words).
- Always populate "tips" with 2-3 actionable tips.
- Always populate "followUp" with 2 smart follow-up questions the farmer might want to ask.
- If non-agro, set isAgro=false, category="non-agro", answer=polite decline message.`;

// ─────────────────────────────────────────────
// CACHE KEY: normalize question for better hits
// ─────────────────────────────────────────────
function normalizeQuestion(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0980-\u09FF]/g, '') // keep alphanumeric + Bengali
    .replace(/\s+/g, ' ')
    .replace(/\b(my|i|the|a|an|is|are|was|were|do|does|did|should|would|could|please|help|me|what|why|how|when|where)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateCacheKey(text) {
  const normalized = normalizeQuestion(text);
  return CryptoJS.SHA256(normalized).toString().substring(0, 64);
}

function detectLanguage(text) {
  return /[\u0980-\u09FF]/.test(text) ? 'bn' : 'en';
}

// ─────────────────────────────────────────────
// CACHE READ
// ─────────────────────────────────────────────
async function readCache(cacheKey) {
  try {
    const { data } = await supabaseAdmin
      .from('ai_cache')
      .select('response, hit_count, category, language')
      .eq('query_hash', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (data) {
      // bump hit count async
      supabaseAdmin
        .from('ai_cache')
        .update({ hit_count: data.hit_count + 1 })
        .eq('query_hash', cacheKey)
        .then(() => {});

      return JSON.parse(data.response);
    }
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
// CACHE WRITE — stores structured data
// ─────────────────────────────────────────────
async function writeCache(cacheKey, originalQuestion, parsedResult, language) {
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('ai_cache')
      .upsert({
        query_hash:  cacheKey,
        query_text:  originalQuestion,
        response:    JSON.stringify(parsedResult),
        language:    language,
        hit_count:   1,
        created_at:  new Date().toISOString(),
        expires_at:  expiresAt,
      }, { onConflict: 'query_hash' });
  } catch (e) {
    console.error('Cache write error:', e.message);
  }
}

// ─────────────────────────────────────────────
// CALL GEMINI
// ─────────────────────────────────────────────
async function callGemini(question) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: {
        temperature:      0.5,
        maxOutputTokens:  800,
        topP:             0.9,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await res.json();

  if (data.error) throw new Error(`Gemini error ${data.error.code}: ${data.error.message}`);

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse JSON — strip any accidental markdown fences
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────
export async function getAgroResponse(question) {
  const language  = detectLanguage(question);
  const cacheKey  = generateCacheKey(question);

  // 1. Try cache first
  const cached = await readCache(cacheKey);
  if (cached) {
    return {
      success:  true,
      isAgro:   cached.isAgro,
      response: cached.answer,
      tips:     cached.tips     || [],
      followUp: cached.followUp || [],
      category: cached.category || 'other',
      cached:   true,
      language: cached.language || language,
    };
  }

  // 2. Call Gemini — it decides everything
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
      tips:     [],
      followUp: [],
      cached:   false,
      language,
      error:    err.message,
    };
  }

  // 3. Save to cache (only if valid response)
  if (parsed?.answer) {
    await writeCache(cacheKey, question, parsed, parsed.language || language);
  }

  return {
    success:  true,
    isAgro:   parsed.isAgro !== false,
    response: parsed.answer || '',
    tips:     parsed.tips     || [],
    followUp: parsed.followUp || [],
    category: parsed.category || 'other',
    cached:   false,
    language: parsed.language || language,
  };
}

export default { getAgroResponse };
