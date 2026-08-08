/* ============================================
   OmniAI — AI Service (server-side only)
   API keys NEVER exposed to frontend.
   ============================================ */
'use strict';

const AI_TIMEOUT = 30000;

class AIError extends Error {
  constructor(message, code = 'AI_ERROR') {
    super(message);
    this.code = code;
    this.isOperational = true;
  }
}

/**
 * Call the configured AI provider (OpenAI or Anthropic)
 */
async function callAI(prompt, options = {}) {
  const {
    system = 'You are OmniAI, a helpful and knowledgeable AI assistant.',
    maxTokens = 2048,
    temperature = 0.7,
  } = options;

  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(prompt, system, maxTokens, temperature);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(prompt, system, maxTokens, temperature);
  }

  throw new AIError('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env');
}

async function callOpenAI(prompt, system, maxTokens, temperature) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI API error:', response.status, err.substring(0, 200));
      if (response.status === 429) throw new AIError('AI service rate limited. Please try again.');
      if (response.status === 401) throw new AIError('AI service authentication failed.');
      throw new AIError('AI service temporarily unavailable.');
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      tokens: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new AIError('AI request timed out. Please try again.');
    if (err instanceof AIError) throw err;
    throw new AIError('Failed to get AI response.');
  }
}

async function callAnthropic(prompt, system, maxTokens, temperature) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
        system,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err.substring(0, 200));
      throw new AIError('AI service temporarily unavailable.');
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      tokens: { input: 0, output: 0 },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new AIError('AI request timed out.');
    if (err instanceof AIError) throw err;
    throw new AIError('Failed to get AI response.');
  }
}

module.exports = { callAI, AIError };