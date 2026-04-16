/**
 * Chat API Endpoint
 * POST /api/chat
 * 
 * Receives questions, checks rate limits, calls AgroBot AI
 */

import { getAgroResponse } from '@/lib/gemini';
import { checkRateLimit, incrementUsage, checkGlobalLimit, updateStats } from '@/lib/rate-limiter';

export async function POST(request) {
  try {
    const body = await request.json();
    const { question, userId, platform = 'web' } = body;
    
    // Validate input
    if (!question || typeof question !== 'string') {
      return Response.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }
    
    if (question.length > 1000) {
      return Response.json(
        { error: 'Question too long (max 1000 characters)' },
        { status: 400 }
      );
    }
    
    // Generate user ID if not provided
    const finalUserId = userId || `anon_${request.headers.get('x-forwarded-for') || 'unknown'}`;
    
    // Check global daily limit
    const globalCheck = await checkGlobalLimit();
    if (!globalCheck.allowed) {
      await updateStats(platform, { blocked: true });
      return Response.json({
        success: false,
        response: 'আজকের জন্য সর্বোচ্চ সীমা পৌঁছে গেছে। অনুগ্রহ করে আগামীকাল আবার চেষ্টা করুন। / Daily limit reached. Please try again tomorrow.',
        reason: 'global_limit'
      }, { status: 429 });
    }
    
    // Check user rate limit
    const rateCheck = await checkRateLimit(finalUserId, platform);
    if (!rateCheck.allowed) {
      await updateStats(platform, { blocked: true });
      
      const messages = {
        hourly_limit: 'আপনি প্রতি ঘণ্টায় সর্বোচ্চ প্রশ্ন জিজ্ঞাসা করেছেন। অনুগ্রহ করে পরে আবার চেষ্টা করুন। / You have reached your hourly limit. Please try again later.',
        daily_limit: 'আপনি আজকের জন্য সর্বোচ্চ প্রশ্ন জিজ্ঞাসা করেছেন। আগামীকাল আবার চেষ্টা করুন। / You have reached your daily limit. Please try again tomorrow.',
        temporarily_blocked: 'আপনাকে সাময়িকভাবে ব্লক করা হয়েছে। / You are temporarily blocked.'
      };
      
      return Response.json({
        success: false,
        response: messages[rateCheck.reason] || 'Rate limited',
        reason: rateCheck.reason,
        remaining: rateCheck.remaining
      }, { status: 429 });
    }
    
    // Get AgroBot response
    const result = await getAgroResponse(question);
    
    // Update usage
    await incrementUsage(finalUserId, platform);
    await updateStats(platform, {
      aiCall: result.success && !result.cached,
      cacheHit: result.cached,
      nonAgro: !result.isAgro
    });
    
    return Response.json({
      success: result.success,
      response: result.response,
      isAgro: result.isAgro,
      cached: result.cached,
      language: result.language,
      remaining: rateCheck.remaining
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return Response.json({ 
    status: 'ok', 
    service: 'AgroBot AI',
    version: '1.0.0'
  });
}
