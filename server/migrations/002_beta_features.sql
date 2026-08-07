-- ============================================
-- OmniAI — Beta Feature Schema
-- Feedback, quality signals, analytics, errors
-- ============================================

-- ============================================
-- USER FEEDBACK (general)
-- ============================================
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature_request', 'performance', 'ai_quality', 'general')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

-- ============================================
-- AI RESPONSE QUALITY SIGNALS
-- ============================================
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  response_id TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  regenerated BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_feedback_feature ON ai_feedback(feature, created_at DESC);
CREATE INDEX idx_ai_feedback_rating ON ai_feedback(rating);

-- ============================================
-- PRODUCT ANALYTICS EVENTS (privacy-conscious)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  page TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_event ON analytics_events(event, created_at DESC);
CREATE INDEX idx_analytics_user_date ON analytics_events(user_id, created_at DESC);

-- ============================================
-- ERROR EVENTS (non-sensitive diagnostics)
-- ============================================
CREATE TABLE IF NOT EXISTS error_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('frontend', 'backend', 'ai', 'database', 'auth', 'file', 'payment')),
  message TEXT NOT NULL,
  status_code INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_events_created ON error_events(created_at DESC);
CREATE INDEX idx_error_events_category ON error_events(category);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own feedback
CREATE POLICY feedback_own ON feedback
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY ai_feedback_own ON ai_feedback
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY analytics_own ON analytics_events
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Error events are admin-only
CREATE POLICY errors_admin_only ON error_events
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
