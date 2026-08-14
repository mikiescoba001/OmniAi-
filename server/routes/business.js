import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimit } from '../middleware/rateLimit.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';
import { requireService } from '../middleware/validate.js';
import { generateCompletion, generateImage } from '../services/ai.js';
import { incrementUsage, saveImage } from '../models/database.js';

const router = Router();

// ── Business Ideas ──
router.post('/ideas', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { industry, keywords } = z.object({
    industry: z.string().min(1).max(500),
    keywords: z.string().optional(),
  }).parse(req.body);

  const result = await generateCompletion(
    `Generate innovative business ideas in the ${industry} industry${keywords ? ` focusing on: ${keywords}` : ''}. 
     For each idea include: name, problem solved, target market, and potential revenue model. 
     List 5-7 ideas with bullet points.`,
    'business', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { content: result });
}));

// ── Marketing Plan ──
router.post('/marketing-plan', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { business, budget, timeline } = z.object({
    business: z.string().min(1).max(1000),
    budget: z.string().optional().default('moderate'),
    timeline: z.string().optional().default('3 months'),
  }).parse(req.body);

  const plan = await generateCompletion(
    `Create a detailed marketing plan for: ${business}\nBudget: ${budget}\nTimeline: ${timeline}\n
     Include: target audience, channels, content strategy, budget allocation, KPIs, and timeline milestones.`,
    'business', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { plan });
}));

// ── Brand Names ──
router.post('/brand-names', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { industry, vibe } = z.object({
    industry: z.string().min(1).max(500),
    vibe: z.string().optional().default('modern'),
  }).parse(req.body);

  const names = await generateCompletion(
    `Generate 10 creative brand names for a ${vibe} ${industry} company.
     For each name, briefly explain the reasoning. Make names memorable, unique, and available as domains.`,
    'business', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { names });
}));

// ── SEO Content ──
router.post('/seo', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, keywords } = z.object({
    topic: z.string().min(1).max(500),
    keywords: z.string().optional(),
  }).parse(req.body);

  const seo = await generateCompletion(
    `Create SEO-optimized content for topic: "${topic}"${keywords ? `\nTarget keywords: ${keywords}` : ''}\n
     Include: meta title, meta description, header structure (H1-H3), keyword density recommendations, 
     internal linking suggestions, and a 300-word sample section.`,
    'seo', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { content: seo });
}));

// ── Content Calendar ──
router.post('/content-calendar', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { business, duration, channels } = z.object({
    business: z.string().min(1).max(500),
    duration: z.string().optional().default('1 month'),
    channels: z.string().optional().default('social media, blog, email'),
  }).parse(req.body);

  const calendar = await generateCompletion(
    `Create a ${duration} content calendar for: ${business}\nChannels: ${channels}\n
     Include: daily/weekly content themes, post types, best posting times, content pillars, 
     and engagement strategies. Format as a structured calendar.`,
    'business', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { calendar });
}));

// ── Logo Generation ──
router.post('/generate-logo', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { brand, style } = z.object({
    brand: z.string().min(1).max(500),
    style: z.string().optional().default('minimalist modern'),
  }).parse(req.body);

  const prompt = `A professional ${style} logo design for "${brand}", clean vector style, white background, centered, high contrast, suitable for a modern tech company`;
  const result = await generateImage(prompt, req.userId);

  await saveImage({
    user_id: req.userId,
    prompt: `Logo: ${brand}`,
    url: result.url,
    revised_prompt: result.revisedPrompt,
  });

  await incrementUsage(req.userId, 'image');
  return success(res, { url: result.url });
}));

export default router;