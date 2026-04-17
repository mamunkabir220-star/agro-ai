/**
 * GET /api/status?userId=xxx&chatType=agro
 * Returns current quota without consuming a question
 */
import 'server-only';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId   = searchParams.get('userId')   || 'anon';
    const chatType = searchParams.get('chatType') || 'agro';
    const platform = searchParams.get('platform') || 'web';

    const rate = await checkRateLimit(userId, platform, chatType);

    return Response.json({
      remaining:    rate.remaining    ?? 15,
      bonusGranted: rate.bonusGranted || false,
      isBonus:      rate.isBonus      || false,
      nearLimit:    rate.nearLimit    || false,
      allowed:      rate.allowed,
      chatType,
    });
  } catch (err) {
    console.error('Status error:', err.message);
    return Response.json({ remaining: 15, bonusGranted: false, isBonus: false, allowed: true });
  }
}
