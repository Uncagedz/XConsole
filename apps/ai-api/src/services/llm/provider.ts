export interface LlmGenerateInput {
  system: string;
  user: string;
}

export interface LlmGenerateResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}
