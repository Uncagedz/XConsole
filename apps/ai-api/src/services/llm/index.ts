import { env } from '../../env.js';
import { MockLlmProvider } from './mock.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import type { LlmProvider } from './provider.js';

export function createLlmProvider(): LlmProvider {
  if (env.LLM_PROVIDER === 'openai') {
    return new OpenAiProvider();
  }

  if (env.LLM_PROVIDER === 'mock' && (env.NODE_ENV === 'test' || (env.NODE_ENV === 'development' && (env.USE_MOCK_AI || env.VITE_USE_MOCK_AI)))) {
    return new MockLlmProvider();
  }

  console.warn('LLM_PROVIDER=mock is ignored outside development/test. Real OpenAI generation will be used.');
  return new OpenAiProvider();
}
