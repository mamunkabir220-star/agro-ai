/**
 * AgroBot Rate Limiter — v2.0
 * SERVER-SIDE ONLY
 *
 * Rules:
 *  AGRO chat:    15 questions per 24 hours per user
 *  PRODUCT chat: 15 questions per 24 hours per user
 *                → bot actively converts user to customer within 15 Q's
 *  BONUS:        If limit reached & query not resolved → auto-grant +5 (once per day)
 *  Reset:        Every 24 hours from first question of that day
 */

import 'server-only';
import { supabaseAdmin } from './supabase';

const AGRO_LIMIT    = 15;
const PRODUCT_LIMIT = 15;
const BONUS         = 5;

// ── Get or create record ──
async function getOrCreate(userId, platform, chatType) {
  const { data } = await supabaseAdmin
    .from('rate_limits')
    .select('*')
    .eq('user_id',   userId)
    .eq('platform',  platform)
    .eq('chat_type', chatType)
    .single();

  if (data) return data;

  const { data: created } = await supabaseAdmin
    .from('rate_limits')
    .insert({
      user_id:          userId,
      platform,
      chat_type:        chatType,
      daily_count:      0,
      bonus_granted:    false,
      bonus_count:      0,
      is_converted:     false,
      last_reset_daily: new Date().toISOString(),
    })
    .select()
    .single();

  return created;
}

// ── Reset if 24h passed ──
async function resetIfExpired(record, userId, platform, chatType) {
  const hoursElapsed = (Date.now() - new Date(record.last_reset_daily)) / 3600000;
  if (hoursElapsed < 24) return record;

  const patch = {
    daily_count:      0,
    bonus_granted:    false,
    bonus_count:      0,
    last_reset_daily: new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  };

  await supabaseAdmin
    .from('rate_limits')
    .update(patch)
    .eq('user_id',   userId)
    .eq('platform',  platform)
    .eq('chat_type', chatType);

  return { ...record, ...patch };
}

// ── MAIN: Check rate limit ──
export async function checkRateLimit(userId, platform, chatType = 'agro') {
  try {
    let rec = await getOrCreate(userId, platform, chatType);
    rec     = await resetIfExpired(rec, userId, platform, chatType);

    const baseLimit = chatType === 'product' ? PRODUCT_LIMIT : AGRO_LIMIT;
    const used      = rec.daily_count;

    // ── Within base limit ──
    if (used < baseLimit) {
      const remaining = baseLimit - used;
      return {
        allowed:          true,
        chatType,
        used,
        limit:            baseLimit,
        remaining,
        bonusGranted:     rec.bonus_granted,
        bonusUsed:        rec.bonus_count,
        isConverted:      rec.is_converted,
        nearLimit:        remaining <= 3,   // warn when ≤3 left
        bonusJustGiven:   false,
      };
    }

    // ── Bonus already granted — check if bonus questions remain ──
    if (rec.bonus_granted) {
      if (rec.bonus_count < BONUS) {
        return {
          allowed:        true,
          chatType,
          used,
          limit:          baseLimit,
          remaining:      BONUS - rec.bonus_count,
          bonusGranted:   true,
          bonusUsed:      rec.bonus_count,
          isBonus:        true,
          isConverted:    rec.is_converted,
          bonusJustGiven: false,
        };
      }
      // Bonus exhausted
      const resetAt = new Date(new Date(rec.last_reset_daily).getTime() + 86400000);
      return {
        allowed:      false,
        chatType,
        reason:       'daily_limit_exhausted',
        used,
        limit:        baseLimit + BONUS,
        remaining:    0,
        resetAt:      resetAt.toISOString(),
        isConverted:  rec.is_converted,
      };
    }

    // ── Base limit just hit → grant bonus (once per day) ──
    await supabaseAdmin
      .from('rate_limits')
      .update({ bonus_granted: true, updated_at: new Date().toISOString() })
      .eq('user_id',   userId)
      .eq('platform',  platform)
      .eq('chat_type', chatType);

    return {
      allowed:        true,
      chatType,
      used,
      limit:          baseLimit,
      remaining:      BONUS,
      bonusGranted:   true,
      bonusJustGiven: true,   // triggers special UI message
      bonusUsed:      0,
      isBonus:        true,
      isConverted:    rec.is_converted,
    };

  } catch (err) {
    console.error('Rate limit error:', err.message);
    return { allowed: true, remaining: 5 }; // fail open
  }
}

// ── Increment usage ──
export async function incrementUsage(userId, platform, chatType = 'agro') {
  try {
    const rec      = await getOrCreate(userId, platform, chatType);
    const baseLimit = chatType === 'product' ? PRODUCT_LIMIT : AGRO_LIMIT;
    const isBonus  = rec.daily_count >= baseLimit;

    await supabaseAdmin
      .from('rate_limits')
      .update({
        daily_count: rec.daily_count + 1,
        bonus_count: isBonus ? rec.bonus_count + 1 : rec.bonus_count,
        updated_at:  new Date().toISOString(),
      })
      .eq('user_id',   userId)
      .eq('platform',  platform)
      .eq('chat_type', chatType);
  } catch (err) {
    console.error('Increment error:', err.message);
  }
}

// ── Mark user as converted ──
export async function markConverted(userId, platform) {
  try {
    await supabaseAdmin
      .from('rate_limits')
      .update({
        is_converted:  true,
        conversion_at: new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      })
      .eq('user_id',   userId)
      .eq('platform',  platform)
      .eq('chat_type', 'product');
  } catch (err) {
    console.error('Mark converted error:', err.message);
  }
}

// ── Global daily cap ──
export async function checkGlobalLimit() {
  try {
    const today    = new Date().toISOString().split('T')[0];
    const CAP      = parseInt(process.env.DAILY_TOTAL_LIMIT) || 2000;
    const { data } = await supabaseAdmin
      .from('usage_stats')
      .select('total_questions')
      .eq('date', today)
      .single();

    const total = data?.total_questions || 0;
    return { allowed: total < CAP, used: total, limit: CAP };
  } catch {
    return { allowed: true };
  }
}

// ── Update usage stats ──
export async function updateStats(platform, {
  aiCall = false, cacheHit = false, blocked = false, nonAgro = false,
} = {}) {
  try {
    const today    = new Date().toISOString().split('T')[0];
    const { data } = await supabaseAdmin
      .from('usage_stats')
      .select('*')
      .eq('date', today)
      .eq('platform', platform)
      .single();

    const s = data || {
      date: today, platform,
      total_questions: 0, ai_calls: 0,
      cache_hits: 0, blocked_questions: 0, non_agro_rejected: 0,
    };

    s.total_questions  += 1;
    if (aiCall)   s.ai_calls            += 1;
    if (cacheHit) s.cache_hits           += 1;
    if (blocked)  s.blocked_questions    += 1;
    if (nonAgro)  s.non_agro_rejected    += 1;

    await supabaseAdmin
      .from('usage_stats')
      .upsert(s, { onConflict: 'date,platform' });
  } catch (err) {
    console.error('Stats error:', err.message);
  }
}

export default { checkRateLimit, incrementUsage, markConverted, checkGlobalLimit, updateStats };
