import { env } from '../../env.js';
import { forbidden } from '../../lib/errors.js';
import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from './provider.js';

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function flattenResponseText(data: unknown) {
  const response = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (response.output_text) return response.output_text;

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join('\n') ?? ''
  );
}

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class OpenAiProvider implements LlmProvider {
  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    if (!env.OPENAI_API_KEY) {
      throw forbidden('OpenAI API key is not configured');
    }

    const rawTemperature = numberFromEnv(process.env.OPENAI_TEMPERATURE, 1.2);
    const temperature = clamp(rawTemperature, 0, 2);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
        temperature,
        input: [
          {
            role: 'system',
            content: input.system,
          },
          {
            role: 'user',
            content: input.user,
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const text = flattenResponseText(data);

    return {
      text,
      provider: 'openai',
      model: env.OPENAI_MODEL,
      inputTokens: data.usage?.input_tokens ?? estimateTokens(input.system + input.user),
      outputTokens: data.usage?.output_tokens ?? estimateTokens(text),
    };
  }
}
