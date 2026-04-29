import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;

// Real product categories on agro.com.bd
const AGRO_CATEGORIES = [
  'সার (Fertilizer): ইউরিয়া, DAP, TSP, MOP, জৈব সার, বোরন, জিংক সালফেট',
  'কীটনাশক (Pesticide): ইমিডাক্লোপ্রিড, সাইপারমেথ্রিন, ক্লোরপাইরিফস, ডায়াজিনন',
  'ছত্রাকনাশক (Fungicide): ম্যানকোজেব, কার্বেন্ডাজিম, প্রপিকোনাজল, থায়োফানেট',
  'আগাছানাশক (Herbicide): গ্লাইফোসেট, বিস্পাইরিব্যাক সোডিয়াম, প্রিটিলাক্লোর',
  'বীজ (Seeds): ধান, সবজি, ফুলকপি, বাঁধাকপি, টমেটো, মরিচ বীজ',
  'সেচ সরঞ্জাম (Irrigation): শ্যালো পাম্প, ড্রিপ সেচ, স্প্রিংকলার',
  'কৃষি যন্ত্রপাতি (Equipment): পাওয়ার টিলার, থ্রেশার, স্প্রেয়ার',
  'মাছ চাষ (Fishery): মাছের খাদ্য, পুকুর চুন, অক্সিজেন ট্যাবলেট, প্রোবায়োটিক',
  'পশু পালন (Livestock): পশু খাদ্য, ভ্যাকসিন, ভিটামিন-মিনারেল',
];

export async function POST(request) {
  try {
    const { problem, category } = await request.json();
    if (!problem) return Response.json({ products: [] });

    // Create cache key
    const cacheKey = problem.toLowerCase().replace(/\s+/g,'_').slice(0,80);

    // Check cache
    const { data: cached } = await supabaseAdmin
      .from('products_cache')
      .select('products')
      .eq('problem_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached?.products) {
      return Response.json({ products: cached.products, fromCache: true });
    }

    // Ask Gemini: does agro.com.bd have products for this problem?
    const prompt = `You are a product matcher for agro.com.bd — a Bangladesh agricultural marketplace.

User's farming problem: "${problem}"

agro.com.bd sells these categories:
${AGRO_CATEGORIES.join('\n')}

Task: Find up to 3 products from agro.com.bd that would help solve this specific problem.
ONLY recommend products if they clearly match the problem. If no match, return empty array.

Return ONLY JSON array:
[
  {
    "name": "Product name in Bengali/English",
    "category": "Category name",
    "usage": "How to use for this specific problem (1 sentence in Bengali)",
    "available": true,
    "searchQuery": "search term to find on agro.com.bd"
  }
]

Return [] if no relevant products exist on agro.com.bd for this problem.`;

    const aiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500, responseMimeType: 'application/json', temperature: 0.2 }
      })
    });

    const aiData = await aiRes.json();
    if (aiData.error) return Response.json({ products: [] });

    const raw      = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const clean    = raw.replace(/```json|```/gi,'').trim();
    const products = JSON.parse(clean.startsWith('[') ? clean : '[]');

    // Enrich with real product data from DB
    let enriched = products;
    try {
      enriched = await Promise.all(products.map(async (p) => {
        const term = p.searchQuery.replace(/[%_]/g, '').trim();
        const { data: db } = await supabaseAdmin
          .from('products')
          .select('id, name_bn, name_en, price, sale_price, images, is_featured, is_flash_sale, created_at')
          .eq('is_active', true)
          .eq('is_b2b', false)
          .or(`name_en.ilike.%${term}%,name_bn.ilike.%${term}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...p, dbProduct: db || null };
      }));
    } catch (_) {}

    // Cache
    if (enriched.length > 0) {
      await supabaseAdmin.from('products_cache').upsert({
        problem_key: cacheKey,
        products: enriched,
        created_at:  new Date().toISOString(),
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'problem_key' });
    }

    return Response.json({ products: enriched, fromCache: false });
  } catch (err) {
    console.error('Products error:', err.message);
    return Response.json({ products: [] });
  }
}
