import { Router } from 'express';
import { z } from 'zod';
import { generateChat, generateCompletion, generateImage } from '../services/ai.js';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimit } from '../middleware/rateLimit.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';
import { requireService } from '../middleware/validate.js';
import { saveChatMessage, getChatHistory, getUsage, incrementUsage, getProfile, saveImage, getImages } from '../models/database.js';
import config from '../config.js';

const router = Router();

// ── Usage limit check helper ──
async function checkUsageLimit(userId, type, res) {
  const profile = await getProfile(userId);
  const isPremium = profile?.plan === 'premium_monthly' || profile?.plan === 'premium_annual';
  const limits = isPremium ? config.usage.premium : config.usage.free;

  const limitMap = {
    chat: limits.chatMessagesPerDay,
    image: limits.imageGenerationsPerDay,
    writing: limits.writingGenerationsPerDay,
    upload: limits.documentUploadsPerDay,
    transform: limits.writingGenerationsPerDay,
  };

  const maxDaily = limitMap[type];
  if (!maxDaily) return true; // No limit for this type

  const usage = await getUsage(userId);
  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = usage.find(u => u.type === type && u.date === today);
  const used = todayUsage?.count || 0;

  if (used >= maxDaily) {
    const limitName = type === 'chat' ? 'AI messages' :
      type === 'image' ? 'image generations' :
      type === 'writing' ? 'writing generations' : 'operations';
    throw {
      status: 429,
      code: ErrorCodes.AI_USAGE_LIMIT,
      message: `Daily ${limitName} limit reached (${maxDaily}/${maxDaily}). Upgrade to Premium for unlimited access.`,
    };
  }

  return true;
}

// ── Chat ──
router.post('/chat', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { message } = z.object({ message: z.string().min(1).max(config.usage.free.maxPromptLength) }).parse(req.body);

  await checkUsageLimit(req.userId, 'chat', res);

  // Save user message
  await saveChatMessage({ user_id: req.userId, role: 'user', content: message });

  // Get conversation history
  const history = await getChatHistory(req.userId, 20);
  const messages = history.map(m => ({ role: m.role, content: m.content }));

  // Generate AI response
  const reply = await generateChat(messages, req.userId);

  // Save AI response
  await saveChatMessage({ user_id: req.userId, role: 'assistant', content: reply });
  await incrementUsage(req.userId, 'chat');

  return success(res, { reply });
}));

// ── Writing ──
router.post('/write', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { prompt, type, tone, length } = z.object({
    prompt: z.string().min(1).max(config.usage.free.maxPromptLength),
    type: z.string().optional().default('writing'),
    tone: z.string().optional(),
    length: z.string().optional(),
  }).parse(req.body);

  await checkUsageLimit(req.userId, 'writing', res);

  const result = await generateCompletion(prompt, type, req.userId, { tone, length });
  await incrementUsage(req.userId, 'writing');

  return success(res, { content: result });
}));

// ── Text Transform ──
router.post('/transform', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { text, action } = z.object({
    text: z.string().min(1).max(config.usage.free.maxPromptLength * 3),
    action: z.enum(['improve', 'rewrite', 'shorten', 'expand', 'grammar', 'translate']),
  }).parse(req.body);

  await checkUsageLimit(req.userId, 'transform', res);

  const { targetLang } = req.body;
  const result = await generateCompletion(text, action, req.userId, { targetLang });
  await incrementUsage(req.userId, 'transform');

  return success(res, { content: result });
}));

// ── Brainstorm ──
router.post('/brainstorm', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic } = z.object({ topic: z.string().min(1).max(2000) }).parse(req.body);

  await checkUsageLimit(req.userId, 'writing', res);

  const result = await generateCompletion(topic, 'brainstorm', req.userId);
  await incrementUsage(req.userId, 'writing');

  return success(res, { ideas: result });
}));

// ── Summarize ──
router.post('/summarize', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().min(1).max(50000) }).parse(req.body);

  await checkUsageLimit(req.userId, 'writing', res);

  const result = await generateCompletion(text, 'summarize', req.userId);
  await incrementUsage(req.userId, 'writing');

  return success(res, { summary: result });
}));

// ── Image Generation ──
router.post('/generate-image', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { prompt } = z.object({ prompt: z.string().min(1).max(2000) }).parse(req.body);

  await checkUsageLimit(req.userId, 'image', res);

  const result = await generateImage(prompt, req.userId);

  await saveImage({
    user_id: req.userId,
    prompt,
    url: result.url,
    revised_prompt: result.revisedPrompt,
  });
  await incrementUsage(req.userId, 'image');

  return success(res, { url: result.url, revisedPrompt: result.revisedPrompt });
}));

// ── Chat History ──
router.get('/chat-history', authenticate, asyncHandler(async (req, res) => {
  const history = await getChatHistory(req.userId, 50);
  return success(res, { history });
}));

// ── Image History ──
router.get('/image-history', authenticate, asyncHandler(async (req, res) => {
  const images = await getImages(req.userId);
  return success(res, { images });
}));

// ── Usage Stats ──
router.get('/usage', authenticate, asyncHandler(async (req, res) => {
  const profile = await getProfile(req.userId);
  const isPremium = profile?.plan === 'premium_monthly' || profile?.plan === 'premium_annual';
  const limits = isPremium ? config.usage.premium : config.usage.free;

  const usage = await getUsage(req.userId);
  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = usage.filter(u => u.date === today);

  return success(res, {
    usage: {
      chat: todayUsage.find(u => u.type === 'chat')?.count || 0,
      image: todayUsage.find(u => u.type === 'image')?.count || 0,
      writing: todayUsage.find(u => u.type === 'writing')?.count || 0,
      transform: todayUsage.find(u => u.type === 'transform')?.count || 0,
      brainstorm: todayUsage.find(u => u.type === 'brainstorm')?.count || 0,
      summarize: todayUsage.find(u => u.type === 'summarize')?.count || 0,
    },
    limits: {
      chat: limits.chatMessagesPerDay,
      image: limits.imageGenerationsPerDay,
      writing: limits.writingGenerationsPerDay,
    },
    plan: isPremium ? 'premium' : 'free',
  });
}));

export default router;