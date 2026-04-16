/**
 * Chat API — POST /api/chat
 */
import { getAgroResponse } from '@/lib/gemini';
import { checkRateLimit, incrementUsage, checkGlobalLimit, updateStats } from '@/lib/rate-limiter';

export async function POST(request) {
  try {
    const body = await request.json();
    const { question, userId, platform = 'web' } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return Response.json({ error: 'Question is required' }, { status: 400 });
    }
    if (question.length > 1000) {
      return Response.json({ error: 'Question too long (max 1000 characters)' }, { status: 400 });
    }

    const finalUserId = userId || `anon_${request.headers.get('x-forwarded-for') || 'unknown'}`;

    // Global daily cap
    const globalCheck = await checkGlobalLimit();
    if (!globalCheck.allowed) {
      await updateStats(platform, { blocked: true });
      return Response.json({
        success: false,
        response: 'আজকের দৈনিক সীমা শেষ। আগামীকাল আবার আসুন। / Daily limit reached. Please try tomorrow.',
        reason: 'global_limit',
      }, { status: 429 });
    }

    // Per-user rate limit
    const rateCheck = await checkRateLimit(finalUserId, platform);
    if (!rateCheck.allowed) {
      await updateStats(platform, { blocked: true });
      const messages = {
        hourly_limit:        'প্রতি ঘণ্টায় সীমা শেষ। পরে আবার চেষ্টা করুন। / Hourly limit reached.',
        daily_limit:         'আজকের সীমা শেষ। আগামীকাল আসুন। / Daily limit reached.',
        temporarily_blocked: 'আপনাকে সাময়িক ব্লক করা হয়েছে। / Temporarily blocked.',
      };
      return Response.json({
        success: false,
        response: messages[rateCheck.reason] || 'Rate limited',
        reason: rateCheck.reason,
        remaining: rateCheck.remaining,
      }, { status: 429 });
    }

    // ── Main AI call ──
    const result = await getAgroResponse(question.trim());

    // Track stats
    await incrementUsage(finalUserId, platform);
    await updateStats(platform, {
      aiCall:   result.success && !result.cached,
      cacheHit: result.cached,
      nonAgro:  !result.isAgro,
    });

    return Response.json({
      success:   result.success,
      response:  result.response,
      isAgro:    result.isAgro,
      tips:      result.tips     || [],
      followUp:  result.followUp || [],
      category:  result.category || 'other',
      cached:    result.cached,
      language:  result.language,
      remaining: rateCheck.remaining,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: 'Internal server error', message: error.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: 'ok', service: 'AgroBot AI', version: '2.0.0' });
}
