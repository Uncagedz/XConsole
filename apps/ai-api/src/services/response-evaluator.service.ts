import { applyCommunicationCompliance, type LeadContext, type LeadTemperature } from '@drivecentric-ai/shared';
import type { DraftOption } from './types.js';

const compliancePatterns = [
  /\byou('| a)?re approved\b/i,
  /\bguarantee(d)?\b/i,
  /\block(ed)? (in|price)\b/i,
  /\brebate (is )?guaranteed\b/i,
  /\bno credit check\b/i,
  /\bwill definitely\b/i,
];

const strongNextStepPatterns = [
  /\banything specific\b/i,
  /\bwhat do you want me to focus on\b/i,
  /\bwhat should i focus on\b/i,
  /\bwhat caught your eye\b/i,
  /\bwhere are you trying to keep\b/i,
  /\bwhat are you driving\b/i,
  /\bwhat zip\b/i,
  /\bregistering it\b/i,
  /\bcash\b/i,
  /\bfinance\b/i,
  /\btrade\b/i,
  /\bpayoff\b/i,
  /\bvin\b/i,
  /\bmiles\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\bappointment\b/i,
  /\bpulled up\b/i,
  /\bready before you get here\b/i,
  /\bwalkaround\b/i,
  /\bvideo\b/i,
  /\bpics?\b/i,
  /\bphotos?\b/i,
  /\bcall\b/i,
  /\bphone\b/i,
  /\btext\b/i,
];

const assistantTonePatterns = [
  /\bi can send you\b/i,
  /\bwould you prefer\b/i,
  /\bplease let me know\b/i,
  /\blet me know what works best\b/i,
  /\bi would be happy to\b/i,
  /\bi'd be happy to\b/i,
  /\bto better assist\b/i,
  /\bthank you for your interest\b/i,
  /\bi understand your concerns\b/i,
  /\bcan i assist\b/i,
  /\bwhat'?s the best way to send\b/i,
  /\bwould you like to schedule\b/i,
  /\bi can provide\b/i,
  /\bwalk through everything\b/i,
  /\bhelp you get a better look\b/i,
];

const activeMomentumPatterns = [
  /\bi'?m grabbing\b/i,
  /\bi am grabbing\b/i,
  /\bi'?m pulling\b/i,
  /\bi am pulling\b/i,
  /\bi'?m checking\b/i,
  /\bi am checking\b/i,
  /\bi'?m shooting\b/i,
  /\bi am shooting\b/i,
  /\bi'?ll shoot\b/i,
  /\bi will shoot\b/i,
  /\bi'?ll get you\b/i,
  /\bi can have it\b/i,
  /\bpulled up\b/i,
  /\bready before\b/i,
];

const humanTonePatterns = [
  /\bgreat pick\b/i,
  /\btotally fair\b/i,
  /\byeah i get\b/i,
  /\bhonestly\b/i,
  /\bsmart question\b/i,
  /\byou'?re not wrong\b/i,
  /\bgood question\b/i,
  /\bgot you\b/i,
  /\byou picked a good one\b/i,
  /\bclean for the year\b/i,
  /\bsolid setup\b/i,
  /\blooks mean\b/i,
  /\bthat setup is clean\b/i,
  /😄|👀|🔥/,
];

export interface EvaluationResult {
  score: number;
  flags: string[];
}

export class ResponseEvaluatorService {
  evaluate(text: string, options?: { extraDirectionPresent?: boolean }): EvaluationResult {
    const flags: string[] = [];
    const normalized = text.trim();
    const extraDirectionPresent = Boolean(options?.extraDirectionPresent);
    const words = normalized.split(/\s+/).filter(Boolean);

    if (!extraDirectionPresent && words.length > 120) flags.push('too_long');
    if (!extraDirectionPresent && words.length > 70) flags.push('could_be_shorter');

    if (!extraDirectionPresent && !strongNextStepPatterns.some((pattern) => pattern.test(normalized)) && !/[?]/.test(normalized)) {
      flags.push('weak_next_step');
    }

    if (compliancePatterns.some((pattern) => pattern.test(normalized))) {
      flags.push('possible_compliance_violation');
    }

    if (/just checking in/i.test(normalized)) {
      flags.push('generic_follow_up_phrase');
    }

    if (!extraDirectionPresent && assistantTonePatterns.some((pattern) => pattern.test(normalized))) {
      flags.push('assistant_customer_service_tone');
    }

    if (!extraDirectionPresent && !activeMomentumPatterns.some((pattern) => pattern.test(normalized)) && /photo|video|picture|walkaround|sticker/i.test(normalized)) {
      flags.push('media_request_not_action_oriented');
    }

    if (!extraDirectionPresent && !humanTonePatterns.some((pattern) => pattern.test(normalized))) {
      flags.push('flat_human_tone');
    }

    if (!extraDirectionPresent && !/[?]/.test(normalized) && !/\b(call|text|shoot|send|grab|check|verify|get|pull|ready|come|appointment|tomorrow|today)\b/i.test(normalized)) {
      flags.push('no_customer_question');
    }

    let score = extraDirectionPresent ? 96 : 90;

    if (words.length > 120) score -= 14;
    else if (words.length > 70) score -= 6;

    if (flags.includes('weak_next_step')) score -= 16;
    if (flags.includes('possible_compliance_violation')) score -= 45;
    if (flags.includes('generic_follow_up_phrase')) score -= 10;
    if (flags.includes('assistant_customer_service_tone')) score -= 28;
    if (flags.includes('media_request_not_action_oriented')) score -= 18;
    if (flags.includes('flat_human_tone')) score -= 10;
    if (flags.includes('no_customer_question')) score -= 6;

    if (!extraDirectionPresent && activeMomentumPatterns.some((pattern) => pattern.test(normalized))) score += 6;
    if (!extraDirectionPresent && humanTonePatterns.some((pattern) => pattern.test(normalized))) score += 5;

    return {
      score: Math.max(0, Math.min(100, score)),
      flags,
    };
  }

  scoreLead(visibleText: string | undefined, priorMessages: string[], context?: LeadContext): LeadTemperature {
    if (context && applyCommunicationCompliance(context).communicationCompliance?.status !== 'clear') {
      return 'cold';
    }

    const customerOnlyPriorMessages = priorMessages.filter(
      (message) =>
        /\b(text from customer|email from customer|chat from customer|customer reply|web lead|customer said|customer:)\b/i.test(message) &&
        !/\b(text to customer|email to customer|call to customer|outbound|voicemail|note|task|claire|automation|system)\b/i.test(message),
    );

    const text = `${visibleText ?? ''} ${customerOnlyPriorMessages.join(' ')}`.toLowerCase();

    if (/\b(do not contact|don't contact|dont contact|stop texting|unsubscribe|opt out|remove me|wrong number)\b/i.test(text)) {
      return 'cold';
    }

    if (/\b(today|now|available|test drive|trade|payment|appointment|call me|ready|out the door|otd|buy|purchase|deposit|hold it|send paperwork)\b/i.test(text)) {
      return 'hot';
    }

    if (/\b(price|photos|pictures|video|walkaround|sticker|still have|more info|interested|condition|carfax|history)\b/i.test(text)) {
      return 'warm';
    }

    return 'cold';
  }

  mergeEvaluations(options: DraftOption[]) {
    return Array.from(new Set(options.flatMap((option) => option.flags)));
  }
}
