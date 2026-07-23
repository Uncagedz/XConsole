import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from './provider.js';

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export class MockLlmProvider implements LlmProvider {
  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const parsed = JSON.parse(input.user) as {
      leadContext?: {
        customerName?: string;
        vehicleOfInterest?: string;
      };
    };
    const name = parsed.leadContext?.customerName ?? 'there';
    const vehicle = parsed.leadContext?.vehicleOfInterest ?? 'that vehicle';
    const text = JSON.stringify({
      nextBestAction: 'Verify the customer-specific concern first, then ask one light next question.',
      leadScore: 'warm',
      options: [
        {
          label: 'Development mock',
          text: `Hey ${name}, yes, I can help with ${vehicle}. I'll verify the latest status, condition, and real numbers on my side first so I do not point you the wrong way. What matters most on this one: price, condition, or timing?`,
        },
        {
          label: 'Development mock',
          text: `${name}, good pick on ${vehicle}. I can make this easy: let me confirm the details first and then we can decide the best next step. Are you mainly comparing total price or making sure the vehicle itself is right?`,
        },
        {
          label: 'Development mock',
          text: `Hi ${name}, I didn't want you waiting on ${vehicle}. I can verify availability and send the cleanest next step. Is this still the one you want to focus on?`,
        },
      ],
    });

    return {
      text,
      provider: 'mock',
      model: 'mock-sales-closer',
      inputTokens: estimateTokens(input.system + input.user),
      outputTokens: estimateTokens(text),
    };
  }
}
