/**
 * Gemini AI Wrapper for AgroBot
 * - Only answers agriculture-related questions
 * - Caches responses to save costs
 * - Supports Bengali and English
 */

import CryptoJS from 'crypto-js';
import { supabaseAdmin } from './supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// System prompt for AgroBot
const AGROBOT_SYSTEM_PROMPT = `You are AgroBot, an AI agricultural advisor for Bangladeshi farmers.

RULES:
1. Answer ALL questions related to agriculture, farming, plants, animals, crops, soil, weather, pests, diseases, livestock, fisheries, gardening, and any rural/farming lifestyle topics.
2. Be GENEROUS in what you consider agriculture-related. For example:
   - "Why is my papaya leaf turning yellow?" → YES (plant disease)
   - "How to grow tomatoes?" → YES
   - "My cow is not eating" → YES (livestock)
   - "What is the weather in Dhaka?" → YES (weather affects farming)
   - "How do I cook rice?" → NO (cooking, not farming)
   - "Who is the president?" → NO (politics)
3. If a question is clearly NOT about agriculture/farming/plants/animals/rural life, politely decline.
4. Give practical, actionable advice suitable for Bangladesh's climate and conditions.
5. Support both Bengali (বাংলা) and English — respond in the SAME language as the question.
6. Keep responses helpful and clear (under 250 words).
7. Be friendly and supportive to farmers.

TOPICS YOU CAN HELP WITH:
- Any plant: crops, vegetables, fruits, trees, flowers, herbs
- Plant problems: yellow leaves, wilting, spots, rot, pests, diseases
- Soil health, fertilizers, composting
- Irrigation, water management
- Livestock: cattle, goats, chickens, ducks
- Fish farming (aquaculture, ponds)
- Weather, seasons, monsoon effects
- Organic farming, pesticides, fungicides
- Seeds, planting, harvesting
- Agricultural tools and equipment
- Market prices and selling tips`;

/**
 * Smart agro filter — uses simple heuristics + common sense
 * Much more permissive than before
 */
export function isAgroRelated(question) {
  const q = question.toLowerCase();

  // Clear NON-agro topics — reject these
  const nonAgroPatterns = [
    /\b(politics|election|president|minister|government|parliament)\b/i,
    /\b(cricket|football|soccer|sports|ipl|bpl)\b/i,
    /\b(movie|film|song|music|actor|actress|celebrity)\b/i,
    /\b(stock market|bitcoin|crypto|investment|bank loan)\b/i,
    /\b(recipe|cook|restaurant|food delivery|hotel)\b/i,
    /\b(love|relationship|marriage|divorce|girlfriend|boyfriend)\b/i,
    /\b(exam|school|university|admission|job vacancy|salary)\b/i,
    /\b(phone|mobile|laptop|computer|software|app|internet)\b/i,
  ];

  // If it matches a clear non-agro topic, reject
  for (const pattern of nonAgroPatterns) {
    if (pattern.test(q)) return false;
  }

  // Clear AGRO keywords — always accept these
  const agroKeywords = [
    // Plants & crops (English)
    'plant', 'leaf', 'leaves', 'tree', 'crop', 'seed', 'flower', 'root', 'stem', 'branch',
    'fruit', 'vegetable', 'herb', 'grass', 'weed',
    // Specific crops
    'rice', 'wheat', 'corn', 'maize', 'jute', 'sugarcane', 'cotton',
    'tomato', 'potato', 'onion', 'garlic', 'brinjal', 'eggplant', 'cabbage', 'cauliflower',
    'papaya', 'mango', 'banana', 'lemon', 'orange', 'guava', 'jackfruit', 'watermelon',
    'cucumber', 'pumpkin', 'gourd', 'spinach', 'bean', 'lentil', 'pea', 'mustard',
    // Farming
    'farm', 'field', 'soil', 'land', 'garden', 'nursery', 'greenhouse',
    'fertilizer', 'compost', 'manure', 'urea', 'npk', 'dap', 'pesticide', 'insecticide',
    'fungicide', 'herbicide', 'spray', 'irrigation', 'watering', 'drainage',
    'harvest', 'planting', 'sowing', 'cultivat', 'till', 'plow',
    // Problems
    'yellow', 'wilting', 'wilt', 'rot', 'disease', 'pest', 'insect', 'bug', 'fungus',
    'blight', 'mold', 'mould', 'spot', 'drooping', 'dying', 'dead',
    // Animals
    'cow', 'cattle', 'goat', 'sheep', 'chicken', 'poultry', 'duck', 'fish', 'shrimp',
    'livestock', 'animal', 'dairy', 'milk', 'egg',
    // Weather
    'rain', 'drought', 'flood', 'monsoon', 'weather', 'season', 'climate',
    // Bengali keywords
    'চাষ', 'ফসল', 'বীজ', 'সার', 'কীটনাশক', 'মাটি', 'সেচ', 'কৃষি', 'গাছ',
    'পাতা', 'ফল', 'সবজি', 'ধান', 'গম', 'ভুট্টা', 'পাট', 'আখ',
    'টমেটো', 'আলু', 'পেঁয়াজ', 'রসুন', 'বেগুন', 'পেঁপে', 'আম', 'কলা',
    'গরু', 'ছাগল', 'মুরগি', 'মাছ', 'পশু', 'দুধ', 'হাঁস',
    'পোকা', 'রোগ', 'আগাছা', 'সংগ্রহ', 'রোপণ', 'বপন',
    'হলুদ', 'শুকিয়ে', 'পচা', 'ছত্রাক', 'বন্যা', 'খরা', 'বৃষ্টি',
    'কৃষক', 'খামার', 'শস্য', 'ফলন', 'জমি', 'মাঠ',
  ];

  for (const kw of agroKeywords) {
    if (q.includes(kw)) return true;
  }

  // Short questions with plant/animal context — be generous
  // e.g. "why is it yellow?", "how to fix this?"
  if (q.length < 120) return true; // Short ambiguous questions → let Gemini decide

  return false;
}

