import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`;

const SERVICE_TYPES = {
  vet:         'ভেটেরিনারি ডাক্তার ও পশু হাসপাতাল',
  crop:        'উপজেলা কৃষি অফিস ও শস্য রোগ বিশেষজ্ঞ',
  horticulture:'হর্টিকালচার সেন্টার ও উদ্যান প্রশিক্ষণ',
  fishery:     'মৎস্য অফিস ও মাছ চাষ পরামর্শ কেন্দ্র',
  extension:   'কৃষি সম্প্রসারণ অধিদপ্তর (DAE)',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const district    = searchParams.get('district') || 'Dhaka';
    const division    = searchParams.get('division') || '';
    const problemType = searchParams.get('type')     || 'crop'; // vet|crop|horticulture|fishery|extension
    const cacheKey    = `${district.toLowerCase()}_${problemType}`;

    // Check Supabase cache first
    const { data: cached } = await supabaseAdmin
      .from('govt_services_cache')
      .select('services')
      .eq('district', district.toLowerCase())
      .eq('service_type', problemType)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached?.services) {
      return Response.json({ services: cached.services, fromCache: true });
    }

    // Ask Gemini to find govt services for this location
    const serviceLabel = SERVICE_TYPES[problemType] || 'কৃষি সেবা কেন্দ্র';
    const prompt = `You are a Bangladesh government services directory assistant.

Find real government agricultural services for: ${district} district, ${division} division, Bangladesh.
Service type needed: ${serviceLabel}

Return ONLY a JSON array of up to 5 services in this exact format:
[
  {
    "name": "Service center name in Bengali",
    "type": "${problemType}",
    "address": "Full address in Bengali",
    "phone": "Phone number (01XXXXXXXXX format)",
    "hours": "Office hours",
    "services": ["service1", "service2"]
  }
]

Use real Bangladesh government office information. Include Upazila Agriculture Office, DAE offices, ULO offices, Upazila Livestock Office, Upazila Fisheries Office as appropriate. If exact number unknown, use the official Bangladesh hotline 16123 for agriculture.`;

    const aiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, responseMimeType: 'application/json', temperature: 0.2 }
      })
    });

    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const raw      = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const clean    = raw.replace(/```json|```/gi,'').trim();
    const services = JSON.parse(clean.startsWith('[') ? clean : '[]');

    // Cache in Supabase
    if (services.length > 0) {
      await supabaseAdmin.from('govt_services_cache').upsert({
        district:     district.toLowerCase(),
        service_type: problemType,
        services,
        created_at:   new Date().toISOString(),
        expires_at:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'district,service_type' });
    }

    return Response.json({ services, fromCache: false });
  } catch (err) {
    console.error('Services error:', err.message);
    return Response.json({
      services: [{
        name: 'কৃষি তথ্য সার্ভিস হেল্পলাইন',
        type: 'general',
        address: 'সারাদেশ',
        phone: '16123',
        hours: 'সকাল ৮টা - বিকাল ৫টা',
        services: ['কৃষি পরামর্শ', 'রোগ-বালাই দমন', 'সার ব্যবস্থাপনা']
      }],
      fromCache: false
    });
  }
}
