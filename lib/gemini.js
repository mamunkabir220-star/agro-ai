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

// Agriculture-related keywords for filtering
const AGRO_KEYWORDS = {
  en: [
    'farm', 'crop', 'seed', 'fertilizer', 'pesticide', 'harvest', 'soil',
    'irrigation', 'agriculture', 'plant', 'vegetable', 'fruit', 'rice',
    'wheat', 'corn', 'tomato', 'potato', 'onion', 'garlic', 'cattle',
    'poultry', 'fish', 'aquaculture', 'livestock', 'dairy', 'organic',
    'pest', 'disease', 'weed', 'tractor', 'plow', 'sow', 'grow', 'yield',
    'monsoon', 'drought', 'flood', 'weather', 'season', 'cultivate',
    'greenhouse', 'nursery', 'compost', 'manure', 'urea', 'npk', 'dap',
    'insecticide', 'fungicide', 'herbicide', 'spray', 'drip', 'pump'
  ],
  bn: [
    'চাষ', 'ফসল', 'বীজ', 'সার', 'কীটনাশক', 'ফলন', 'মাটি', 'সেচ',
    'কৃষি', 'গাছ', 'সবজি', 'ফল', 'ধান', 'গম', 'ভুট্টা', 'টমেটো',
    'আলু', 'পেঁয়াজ', 'রসুন', 'গরু', 'মুরগি', 'মাছ', 'পশু', 'দুধ',
    'জৈব', 'পোকা', 'রোগ', 'আগাছা', 'ট্রাক্টর', 'লাঙ্গল', 'বপন',
    'বর্ষা', 'খরা', 'বন্যা', 'আবহাওয়া', 'মৌসুম', 'চাষাবাদ',
    'নার্সারি', 'কম্পোস্ট', 'গোবর', 'ইউরিয়া', 'স্প্রে', 'পাম্প',
    'ফার্ম', 'কৃষক', 'খামার', 'শস্য', 'ফলমূল', 'শাকসবজি'
  ]
};

// System prompt for AgroBot
const AGROBOT_SYSTEM_PROMPT = `You are AgroBot, an AI agricultural advisor for Bangladeshi farmers. 

RULES:
1. ONLY answer questions about agriculture, farming, crops, livestock, fisheries, and related topics
2. If a question is NOT about agriculture, politely decline and say you only help with farming questions
3. Give practical, actionable advice suitable for Bangladesh's climate and conditions
4. Support both Bengali (বাংলা) and English - respond in the same language as the question
5. Keep responses concise but helpful (under 200 words)
6. Mention relevant products from agro.com.bd when appropriate
7. Be friendly and supportive to farmers

TOPICS YOU CAN HELP WITH:
- Crop cultivation (rice, vegetables, fruits, etc.)
- Fertilizer application and soil health
- Pest and disease management
- Irrigation and water management
- Livestock and poultry care
- Fish farming (aquaculture)
- Organic farming practices
- Weather and seasonal advice
- Agricultural tools and equipment
- Market prices and selling tips

TOPICS YOU CANNOT HELP WITH:
- Politics, religion, entertainment
- Personal advice unrelated to farming
- Medical advice for humans
- Financial/legal advice
- Any non-agricultural topics`;

/**
 * Check if a question is agriculture-related
 */
export function isAgroRelated(question) {
  const lowerQuestion = question.toLowerCase();
  
  // Check English keywords
  for (const keyword of AGRO_KEYWORDS.en) {
    if (lowerQuestion.includes(keyword)) return true;
  }
  
  // Check Bengali keywords
  for (const keyword of AGRO_KEYWORDS.bn) {
    if (question.includes(keyword)) return true;
  }
  
  // Additional patterns
  const agroPatterns = [
    /how (to|do i) (grow|plant|cultivate|harvest)/i,
    /what (fertilizer|seed|pesticide)/i,
    /when (to|should i) (plant|sow|harvest)/i,
    /problem with (my )?(crop|plant|tree|farm)/i,
    /কিভাবে|কখন|কোন সার|কোন বীজ/
  ];
  
  for (const pattern of agroPatterns) {
    if (pattern.test(question)) return true;
  }
  
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
    const { data, error } = await supabaseAdmin
      .from('ai_cache')
      .select('response, hit_count')
      .eq('query_hash', queryHash)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (data) {
      // Increment hit count
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
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
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
      contents: [
        {
          role: 'user',
          parts: [{ text: AGROBOT_SYSTEM_PROMPT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I am AgroBot, ready to help Bangladeshi farmers with agricultural questions only. How can I assist you today?' }]
        },
        {
          role: 'user',
          parts: [{ text: question }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
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
 * Detect language (simple heuristic)
 */
function detectLanguage(text) {
  // Check for Bengali characters
  const bengaliPattern = /[\u0980-\u09FF]/;
  return bengaliPattern.test(text) ? 'bn' : 'en';
}

/**
 * Main function: Get AgroBot response
 */
export async function getAgroResponse(question) {
  // 1. Check if agro-related
  if (!isAgroRelated(question)) {
    const lang = detectLanguage(question);
    return {
      success: false,
      isAgro: false,
      response: lang === 'bn' 
        ? '🌾 দুঃখিত, আমি শুধুমাত্র কৃষি সম্পর্কিত প্রশ্নের উত্তর দিতে পারি। অনুগ্রহ করে চাষাবাদ, ফসল, সার, বা কৃষি বিষয়ে জিজ্ঞাসা করুন।'
        : '🌾 Sorry, I can only answer agriculture-related questions. Please ask about farming, crops, fertilizers, or agricultural topics.',
      cached: false,
      language: lang
    };
  }
  
  const language = detectLanguage(question);
  const queryHash = generateHash(question);
  
  // 2. Check cache
  const cachedResponse = await checkCache(queryHash);
  if (cachedResponse) {
    return {
      success: true,
      isAgro: true,
      response: cachedResponse,
      cached: true,
      language
    };
  }
  
  // 3. Call Gemini
  try {
    const response = await callGemini(question);
    
    // 4. Save to cache
    await saveToCache(queryHash, question, response, language);
    
    return {
      success: true,
      isAgro: true,
      response,
      cached: false,
      language
    };
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