/**
 * Generate hash for caching
 */
function generateHash(text) {
  return CryptoJS.SHA256(text.toLowerCase().trim()).toString().substring(0, 64);
}

/**
 * Check cache for existing response
 */
async function checkCache(queryHash) {
  try {
    const { data } = await supabaseAdmin
      .from('ai_cache')
      .select('response, hit_count')
      .eq('query_hash', queryHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (data) {
      await supabaseAdmin
        .from('ai_cache')
        .update({ hit_count: data.hit_count + 1 })
        .eq('query_hash', queryHash);
      return data.response;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Save response to cache
 */
async function saveToCache(queryHash, queryText, response, language) {
  try {
    await supabaseAdmin
      .from('ai_cache')
      .upsert({
        query_hash: queryHash,
        query_text: queryText,
        response: response,
        language: language,
        hit_count: 1,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: 'query_hash' });
  } catch (e) {
    console.error('Cache save error:', e);
  }
}

/**
 * Call Gemini API
 */
async function callGemini(question) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: AGROBOT_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: question }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
        topP: 0.9
      }
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
}

/**
 * Detect language
 */
function detectLanguage(text) {
  const bengaliPattern = /[\u0980-\u09FF]/;
  return bengaliPattern.test(text) ? 'bn' : 'en';
}

/**
 * Main function: Get AgroBot response
 */
export async function getAgroResponse(question) {
  const language = detectLanguage(question);

  // 1. Check if agro-related
  if (!isAgroRelated(question)) {
    return {
      success: false,
      isAgro: false,
      response: language === 'bn'
        ? '🌾 দুঃখিত, আমি শুধুমাত্র কৃষি সম্পর্কিত প্রশ্নের উত্তর দিতে পারি। অনুগ্রহ করে চাষাবাদ, ফসল, গাছপালা, পশুপাখি, বা কৃষি বিষয়ে জিজ্ঞাসা করুন।'
        : '🌾 Sorry, I can only answer agriculture-related questions. Please ask about farming, crops, plants, livestock, or agricultural topics.',
      cached: false,
      language
    };
  }

  const queryHash = generateHash(question);

  // 2. Check cache
  const cachedResponse = await checkCache(queryHash);
  if (cachedResponse) {
    return { success: true, isAgro: true, response: cachedResponse, cached: true, language };
  }

  // 3. Call Gemini
  try {
    const response = await callGemini(question);

    // 4. Save to cache
    await saveToCache(queryHash, question, response, language);

    return { success: true, isAgro: true, response, cached: false, language };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      success: false,
      isAgro: true,
      response: language === 'bn'
        ? '🔧 দুঃখিত, একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
        : '🔧 Sorry, something went wrong. Please try again.',
      cached: false,
      language,
      error: error.message
    };
  }
}

export default { getAgroResponse, isAgroRelated };
