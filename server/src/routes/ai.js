/* ============================================
   OmniAI — AI Processing Routes
   All AI requests go through the backend.
   API keys NEVER exposed to the frontend.
   ============================================ */
'use strict';

const { Router } = require('express');
const { authenticate, loadSubscription } = require('../middleware/auth');
const { checkUsageLimit, logUsage } = require('../middleware/usage');
const {
  chatSchema, writingSchema, imageSchema, videoSchema,
  businessSchema, learningSchema,
} = require('../utils/validators');
const { success } = require('../utils/response');
const { supabase } = require('../db/supabase');
const { callAI, AIError } = require('../services/ai-service');

const router = Router();

// All AI routes require authentication + subscription info + usage limits
router.use(authenticate, loadSubscription);

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/ai/chat
 * Universal AI chat
 */
router.post('/chat', checkUsageLimit('ai_chat'), async (req, res, next) => {
  try {
    const { message, conversationId } = chatSchema.parse(req.body);

    // Create or get conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv } = await supabase.from('conversations').insert({
        user_id: req.user.id,
        title: message.substring(0, 80),
        type: 'chat',
      }).select('id').single();
      convId = conv.id;
    }

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: convId,
      user_id: req.user.id,
      role: 'user',
      content: message,
    });

    // Get conversation history for context
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    const contextPrompt = history
      ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n') + `\n\nAssistant:`
      : message;

    // Call AI
    const result = await callAI(contextPrompt, {
      system: 'You are OmniAI, a helpful AI assistant. Respond conversationally and thoroughly.',
    });

    // Save assistant message
    await supabase.from('messages').insert({
      conversation_id: convId,
      user_id: req.user.id,
      role: 'assistant',
      content: result.content,
      tokens: result.tokens.output,
    });

    // Log usage
    await logUsage(req.user.id, 'ai_chat', {
      conversation_id: convId,
      tokens: result.tokens,
    });

    success(res, {
      conversationId: convId,
      message: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/writing
 * AI Writing Studio
 */
router.post('/writing', checkUsageLimit('ai_writing'), async (req, res, next) => {
  try {
    const { prompt, type = 'article', tone = 'professional', length = 'medium' } = writingSchema.parse(req.body);

    const lengthGuide = { short: '2-3 paragraphs', medium: '4-6 paragraphs', long: '7-10 paragraphs' };

    const systemPrompt = `You are a professional ${type} writer. Write in a ${tone} tone. Output approximately ${lengthGuide[length] || lengthGuide.medium}. Format clearly with proper structure.`;

    const result = await callAI(prompt, { system: systemPrompt });

    // Save to generated content
    await supabase.from('generated_content').insert({
      user_id: req.user.id,
      type: `writing_${type}`,
      prompt,
      content: result.content,
      metadata: { tone, length },
    });

    await logUsage(req.user.id, 'ai_writing', { type, tone, length });

    success(res, {
      content: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/image
 * AI Image Generation (prompt only — actual image gen requires external API)
 */
router.post('/image', checkUsageLimit('ai_image'), async (req, res, next) => {
  try {
    const { prompt, style = 'realistic' } = imageSchema.parse(req.body);

    if (process.env.OPENAI_API_KEY) {
      // Use DALL-E for actual image generation
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `${style} style: ${prompt}`,
          n: 1,
          size: '1024x1024',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('DALL-E error:', response.status, err);
        throw new AIError('Image generation failed.');
      }

      const data = await response.json();

      // Save to images table
      const { data: image } = await supabase.from('images').insert({
        user_id: req.user.id,
        prompt,
        url: data.data[0].url,
        style,
      }).select('id, url, prompt, created_at').single();

      await logUsage(req.user.id, 'ai_image', { style });

      return success(res, { image });
    }

    // Fallback: generate image prompt only (for video/image planning)
    const result = await callAI(
      `Create a detailed image generation prompt based on this description: "${prompt}". Style: ${style}. Return only the enhanced prompt.`,
      { system: 'You are an expert image prompt engineer.' }
    );

    await logUsage(req.user.id, 'ai_image', { style });

    success(res, {
      enhancedPrompt: result.content,
      note: 'Image generation requires an OpenAI API key with DALL-E access.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/video
 * AI Video Studio
 */
router.post('/video', checkUsageLimit('ai_video'), async (req, res, next) => {
  try {
    const { prompt, type = 'script' } = videoSchema.parse(req.body);

    const systemPrompts = {
      script: 'You are a professional video scriptwriter. Create a detailed video script with scene descriptions, dialogue, and timings.',
      'scene-plan': 'Create a detailed scene-by-scene plan for a video.',
      storyboard: 'Create a text-based storyboard with visual descriptions for each shot.',
      voiceover: 'Write a professional voice-over script.',
      caption: 'Generate engaging captions and descriptions for video platforms.',
      hooks: 'Generate 10 attention-grabbing hook ideas for the video.',
      thumbnail: 'Generate 5 thumbnail concept ideas with visual descriptions.',
      prompt: 'Generate a detailed video generation prompt.',
    };

    const system = systemPrompts[type] || systemPrompts.script;

    const result = await callAI(prompt, { system });

    await logUsage(req.user.id, 'ai_video', { type });

    success(res, {
      content: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/learning
 * AI Learning Center
 */
router.post('/learning', checkUsageLimit('ai_learning'), async (req, res, next) => {
  try {
    const { topic, type = 'explain' } = learningSchema.parse(req.body);

    const systemPrompts = {
      explain: 'You are a patient and knowledgeable tutor. Explain the topic clearly with examples and analogies.',
      flashcards: 'Create a set of 5-10 flashcards for this topic. Format as Q&A pairs.',
      quiz: 'Create a 5-question multiple choice quiz about this topic. Include answer key.',
      'study-plan': 'Create a 4-week study plan for mastering this topic.',
      roadmap: 'Create a learning roadmap from beginner to advanced for this topic.',
    };

    const system = systemPrompts[type] || systemPrompts.explain;

    const result = await callAI(topic, { system });

    await logUsage(req.user.id, 'ai_learning', { type });

    success(res, {
      content: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/business
 * Business & Marketing AI
 */
router.post('/business', checkUsageLimit('ai_business'), async (req, res, next) => {
  try {
    const { prompt, type = 'ideas' } = businessSchema.parse(req.body);

    const systemPrompts = {
      ideas: 'You are a business strategy consultant. Generate innovative business ideas with market analysis.',
      marketing: 'Create a comprehensive marketing plan with channels, budget allocation, and KPIs.',
      seo: 'Generate SEO-optimized content strategy with keywords and meta descriptions.',
      brand: 'Help create brand identity: name ideas, slogans, mission, values, and visual direction.',
      calendar: 'Create a 30-day content calendar with post ideas for each day.',
      keywords: 'Generate a list of high-value keywords with search intent analysis.',
    };

    const system = systemPrompts[type] || systemPrompts.ideas;

    const result = await callAI(prompt, { system });

    await logUsage(req.user.id, 'ai_business', { type });

    success(res, {
      content: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/conversations
 * List user's conversations
 */
router.get('/conversations', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;

    const { data: conversations, error, count } = await supabase
      .from('conversations')
      .select('id, title, type, created_at, updated_at', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    success(res, {
      conversations: conversations || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/conversations/:id
 * Get conversation with messages
 */
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    success(res, { messages: messages || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/usage
 * Get current user's usage stats
 */
router.get('/usage', async (req, res, next) => {
  try {
    const { getRemainingUsage } = require('../middleware/usage');
    const plan = req.subscription?.plan || 'free';
    const usage = await getRemainingUsage(req.user.id, plan);

    success(res, {
      plan,
      usage,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/history/:type
 * Get user's generated content history
 */
router.get('/history/:type', async (req, res, next) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('generated_content')
      .select('id, type, prompt, content, created_at', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type !== 'all') {
      query = query.eq('type', type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    success(res, {
      items: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;