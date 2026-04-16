/**
 * Facebook Messenger Webhook
 * GET /api/webhook/meta - Verification
 * POST /api/webhook/meta - Receive messages
 */

import { getAgroResponse } from '@/lib/gemini';
import { checkRateLimit, incrementUsage, updateStats } from '@/lib/rate-limiter';
import { supabaseAdmin } from '@/lib/supabase';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

/**
 * Webhook Verification (GET)
 * Facebook sends this to verify your webhook URL
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    return new Response(challenge, { status: 200 });
  }
  
  return new Response('Forbidden', { status: 403 });
}

/**
 * Receive Messages (POST)
 * Facebook sends messages here
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    // Check if this is a page event
    if (body.object !== 'page') {
      return Response.json({ status: 'ignored' });
    }
    
    // Process each entry
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        await handleMessage(event);
      }
    }
    
    return Response.json({ status: 'ok' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Handle incoming message
 */
async function handleMessage(event) {
  const senderId = event.sender?.id;
  const message = event.message;
  
  if (!senderId || !message?.text) {
    return; // Ignore non-text messages
  }
  
  const question = message.text;
  const platform = 'facebook';
  
  console.log(`📩 Message from ${senderId}: ${question}`);
  
  // Check rate limit
  const rateCheck = await checkRateLimit(senderId, platform);
  
  if (!rateCheck.allowed) {
    await sendMessage(senderId, '⏳ আপনি সর্বোচ্চ সীমায় পৌঁছে গেছেন। অনুগ্রহ করে পরে আবার চেষ্টা করুন।\n\nYou have reached your limit. Please try again later.');
    await updateStats(platform, { blocked: true });
    return;
  }
  
  // Save conversation
  await saveConversation(senderId, question, platform);
  
  // Get AgroBot response
  const result = await getAgroResponse(question);
  
  // Send response
  await sendMessage(senderId, result.response);
  
  // Save bot response
  await saveMessage(senderId, result.response, 'bot', platform);
  
  // Update usage
  await incrementUsage(senderId, platform);
  await updateStats(platform, {
    aiCall: result.success && !result.cached,
    cacheHit: result.cached,
    nonAgro: !result.isAgro
  });
}

/**
 * Send message via Facebook Messenger API
 */
async function sendMessage(recipientId, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.error('Missing PAGE_ACCESS_TOKEN');
    return;
  }
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE'
        })
      }
    );
    
    const result = await response.json();
    
    if (result.error) {
      console.error('Facebook API error:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('Send message error:', error);
  }
}

/**
 * Save conversation to database
 */
async function saveConversation(userId, message, platform) {
  try {
    // Upsert conversation
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .upsert({
        platform,
        platform_user_id: userId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'platform,platform_user_id' })
      .select()
      .single();
    
    // Save user message
    if (conv) {
      await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conv.id,
          sender: 'user',
          content: message
        });
    }
  } catch (error) {
    console.error('Save conversation error:', error);
  }
}

/**
 * Save bot message to database
 */
async function saveMessage(userId, message, sender, platform) {
  try {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('platform', platform)
      .eq('platform_user_id', userId)
      .single();
    
    if (conv) {
      await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conv.id,
          sender,
          content: message
        });
    }
  } catch (error) {
    console.error('Save message error:', error);
  }
}
