/**
 * AgroBot Chat API — POST /api/chat
 * Handles both chatType: 'agro' and chatType: 'product'
 */
import 'server-only';
import { getAgroResponse, getProductResponse } from '@/lib/gemini';
import {
  checkRateLimit, incrementUsage,
  checkGlobalLimit, updateStats, markConverted,
} from '@/lib/rate-limiter';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      question,
      userId,
      platform  = 'web',
      chatType  = 'agro',   // 'agro' | 'product'
    } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return Response.json({ error: 'Question is required' }, { status: 400 });
    }
    if (question.length > 1000) {
      return Response.json({ error: 'Question too long (max 1000 characters)' }, { status: 400 });
    }

    const uid = userId || `anon_${request.headers.get('x-forwarded-for') || 'unknown'}`;

    // ── Global daily cap ──
    const global = await checkGlobalLimit();
    if (!global.allowed) {
      return Response.json({
        success:  false,
        response: '🌾 আজকের জন্য AgroBot বন্ধ আছে। আগামীকাল আবার আসুন। / AgroBot is at capacity for today. Please come back tomorrow.',
        reason:   'global_limit',
      }, { status: 429 });
    }

    // ── Per-user rate limit for this chatType ──
    const rate = await checkRateLimit(uid, platform, chatType);

    if (!rate.allowed) {
      const resetTime = rate.resetAt
        ? new Date(rate.resetAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
        : 'কাল';

      return Response.json({
        success:   false,
        limitHit:  true,
        response:  chatType === 'product'
          ? `🛒 আপনার আজকের প্রোডাক্ট প্রশ্নের সীমা শেষ (${rate.limit} টি + ৫ বোনাস)। ${resetTime} এ রিসেট হবে।\n\n📞 এখনই কিনতে চাইলে: agro.com.bd এ যান বা আমাদের কল করুন।`
          : `🌾 আপনার আজকের প্রশ্নের সীমা শেষ (${rate.limit} টি + ৫ বোনাস)। ${resetTime} এ রিসেট হবে।`,
        reason:    'daily_limit_exhausted',
        chatType,
        remaining: 0,
      }, { status: 429 });
    }

    // ── Call the right AI handler ──
    const result = chatType === 'product'
      ? await getProductResponse(question.trim(), rate)
      : await getAgroResponse(question.trim());

    // ── Increment usage ──
    await incrementUsage(uid, platform, chatType);
    await updateStats(platform, {
      aiCall:   result.success && !result.cached,
      cacheHit: result.cached,
      nonAgro:  !result.isAgro,
    });

    // ── Mark converted if product AI signals it ──
    if (chatType === 'product' && result.isConverted) {
      await markConverted(uid, platform);
    }

    // ── Build remaining message ──
    let remainingMsg = null;
    if (rate.bonusJustGiven) {
      remainingMsg = chatType === 'product'
        ? `🎁 আপনার ১৫টি প্রশ্ন শেষ। আরও ৫টি বোনাস প্রশ্ন দেওয়া হয়েছে যাতে আপনি সিদ্ধান্ত নিতে পারেন!`
        : `🎁 আপনার ১৫টি প্রশ্ন শেষ। আরও ৫টি বোনাস প্রশ্ন পেয়েছেন!`;
    } else if (rate.nearLimit) {
      remainingMsg = `⚠️ আপনার মাত্র ${rate.remaining}টি প্রশ্ন বাকি আছে আজকের জন্য।`;
    } else if (rate.isBonus) {
      remainingMsg = `⭐ বোনাস: ${rate.remaining}টি প্রশ্ন বাকি।`;
    }

    return Response.json({
      success:        result.success,
      response:       result.response,
      isAgro:         result.isAgro,
      tips:           result.tips     || [],
      followUp:       result.followUp || [],
      category:       result.category || 'other',
      cached:         result.cached,
      language:       result.language,
      chatType,
      remaining:      rate.remaining,
      bonusGranted:   rate.bonusGranted,
      bonusJustGiven: rate.bonusJustGiven || false,
      isBonus:        rate.isBonus || false,
      nearLimit:      rate.nearLimit || false,
      remainingMsg,
      // Product conversion data
      isConverted:    result.isConverted || false,
      conversionCTA:  result.conversionCTA || null,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({ status: 'ok', service: 'AgroBot AI', version: '3.0.0' });
}
