/**
 * Rate Limiter for AgroBot
 * Prevents abuse and controls costs
 */

import 'server-only';
import { supabaseAdmin } from './supabase';

const HOURLY_LIMIT = parseInt(process.env.RATE_LIMIT_HOURLY) || 10;
const DAILY_LIMIT = parseInt(process.env.RATE_LIMIT_DAILY) || 100;
const DAILY_TOTAL_LIMIT = parseInt(process.env.DAILY_TOTAL_LIMIT) || 500;

/**
 * Check if user is rate limited
 * @param {string} userId - User identifier (platform_user_id)
 * @param {string} platform - Platform (web, facebook)
 * @returns {object} - { allowed: boolean, reason?: string, remaining?: object }
 */
export async function checkRateLimit(userId, platform) {
  const now = new Date();
  
  try {
    // Get or create rate limit record
    let { data: rateLimit, error } = await supabaseAdmin
      .from('rate_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();
    
    if (!rateLimit) {
      // Create new record
      const { data: newRecord } = await supabaseAdmin
        .from('rate_limits')
        .insert({
          user_id: userId,
          platform,
          hourly_count: 0,
          daily_count: 0,
          last_reset_hourly: now.toISOString(),
          last_reset_daily: now.toISOString()
        })
        .select()
        .single();
      
      rateLimit = newRecord;
    }
    
    // Check if blocked
    if (rateLimit.blocked_until && new Date(rateLimit.blocked_until) > now) {
      return {
        allowed: false,
        reason: 'temporarily_blocked',
        unblockAt: rateLimit.blocked_until
      };
    }
    
    // Reset counters if needed
    const lastHourly = new Date(rateLimit.last_reset_hourly);
    const lastDaily = new Date(rateLimit.last_reset_daily);
    
    let hourlyCount = rateLimit.hourly_count;
    let dailyCount = rateLimit.daily_count;
    
    // Reset hourly counter (if more than 1 hour passed)
    if (now - lastHourly > 60 * 60 * 1000) {
      hourlyCount = 0;
      await supabaseAdmin
        .from('rate_limits')
        .update({ hourly_count: 0, last_reset_hourly: now.toISOString() })
        .eq('user_id', userId)
        .eq('platform', platform);
    }
    
    // Reset daily counter (if new day)
    if (now.toDateString() !== lastDaily.toDateString()) {
      dailyCount = 0;
      await supabaseAdmin
        .from('rate_limits')
        .update({ daily_count: 0, last_reset_daily: now.toISOString() })
        .eq('user_id', userId)
        .eq('platform', platform);
    }
    
    // Check limits
    if (hourlyCount >= HOURLY_LIMIT) {
      return {
        allowed: false,
        reason: 'hourly_limit',
        remaining: { hourly: 0, daily: DAILY_LIMIT - dailyCount }
      };
    }
    
    if (dailyCount >= DAILY_LIMIT) {
      return {
        allowed: false,
        reason: 'daily_limit',
        remaining: { hourly: 0, daily: 0 }
      };
    }
    
    return {
      allowed: true,
      remaining: {
        hourly: HOURLY_LIMIT - hourlyCount - 1,
        daily: DAILY_LIMIT - dailyCount - 1
      }
    };
    
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow on error (fail open for better UX)
    return { allowed: true };
  }
}

/**
 * Increment usage counter
 */
export async function incrementUsage(userId, platform) {
  try {
    const { data: current } = await supabaseAdmin
      .from('rate_limits')
      .select('hourly_count, daily_count')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();
    
    if (current) {
      await supabaseAdmin
        .from('rate_limits')
        .update({
          hourly_count: current.hourly_count + 1,
          daily_count: current.daily_count + 1
        })
        .eq('user_id', userId)
        .eq('platform', platform);
    }
  } catch (error) {
    console.error('Increment usage error:', error);
  }
}

/**
 * Check global daily limit
 */
export async function checkGlobalLimit() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data } = await supabaseAdmin
      .from('usage_stats')
      .select('total_questions')
      .eq('date', today)
      .single();
    
    const totalToday = data?.total_questions || 0;
    
    return {
      allowed: totalToday < DAILY_TOTAL_LIMIT,
      used: totalToday,
      limit: DAILY_TOTAL_LIMIT
    };
  } catch (error) {
    return { allowed: true };
  }
}

/**
 * Update usage statistics
 */
export async function updateStats(platform, { aiCall = false, cacheHit = false, blocked = false, nonAgro = false }) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get current stats
    const { data: current } = await supabaseAdmin
      .from('usage_stats')
      .select('*')
      .eq('date', today)
      .eq('platform', platform)
      .single();
    
    const stats = current || {
      date: today,
      platform,
      total_questions: 0,
      ai_calls: 0,
      cache_hits: 0,
      blocked_questions: 0,
      non_agro_rejected: 0
    };
    
    // Update counts
    stats.total_questions += 1;
    if (aiCall) stats.ai_calls += 1;
    if (cacheHit) stats.cache_hits += 1;
    if (blocked) stats.blocked_questions += 1;
    if (nonAgro) stats.non_agro_rejected += 1;
    
    // Upsert
    await supabaseAdmin
      .from('usage_stats')
      .upsert(stats, { onConflict: 'date,platform' });
      
  } catch (error) {
    console.error('Update stats error:', error);
  }
}

export default { checkRateLimit, incrementUsage, checkGlobalLimit, updateStats };
