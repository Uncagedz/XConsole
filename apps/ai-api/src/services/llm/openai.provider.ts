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

function booleanFromEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function reasoningEffortFromEnv(value: string | undefined) {
  const effort = value?.trim().toLowerCase();
  return effort === 'low' || effort === 'medium' || effort === 'high' ? effort : 'high';
}

function modelLikelySupportsReasoning(model: string) {
  return /^(gpt-5|o[1-9])(?:[.-]|$)/i.test(model.trim());
}

function canRetryWithoutParameter(status: number, body: string, parameter: 'temperature' | 'reasoning') {
  if (status !== 400 || !new RegExp(`\\b${parameter}\\b`, 'i').test(body)) return false;
  return /(unsupported|not supported|unknown parameter|invalid|only supports|must be)/i.test(body);
}

type ResponsesRequest = {
  model: string;
  max_output_tokens: number;
  input: Array<{ role: 'system' | 'user'; content: string }>;
  text: { format: { type: 'json_object' } };
  temperature?: number;
  reasoning?: { effort: 'low' | 'medium' | 'high' };
};

export class OpenAiProvider implements LlmProvider {
  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    if (!env.OPENAI_API_KEY) {
      throw forbidden('OpenAI API key is not configured');
    }

    // The creative settings are deliberately best-effort. Reasoning models and
    // non-reasoning models do not all accept the same Responses API parameters.
    // A capability mismatch should never prevent a salesperson from receiving a reply.
    const rawTemperature = numberFromEnv(process.env.AI_TEMPERATURE ?? process.env.OPENAI_TEMPERATURE, 1.5);
    const responseVariety = booleanFromEnv(process.env.AI_RESPONSE_VARIETY, true);
    const request: ResponsesRequest = {
      model: env.OPENAI_MODEL,
      max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    };

    if (responseVariety) request.temperature = clamp(rawTemperature, 1, 2);
    if (modelLikelySupportsReasoning(env.OPENAI_MODEL)) {
      request.reasoning = { effort: reasoningEffortFromEnv(process.env.AI_REASONING_EFFORT) };
    }

    let response: Response | undefined;
    let failureBody = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.ok) break;
      failureBody = await response.text();

      const removeTemperature = request.temperature !== undefined && canRetryWithoutParameter(response.status, failureBody, 'temperature');
      const removeReasoning = request.reasoning !== undefined && canRetryWithoutParameter(response.status, failureBody, 'reasoning');
      if (!removeTemperature && !removeReasoning) break;
      if (removeTemperature) delete request.temperature;
      if (removeReasoning) delete request.reasoning;
    }

    if (!response?.ok) {
      throw new Error(`OpenAI request failed: ${response?.status ?? 0} ${failureBody}`);
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
