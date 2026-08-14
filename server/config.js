import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: '7d',
    refreshExpiresIn: '30d',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: 4096,
    // Cost protection: maximum spend per user per day (in USD)
    maxDailySpendPerUser: 1.00,
    maxMonthlySpendPerUser: 10.00,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  rateLimit: {
    windowMs: 60 * 1000,
    freeMax: 10,
    premiumMax: 60,
    authMax: 5,
  },

  usage: {
    free: {
      chatMessagesPerDay: 30,
      imageGenerationsPerDay: 3,
      documentUploadsPerDay: 3,
      writingGenerationsPerDay: 20,
      maxPromptLength: 2000,
      maxOutputLength: 2000,
    },
    premium: {
      chatMessagesPerDay: 1000,
      imageGenerationsPerDay: 100,
      documentUploadsPerDay: 50,
      writingGenerationsPerDay: 500,
      maxPromptLength: 8000,
      maxOutputLength: 8000,
    },
  },

  upload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    allowedExtensions: ['.pdf', '.txt', '.docx'],
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  // AI provider cost per 1K tokens (approximate, in USD)
  aiCosts: {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'dall-e-3': { perImage: 0.04 },
    default: { input: 0.00015, output: 0.0006 },
  },
};