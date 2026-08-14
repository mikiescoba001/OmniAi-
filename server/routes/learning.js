import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimit } from '../middleware/rateLimit.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';
import { requireService } from '../middleware/validate.js';
import { generateCompletion } from '../services/ai.js';
import { getFlashcards, saveFlashcard, incrementUsage } from '../models/database.js';

const router = Router();

// ── Explain Topic ──
router.post('/explain', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, level } = z.object({
    topic: z.string().min(1).max(2000),
    level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  }).parse(req.body);

  const prompt = `Explain "${topic}" at a ${level} level. Use analogies, examples, and clear language. Break down complex concepts into digestible parts.`;
  const explanation = await generateCompletion(prompt, 'learning', req.userId);
  await incrementUsage(req.userId, 'writing');

  return success(res, { content: explanation });
}));

// ── Generate Flashcards ──
router.post('/flashcards', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, count } = z.object({
    topic: z.string().min(1).max(2000),
    count: z.number().min(3).max(20).optional().default(8),
  }).parse(req.body);

  const result = await generateCompletion(
    `Create ${count} flashcards about: ${topic}. Format each as:\nQ: [question]\nA: [answer]\n---`,
    'flashcards', req.userId
  );

  // Parse flashcards from result
  const cards = result.split('---').filter(Boolean).map(block => {
    const lines = block.trim().split('\n');
    const q = lines.find(l => l.startsWith('Q:'))?.replace('Q:', '').trim() || '';
    const a = lines.find(l => l.startsWith('A:'))?.replace('A:', '').trim() || '';
    return { question: q, answer: a };
  }).filter(c => c.question && c.answer);

  // Save to database
  for (const card of cards) {
    await saveFlashcard({ user_id: req.userId, ...card, topic });
  }

  await incrementUsage(req.userId, 'writing');
  return success(res, { flashcards: cards });
}));

// ── Generate Quiz ──
router.post('/quiz', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, count } = z.object({
    topic: z.string().min(1).max(2000),
    count: z.number().min(3).max(10).optional().default(5),
  }).parse(req.body);

  const quiz = await generateCompletion(
    `Create a ${count}-question quiz about: "${topic}". Each question must have 4 options (a-d). Mark the correct answer with [CORRECT]. Format clearly.`,
    'quiz', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { quiz });
}));

// ── Study Plan ──
router.post('/study-plan', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, duration, hoursPerDay } = z.object({
    topic: z.string().min(1).max(2000),
    duration: z.string().optional().default('2 weeks'),
    hoursPerDay: z.number().min(0.5).max(8).optional().default(1),
  }).parse(req.body);

  const plan = await generateCompletion(
    `Create a detailed ${duration} study plan for learning "${topic}", studying ${hoursPerDay} hour(s) per day. Include daily topics, resources, and practice exercises.`,
    'learning', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { plan });
}));

// ── Learning Roadmap ──
router.post('/roadmap', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { topic, level } = z.object({
    topic: z.string().min(1).max(2000),
    level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  }).parse(req.body);

  const roadmap = await generateCompletion(
    `Create a complete learning roadmap for "${topic}" starting from ${level} level. Break it into phases with specific topics, skills, and milestones for each phase.`,
    'learning', req.userId
  );

  await incrementUsage(req.userId, 'writing');
  return success(res, { roadmap });
}));

// ── Get Saved Flashcards ──
router.get('/flashcards', authenticate, asyncHandler(async (req, res) => {
  const cards = await getFlashcards(req.userId);
  return success(res, { flashcards: cards });
}));

export default router;