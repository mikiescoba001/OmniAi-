/* ============================================
   OmniAI — Input Validation (Zod Schemas)
   ============================================ */
'use strict';

const { z } = require('zod');

// --- Auth ---
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// --- AI ---
const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  conversationId: z.string().uuid().optional(),
});

const writingSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
  type: z.enum(['email', 'article', 'blog', 'social', 'product', 'script', 'resume', 'cover-letter', 'proposal', 'essay']).optional(),
  tone: z.enum(['professional', 'casual', 'persuasive', 'informative', 'creative', 'humorous']).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
});

const imageSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000, 'Prompt too long'),
  style: z.enum(['realistic', 'artistic', '3d', 'pixel', 'anime']).optional(),
});

const videoSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
  type: z.enum(['script', 'scene-plan', 'storyboard', 'voiceover', 'caption', 'hooks', 'thumbnail', 'prompt']).optional(),
});

// --- Productivity ---
const todoSchema = z.object({
  text: z.string().min(1, 'Task text is required').max(500, 'Task too long'),
});

const todoUpdateSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
});

const noteSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1, 'Content is required').max(50000),
});

// --- Documents ---
const documentQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000),
  documentId: z.string().uuid(),
});

// --- Business ---
const businessSchema = z.object({
  prompt: z.string().min(1, 'Description is required').max(5000),
  type: z.enum(['ideas', 'marketing', 'seo', 'brand', 'calendar', 'keywords']).optional(),
});

// --- Learning ---
const learningSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(2000),
  type: z.enum(['explain', 'flashcards', 'quiz', 'study-plan', 'roadmap']).optional(),
});

// --- Subscription ---
const createSubscriptionSchema = z.object({
  planId: z.enum(['premium_monthly', 'premium_annual']),
  paymentMethodId: z.string().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  chatSchema,
  writingSchema,
  imageSchema,
  videoSchema,
  todoSchema,
  todoUpdateSchema,
  noteSchema,
  documentQuerySchema,
  businessSchema,
  learningSchema,
  createSubscriptionSchema,
};