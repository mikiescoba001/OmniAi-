import OpenAI from 'openai';
import config from '../config.js';

let openai = null;
if (config.openai.apiKey) {
  openai = new OpenAI({
    apiKey: config.openai.apiKey,
    timeout: 30000,
    maxRetries: 2,
  });
}

/**
 * Validates that OpenAI is configured
 * @throws {Error} If OpenAI API key is not set
 */
function ensureAI() {
  if (!openai) {
    const error = new Error('AI service is not available. OpenAI API key is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
}

// ── System prompts ──
const SYSTEM_PROMPTS = {
  chat: `You are OmniAI, a helpful, accurate, and thoughtful AI assistant. You help users with questions, explanations, brainstorming, research, writing, and more. Be concise but thorough. Use markdown formatting when helpful. Keep responses under 500 words unless asked for detail.`,

  writing: `You are an expert professional writer. Generate high-quality, polished content based on the user's request. Follow their specified tone, length, and format. Return only the final content without explanation.`,

  improve: `Improve the following text while preserving its meaning. Fix grammar, enhance clarity, and improve flow. Return only the improved text.`,

  rewrite: `Rewrite the following text in a fresh way while preserving the core message. Use a different sentence structure and vocabulary. Return only the rewritten text.`,

  shorten: `Shorten the following text to its essential message while preserving key information. Return only the shortened version.`,

  expand: `Expand on the following text with more detail, examples, and depth. Return only the expanded version.`,

  grammar: `Fix all grammar, spelling, and punctuation errors in the following text. Preserve the original meaning and style. Return only the corrected text.`,

  translate: `Translate the following text to the specified language. Preserve tone and meaning. Return only the translation.`,

  summarize: `Summarize the following text concisely, capturing key points and main ideas. Return only the summary.`,

  brainstorm: `Brainstorm creative ideas based on the user's prompt. List 5-10 diverse, actionable ideas. Use bullet points.`,

  image: `Generate a detailed, high-quality image prompt for an AI image generator. Include subject, style, lighting, composition, and mood. Return only the prompt.`,

  flashcards: `Create a set of 5-10 flashcards from the given topic or text. Format each as:
Q: [question]
A: [answer]
Separate each card with a blank line.`,

  quiz: `Create a 5-question quiz from the given topic. Each question should have 4 options (a-d) with the correct answer indicated. Format clearly.`,

  business: `You are an expert business consultant and marketing strategist. Provide actionable, data-driven business advice, plans, and analysis. Be specific and practical.`,

  learning: `You are a patient, expert tutor. Explain concepts clearly, use analogies, and check understanding. Break down complex topics into digestible parts.`,

  seo: `Generate SEO-optimized content including keywords, meta description, and content suggestions. Be specific with keyword recommendations.`,

  script: `You are an expert video script writer. Create engaging, well-structured video scripts with scene directions, dialogue, and timing notes.`,

  storyboard: `Create a detailed storyboard plan with scene descriptions, camera angles, transitions, and visual notes.`,

  hooks: `Generate attention-grabbing video hook ideas. Each hook should be compelling and designed to stop viewers from scrolling.`,

  captions: `Write engaging video captions, descriptions, and CTAs optimized for social media platforms.`,

  thumbnail: `Generate creative thumbnail ideas for videos, including visual concepts, text overlays, and color schemes.`,
};

/**
 * AI Chat completion
 */
export async function generateChat(messages, userId = 'anonymous') {
  ensureAI();
  try {
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.chat },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
      temperature: 0.7,
      user: userId,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    if (err.status === 429) {
      throw Object.assign(new Error('AI service is currently overloaded. Please try again in a moment.'), { code: 'AI_RATE_LIMIT', status: 429 });
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      throw Object.assign(new Error('AI request timed out. Please try again.'), { code: 'AI_TIMEOUT', status: 504 });
    }
    throw Object.assign(new Error('AI service error. Please try again later.'), { code: 'AI_FAILED', status: 503 });
  }
}

/**
 * AI Completion for various content types
 */
export async function generateCompletion(prompt, type = 'writing', userId = 'anonymous', extra = {}) {
  ensureAI();
  const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.chat;

  const messages = [{ role: 'system', content: systemPrompt }];

  if (type === 'translate' && extra.targetLang) {
    messages[0].content += `\nTranslate to: ${extra.targetLang}`;
  }

  if (type === 'writing') {
    if (extra.tone) messages[0].content += `\nTone: ${extra.tone}`;
    if (extra.length) messages[0].content += `\nLength: ${extra.length}`;
  }

  messages.push({ role: 'user', content: prompt });

  try {
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      max_tokens: type === 'shorten' ? 256 : 1536,
      temperature: type === 'brainstorm' ? 0.9 : 0.7,
      user: userId,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    if (err.status === 429) {
      throw Object.assign(new Error('AI service is currently overloaded. Please try again in a moment.'), { code: 'AI_RATE_LIMIT', status: 429 });
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      throw Object.assign(new Error('AI request timed out. Please try again.'), { code: 'AI_TIMEOUT', status: 504 });
    }
    throw Object.assign(new Error('AI service error. Please try again later.'), { code: 'AI_FAILED', status: 503 });
  }
}

/**
 * Generate an image using DALL-E
 */
export async function generateImage(prompt, userId = 'anonymous') {
  ensureAI();

  // First, enhance the prompt
  let enhancedPrompt;
  try {
    enhancedPrompt = await generateCompletion(
      `Create a detailed image generation prompt from: "${prompt}". Make it vivid and specific. Return ONLY the prompt, nothing else.`,
      'image', userId
    );
  } catch {
    // If prompt enhancement fails, use the original
    enhancedPrompt = prompt;
  }

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: enhancedPrompt.substring(0, 1000), // DALL-E has a 1000 char limit
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
      user: userId,
    });

    return {
      url: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt || enhancedPrompt,
    };
  } catch (err) {
    if (err.status === 429) {
      throw Object.assign(new Error('Image generation is temporarily unavailable. Please try again.'), { code: 'AI_RATE_LIMIT', status: 429 });
    }
    if (err.message?.includes('content_policy_violation')) {
      throw Object.assign(new Error('Image prompt was flagged by content policy. Please try a different description.'), { code: 'CONTENT_POLICY', status: 400 });
    }
    throw Object.assign(new Error('Image generation failed. Please try again.'), { code: 'IMAGE_FAILED', status: 503 });
  }
}