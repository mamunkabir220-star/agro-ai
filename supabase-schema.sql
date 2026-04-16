-- ============================================
-- AGROBOT AI - DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. AI CACHE TABLE (saves Gemini API costs)
CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) UNIQUE NOT NULL,
  query_text TEXT NOT NULL,
  response TEXT NOT NULL,
  language VARCHAR(5) DEFAULT 'bn',
  hit_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- 2. RATE LIMITS TABLE (prevents abuse)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  hourly_count INT DEFAULT 0,
  daily_count INT DEFAULT 0,
  last_reset_hourly TIMESTAMPTZ DEFAULT NOW(),
  last_reset_daily TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  UNIQUE(user_id, platform)
);

-- 3. USAGE STATS TABLE (monitor usage)
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  platform VARCHAR(20) NOT NULL,
  total_questions INT DEFAULT 0,
  ai_calls INT DEFAULT 0,
  cache_hits INT DEFAULT 0,
  blocked_questions INT DEFAULT 0,
  non_agro_rejected INT DEFAULT 0,
  UNIQUE(date, platform)
);

-- 4. CONVERSATIONS TABLE (for Facebook Messenger)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,
  platform_user_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);

-- 5. MESSAGES TABLE (conversation history)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON ai_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON rate_limits(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON usage_stats(date);
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform, platform_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for service role access
CREATE POLICY "Service role full access on ai_cache" ON ai_cache FOR ALL USING (true);
CREATE POLICY "Service role full access on rate_limits" ON rate_limits FOR ALL USING (true);
CREATE POLICY "Service role full access on usage_stats" ON usage_stats FOR ALL USING (true);
CREATE POLICY "Service role full access on conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "Service role full access on messages" ON messages FOR ALL USING (true);

-- ============================================
-- DONE! Your database is ready.
-- ============================================
