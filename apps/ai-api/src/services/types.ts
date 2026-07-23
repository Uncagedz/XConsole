import type { LeadTemperature } from '@drivecentric-ai/shared';

export interface DraftOption {
  label: string;
  text: string;
  translation?: string;
  score: number;
  flags: string[];
}

export interface ParsedAiOutput {
  nextBestAction: string;
  leadScore: LeadTemperature;
  detectedLanguage?: string;
  customerTranslation?: string;
  replyTranslation?: string;
  options: Array<{
    label: string;
    text: string;
    translation?: string;
  }>;
}
