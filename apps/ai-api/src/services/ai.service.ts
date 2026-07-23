import crypto from 'node:crypto';
import {
  applyCommunicationCompliance,
  aiFeedbackRequestSchema,
  aiGenerateRequestSchema,
  type AiGenerateResponse,
  type CommunicationCompliance,
  type LeadTemperature,
} from '@drivecentric-ai/shared';
import { Role, type Dealership, type Prisma, type User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import { toPrismaChannel, toPrismaTone } from '../domain/mappers.js';
import { actionPermissions, channelPermissions, hasPermission, tonePermissions } from '../domain/permissions.js';
import { ResponseEvaluatorService } from './response-evaluator.service.js';
import { UsageService } from './usage.service.js';
import { createLlmProvider } from './llm/index.js';
import type { ParsedAiOutput } from './types.js';
import type { Request } from 'express';
import {
  fallbackLlmResult,
  generateLeadResponseWithOpenAI,
  SAFE_OPENAI_FALLBACK_TEXT,
  type LeadIntent,
  type LocationCategory,
} from './lead-response-engine.service.js';

const allowedLeadScores = new Set(['hot', 'warm', 'cold']);
function canUseManagerMode(user: Pick<User, 'role'> & { accessibleProfileRoles?: string[] | null }) {
  return user.role === Role.MANAGER || user.role === Role.OWNER || Boolean(user.accessibleProfileRoles?.includes('manager'));
}

type FastCloserParsedOutput = ParsedAiOutput & {
  leadType?: string | undefined;
  buyingTemperature?: string | undefined;
  likelyCustomerGoal?: string | undefined;
  bestNextQuestion?: string | undefined;
  suggestedResponse?: string | undefined;
  commitmentAsk?: string | undefined;
  complianceWarning?: string | undefined;
  debugError?: string | undefined;
};

function fastCloser(output: ParsedAiOutput): FastCloserParsedOutput {
  return output as FastCloserParsedOutput;
}

function parseAiOutput(raw: string, fallbackLeadScore: LeadTemperature): FastCloserParsedOutput {
  try {
    const parsed = JSON.parse(raw) as Partial<FastCloserParsedOutput> & {
      leadScore?: string;
      buyingTemperature?: string;
      options?: Array<{ label?: string; text?: string; translation?: string }>;
    };

    const suggestedResponse = typeof parsed.suggestedResponse === 'string' ? parsed.suggestedResponse.trim() : '';
    const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
    const optionsSource =
      rawOptions.length > 0
        ? rawOptions
        : suggestedResponse
          ? [{ label: 'Suggested Response', text: suggestedResponse }]
          : [];

    const normalizedLeadScore =
      parsed.leadScore && allowedLeadScores.has(parsed.leadScore)
        ? parsed.leadScore
        : parsed.buyingTemperature && allowedLeadScores.has(parsed.buyingTemperature)
          ? parsed.buyingTemperature
          : fallbackLeadScore;

    const structuredNextBestAction = [
      parsed.leadType ? `Lead Type: ${parsed.leadType}` : undefined,
      parsed.bestNextQuestion ? `Best Next Question: ${parsed.bestNextQuestion}` : undefined,
      parsed.commitmentAsk ? `Commitment Ask: ${parsed.commitmentAsk}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      nextBestAction: parsed.nextBestAction ?? (structuredNextBestAction || 'Move the customer toward the next best step.'),
      leadScore: normalizedLeadScore as LeadTemperature,
      ...(parsed.detectedLanguage ? { detectedLanguage: parsed.detectedLanguage } : {}),
      ...(parsed.customerTranslation ? { customerTranslation: parsed.customerTranslation } : {}),
      ...(parsed.replyTranslation ? { replyTranslation: parsed.replyTranslation } : {}),
      ...(parsed.leadType ? { leadType: parsed.leadType } : {}),
      ...(parsed.buyingTemperature ? { buyingTemperature: parsed.buyingTemperature } : {}),
      ...(parsed.likelyCustomerGoal ? { likelyCustomerGoal: parsed.likelyCustomerGoal } : {}),
      ...(parsed.bestNextQuestion ? { bestNextQuestion: parsed.bestNextQuestion } : {}),
      ...(suggestedResponse ? { suggestedResponse } : {}),
      ...(parsed.commitmentAsk ? { commitmentAsk: parsed.commitmentAsk } : {}),
      ...(parsed.complianceWarning ? { complianceWarning: parsed.complianceWarning } : {}),
      options: optionsSource
        .slice(0, 3)
        .map((option, index) => ({
          label: option.label || (index === 0 ? 'Suggested Response' : `Option ${index + 1}`),
          text: option.text || '',
          ...(option.translation ? { translation: option.translation } : {}),
        }))
        .filter((option) => option.text.trim().length > 0),
    };
  } catch (error) {
    return {
      nextBestAction: 'AI returned invalid JSON. Inspect backend logs or prompt schema.',
      leadScore: fallbackLeadScore,
      debugError: error instanceof Error ? error.message : 'Invalid JSON parse',
      options: raw.trim()
        ? [
            {
              label: 'Raw AI Output',
              text: raw.trim(),
            },
          ]
        : [],
    };
  }
}

function outputRecord(output: unknown): Record<string, unknown> {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return { ...(output as Record<string, unknown>) };
  }
  return { value: output };
}

function learningItems(output: unknown): Array<Record<string, unknown>> {
  const record = outputRecord(output);
  return Array.isArray(record.learning) ? record.learning.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function short(value: string | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function customerFacingText(text: string) {
  return text
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/before we waste your time/gi, 'before you spend any more time on it')
    .replace(/[–—]/g, ', ')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.?!])/g, '$1')
    .trim();
}

function hasExtraDirection(userDraft: string | undefined) {
  return /\bUSER_EXTRA_DIRECTION(?:_PRIORITY)?:\s*[\s\S]+?\s*END_USER_EXTRA_DIRECTION(?:_PRIORITY)?\b/i.test(userDraft ?? '');
}


function complianceFallback(
  compliance: CommunicationCompliance,
  request: ReturnType<typeof aiGenerateRequestSchema.parse>,
  user: User & { dealership: Dealership },
): ParsedAiOutput {
  const customer = short(request.leadContext.customerName, 'the customer');
  const vehicle = short(request.leadContext.vehicleOfInterest, 'the vehicle');
  const repName = user.signatureName ?? user.name;
  const storeName = user.signatureDealershipName ?? user.dealership.name;
  const evidence = compliance.evidence?.[0] ? `Detected opt-out context: "${compliance.evidence[0]}"` : 'Detected opt-out context on the lead page.';

  if (compliance.status === 'do_not_contact') {
    return {
      nextBestAction: 'Do not contact this customer. Escalate to a manager/compliance review and update the CRM status.',
      leadScore: 'cold',
      options: [
        {
          label: 'Manager Review',
          text: `${evidence}\n\nDo not send a text, email, voicemail, or call script until a manager verifies the contact status. Update the CRM with the do-not-contact signal and review whether this lead should be closed, reassigned, or suppressed.`,
        },
      ],
    };
  }

  return {
    nextBestAction: 'Do not text this customer. Use a phone call only if dealership policy permits calling an SMS opt-out lead.',
    leadScore: 'cold',
    options: [
      {
        label: 'Live Call Script',
        text: `Phone call only. Do not text.\n\nHi ${customer}, this is ${repName} calling from ${storeName}. I saw your request around the ${vehicle}, and I also see we should not continue by text. I wanted to make one quick call to make sure we handle this the right way. If you are still open to talking by phone, I can verify availability, trade, and finance options clearly. If not, I will update the file and leave you alone.`,
      },
      {
        label: 'Voicemail Script',
        text: `Voicemail only. Do not text.\n\nHi ${customer}, this is ${repName} with ${storeName}. I am calling about the ${vehicle}. I see texting is not the right path here, so I will not send a text follow-up. If you still want help by phone, call me back and I can verify the vehicle, numbers, trade, or finance path for you. If not, no problem, I will note the file accordingly.`,
      },
      {
        label: 'Manager Call Plan',
        text: `Manager call plan. Do not text.\n\n${evidence}\n\nHave a manager review the lead before outreach. If calling is allowed, lead with respect for the opt-out, ask whether a phone conversation is acceptable, then either help with the ${vehicle} or close the file cleanly.`,
      },
    ],
  };
}

function needsComplianceFallback(compliance: CommunicationCompliance, parsed: ParsedAiOutput) {
  if (compliance.status === 'clear') return false;
  if (compliance.status === 'do_not_contact') return true;
  if (!parsed.options.length) return true;
  const joined = parsed.options.map((option) => `${option.label}\n${option.text}`).join('\n').toLowerCase();
  const hasPhonePath = /\b(call|phone|voicemail|voice mail|manager review)\b/i.test(joined);
  const hasTextPath = /\b(text me|reply back|reply here|send me a text|shoot me a text|i(?:'|’)ll text|will text|by text)\b/i.test(joined);
  const hasInStoreOnlyPush = /\b(in-store visit|stop(?:ping)? by|come in|swing by)\b/i.test(joined) && !hasPhonePath;
  return !hasPhonePath || hasTextPath || hasInStoreOnlyPush;
}

function currentLeadText(context: ReturnType<typeof aiGenerateRequestSchema.parse>['leadContext']) {
  const customerTimeline = (context.conversationTimeline ?? [])
    .filter((entry) => entry.actor === 'customer' && entry.direction === 'inbound')
    .map((entry) => entry.text);
  const externalTimeline = (context.conversationTimeline ?? [])
    .filter((entry) => entry.direction !== 'internal' && entry.channel !== 'note' && entry.actor !== 'system')
    .map((entry) => entry.text);
  return [
    context.customerIntelligence?.customerIntent,
    context.customerIntelligence?.nonNegotiables?.join(' '),
    context.customerIntelligence?.painPoints?.join(' '),
    ...customerTimeline,
    ...(context.priorMessages ?? []).slice(0, 12),
    ...externalTimeline.slice(0, 20),
    context.vehicleOfInterest,
    context.stockNumber,
    context.tradeInfo,
    context.paymentBudgetHints,
  ]
    .filter(Boolean)
    .join('\n');
}

function sentenceAllowsNegativeMention(text: string, pattern: RegExp) {
  return text
    .split(/[.!?\n]+/)
    .filter((sentence) => pattern.test(sentence))
    .every((sentence) => /\b(no|not|avoid|exclude|skip|don't|dont|do not|without|non[-\s]?hybrid|isn't|is not)\b/i.test(sentence));
}

function leadTruthViolations(context: ReturnType<typeof aiGenerateRequestSchema.parse>['leadContext'], parsed: ParsedAiOutput) {
  const leadText = currentLeadText(context);
  const output = parsed.options.map((option) => option.text).join('\n');
  const violations: string[] = [];
  const leadHasCash = /\bcash|pay in full|paid in full|\$31,?200\b/i.test(leadText);
  const outputPushesFinance = /\bcredit app|financing options?|finance options?|lender|monthly payment|approval|pre[-\s]?approval\b/i.test(output);
  const customerRaisedFinance = /\b(payment|monthly|finance|financing|credit|approval|approved|pre[-\s]?approval|apr|rate|term|lease)\b/i.test(leadText);
  const financeMentionIsOptional =
    /\b(optional|if it helps|if you want|if you'd like|if you would like|only if|we can also look|option to|not required|cash is fine)\b/i.test(output);

  if (leadHasCash && outputPushesFinance && !financeMentionIsOptional && !/\b(customer asked|asked for financing|finance question)\b/i.test(leadText)) {
    violations.push('cash_buyer_finance_push');
  }

  if (outputPushesFinance && !customerRaisedFinance && !financeMentionIsOptional) {
    violations.push('finance_push_without_customer_signal');
  }

  const remoteOrOutOfState =
    context.locationIntel?.classification === 'out_of_state' ||
    /\b(out[-\s]?of[-\s]?state|ship|shipping|delivery|remote|flight|drive from)\b/i.test(leadText);
  const outputPushesTravel =
    /\b(come in|stop by|stopping by|swing by|in[-\s]?store|visit us|visit the store|test drive|time window|what time works|make the trip|drive down)\b/i.test(
      output,
    );
  if (remoteOrOutOfState && outputPushesTravel) {
    violations.push('remote_buyer_in_store_push');
  }

  const leadExcludesHybrid = /\b(?:no|not|avoid|exclude|don't\s+want|dont\s+want|do not want|don't|dont|do not|non[-\s]?hybrid)\s+(?:a\s+)?(?:hybrid|hybird|4xe|plug[-\s]?in)\b/i.test(leadText);
  if (leadExcludesHybrid && /\b(4xe|hybrid|hybird|plug[-\s]?in|phev)\b/i.test(output) && !sentenceAllowsNegativeMention(output, /\b(4xe|hybrid|hybird|plug[-\s]?in|phev)\b/i)) {
    violations.push('hybrid_exclusion_violated');
  }

  for (const stalePhrase of ['dog hair', 'Caruthersville']) {
    if (new RegExp(`\\b${stalePhrase}\\b`, 'i').test(output) && !new RegExp(`\\b${stalePhrase}\\b`, 'i').test(leadText)) {
      violations.push(`stale_context_${stalePhrase.toLowerCase().replace(/\s+/g, '_')}`);
    }
  }

  for (const color of ['red', 'white', 'neon']) {
    const leadExcludesColor = leadText
      .split(/[.!?\n]+/)
      .some((sentence) => new RegExp(`\\b${color}\\b`, 'i').test(sentence) && /\b(no|not|avoid|exclude|skip|don't|dont|do not|without)\b/i.test(sentence));
    if (leadExcludesColor && new RegExp(`\\b${color}\\b`, 'i').test(output) && !sentenceAllowsNegativeMention(output, new RegExp(`\\b${color}\\b`, 'i'))) {
      violations.push(`excluded_color_${color}`);
    }
  }

  return violations;
}

function fatalTruthViolations(violations: string[]) {
  // Finance/cash mismatch flags should warn the salesperson, not destroy the whole AI response.
  // Fatal truth guard should only block serious hallucinations/compliance problems.
  const nonFatal = new Set(['cash_buyer_finance_push', 'finance_push_without_customer_signal']);

  return violations.filter((violation) => !nonFatal.has(violation));
}

function truthGuardWarningFlags(violations: string[]) {
  return violations.map((violation) => `truth_guard_warning_${violation}`);
}

function safeFallbackParsed(fallbackLeadScore: LeadTemperature, reason?: string): FastCloserParsedOutput {
  const output: FastCloserParsedOutput = {
    nextBestAction: reason ? 'AI generation failed. Fix the backend/OpenAI error shown in the draft.' : 'Ask for the best number and move to a human follow-up.',
    leadScore: fallbackLeadScore,
    options: [
      {
        label: reason ? 'Backend Error' : 'Suggested Response',
        text: reason
          ? `AI generation failed before a usable reply was created.\n\nBackend error:\n${reason}\n\nCheck Railway logs, OpenAI env variables, response JSON shape, and truth guard.`
          : SAFE_OPENAI_FALLBACK_TEXT,
      },
    ],
  };

  if (reason) output.debugError = reason;

  return output;
}

export class AiService {
  private readonly evaluator = new ResponseEvaluatorService();
  private readonly usage = new UsageService();
  private readonly llm = createLlmProvider();

  async generate(rawInput: unknown, actor: NonNullable<Request['auth']>): Promise<AiGenerateResponse> {
    const parsedRequest = aiGenerateRequestSchema.parse(rawInput);
    const request = {
      ...parsedRequest,
      leadContext: applyCommunicationCompliance(parsedRequest.leadContext),
    };
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      include: { dealership: true },
    });

    if (!user) throw notFound('User not found');
    if (request.dealershipId && request.dealershipId !== user.dealershipId && actor.role !== 'owner') {
      throw forbidden('Cannot generate for another dealership');
    }

    await this.usage.assertAiAllowed(user);
    const channelPermission = channelPermissions[request.channel];
    const tonePermission = tonePermissions[request.tone];
    const actionPermission = actionPermissions[request.action];
    if (!hasPermission(user, 'canUseAi')) throw forbidden('AI access is not enabled for this user');
    if (request.roleMode === 'manager' && !canUseManagerMode(user)) {
      throw forbidden('Manager response mode is only available to managers and owners');
    }
    if (channelPermission && !hasPermission(user, channelPermission)) {
      throw forbidden(`This user cannot generate ${request.channel} replies`);
    }
    if (tonePermission && !hasPermission(user, tonePermission)) {
      throw forbidden(`This user cannot use ${request.tone} tone`);
    }
    if (actionPermission && !hasPermission(user, actionPermission)) {
      throw forbidden(`This action is not enabled for this user`);
    }

    const workflowRules = await prisma.workflowRule.findMany({
      where: { dealershipId: user.dealershipId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const latestCustomerIncluded = Boolean(
      request.leadContext.conversationTimeline?.some((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim()),
    );
    let detectedIntent: LeadIntent = 'general_interest';
    let locationCategory: LocationCategory = 'unknown';
    let chosenStrategy = 'OpenAI lead-response engine';
    let latestCustomerMessage = '';
    let builtPrompt = {
      system: '',
      user: '',
    };
    let openAiUsed = false;
    let aiError: string | undefined;

    console.info('[ai.generate] received', {
      conversationId: request.conversationId,
      customerNamePresent: Boolean(request.leadContext.customerName),
      latestCustomerIncluded,
      selectedFilters: {
        action: request.action,
        channel: request.channel,
        tone: request.tone,
        roleMode: request.roleMode,
      },
      locationConfidence: request.leadContext.locationIntel?.confidence ?? request.leadContext.parserDebug?.locationConfidence ?? 'unknown',
      stage: request.leadContext.customerIntelligence?.bestNextMove ?? request.leadContext.appointmentStatus ?? 'unknown',
      modelRequested: process.env.OPENAI_MODEL,
      openAiCalled: true,
    });

    let result = fallbackLlmResult();
    try {
      const engine = await generateLeadResponseWithOpenAI({
        request,
        user,
        workflowRules,
        llm: this.llm,
      });
      result = engine.result;
      builtPrompt = engine.prompt;
      detectedIntent = engine.detectedIntent;
      locationCategory = engine.locationCategory;
      chosenStrategy = engine.chosenStrategy;
      latestCustomerMessage = engine.latestCustomerMessage;
      openAiUsed = result.provider === 'openai';
      console.info('[ai.generate] llm_result', {
        conversationId: request.conversationId,
        detectedIntent,
        selectedFilters: {
          action: request.action,
          channel: request.channel,
          tone: request.tone,
          roleMode: request.roleMode,
        },
        locationCategory,
        chosenStrategy,
        latestCustomerIncluded: Boolean(latestCustomerMessage),
        provider: result.provider,
        openAiCalled: result.provider === 'openai',
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        fallbackUsed: false,
      });
    } catch (error) {
      aiError = error instanceof Error ? error.message : 'Unknown AI error';
      result = fallbackLlmResult();
      builtPrompt = {
        system: 'Safe fallback used because AI generation failed.',
        user: `Lead ID: ${request.conversationId}`,
      };
      console.error('[ai.generate] llm_error', {
        conversationId: request.conversationId,
        latestCustomerIncluded,
        selectedFilters: {
          action: request.action,
          channel: request.channel,
          tone: request.tone,
          roleMode: request.roleMode,
        },
        detectedIntent,
        locationCategory,
        chosenStrategy,
        openAiCalled: true,
        fallbackUsed: true,
        message: aiError,
      });
    }
    const inferredLeadScore = this.evaluator.scoreLead(
      request.leadContext.visibleText,
      request.leadContext.priorMessages,
      request.leadContext,
    );
    const parsed = result.provider === 'safe-fallback' ? safeFallbackParsed(inferredLeadScore, aiError) : parseAiOutput(result.text, inferredLeadScore);
    const guardedParsed: FastCloserParsedOutput =
      request.leadContext.communicationCompliance && needsComplianceFallback(request.leadContext.communicationCompliance, parsed)
        ? fastCloser(complianceFallback(request.leadContext.communicationCompliance, request, user))
        : {
            ...parsed,
            leadScore: request.leadContext.communicationCompliance?.status !== 'clear' ? 'cold' : parsed.leadScore,
            nextBestAction:
              request.leadContext.communicationCompliance?.status === 'sms_opt_out'
                ? `Do not text this customer. ${parsed.nextBestAction}`
                : parsed.nextBestAction,
          };
    if (!guardedParsed.options.length) {
      throw new Error('AI returned no usable draft options');
    }
    const isCoachingRequest = /\bASK BEST NEXT MOVE MODE\b/i.test(request.userDraft ?? '');
    const truthViolations = isCoachingRequest ? [] : leadTruthViolations(request.leadContext, guardedParsed);
    const fatalViolations = fatalTruthViolations(truthViolations);
    const truthGuardedParsed: FastCloserParsedOutput = fatalViolations.length
      ? safeFallbackParsed(inferredLeadScore, `Truth guard blocked response: ${fatalViolations.join(', ')}`)
      : guardedParsed;

    if (truthViolations.length) {
      console.warn(fatalViolations.length ? '[ai.generate] truth_guard_blocked' : '[ai.generate] truth_guard_warned', {
        conversationId: request.conversationId,
        detectedIntent,
        locationCategory,
        chosenStrategy,
        violations: truthViolations,
        fatalViolations,
        fallbackUsed: fatalViolations.length > 0,
      });
    }
    const extraDirectionPresent = hasExtraDirection(request.userDraft);
    const options = truthGuardedParsed.options.map((option) => {
      const isBackendError = option.label === 'Backend Error';
      const text = isBackendError ? option.text.trim() : customerFacingText(option.text);
      const translation = option.translation ? customerFacingText(option.translation) : undefined;
      const evaluation = this.evaluator.evaluate(text, { extraDirectionPresent });
      return {
        ...option,
        text,
        ...(translation ? { translation } : {}),
        score: evaluation.score,
        flags: [...evaluation.flags, ...fatalViolations, ...truthGuardWarningFlags(truthViolations), ...(truthGuardedParsed.debugError ? ['backend_or_truth_guard_fallback'] : [])],
      };
    });

    const communicationFlag =
      request.leadContext.communicationCompliance?.status && request.leadContext.communicationCompliance.status !== 'clear'
        ? [request.leadContext.communicationCompliance.status]
        : [];
    const complianceFlags = Array.from(new Set([...this.evaluator.mergeEvaluations(options), ...communicationFlag]));
    const totalTokens = result.inputTokens + result.outputTokens;
    const estimatedCostUsd = this.usage.estimateCostUsd(result.model, result.inputTokens, result.outputTokens);
    const finalGeneratedResponse = options[0]?.text ?? '';

    console.info('[ai.generate] final_response', {
      conversationId: request.conversationId,
      detectedIntent,
      customerLocationCategory: locationCategory,
      chosenStrategy,
      openAiUsed,
      finalGeneratedResponse,
      errorFromOpenAi: aiError,
      fallbackUsed: result.provider === 'safe-fallback' || fatalViolations.length > 0,
    });

    await Promise.all([
      prisma.messageLog.create({
        data: {
          dealershipId: user.dealershipId,
          userId: user.id,
          conversationId: request.conversationId,
          channel: toPrismaChannel(request.channel),
          tone: toPrismaTone(request.tone),
          action: request.action,
          leadContext: request.leadContext,
          prompt: `${builtPrompt.system}\n\n${builtPrompt.user}`,
          output: {
            raw: result.text,
            options,
            responseEngine: {
              detectedIntent,
              locationCategory,
              chosenStrategy,
              latestCustomerMessageIncluded: Boolean(latestCustomerMessage),
              openAiUsed,
              fallbackUsed: result.provider === 'safe-fallback' || fatalViolations.length > 0,
              errorFromOpenAi: aiError,
              parsedDebugError: truthGuardedParsed.debugError,
              leadType: truthGuardedParsed.leadType,
              buyingTemperature: truthGuardedParsed.buyingTemperature,
              likelyCustomerGoal: truthGuardedParsed.likelyCustomerGoal,
              bestNextQuestion: truthGuardedParsed.bestNextQuestion,
              commitmentAsk: truthGuardedParsed.commitmentAsk,
              complianceWarning: truthGuardedParsed.complianceWarning,
            },
          },
          evaluator: { complianceFlags },
          flagged: complianceFlags.length > 0,
          flags: complianceFlags,
        },
      }),
      this.usage.record({
        dealershipId: user.dealershipId,
        userId: user.id,
        conversationId: request.conversationId,
        requestId: crypto.randomUUID(),
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens,
        estimatedCostUsd,
      }),
    ]);

    const apiResponse = {
      conversationId: request.conversationId,
      nextBestAction: truthGuardedParsed.nextBestAction,
      leadScore: truthGuardedParsed.leadScore,
      detectedLanguage: truthGuardedParsed.detectedLanguage,
      customerTranslation: truthGuardedParsed.customerTranslation,
      replyTranslation: truthGuardedParsed.replyTranslation,
      leadType: truthGuardedParsed.leadType,
      buyingTemperature: truthGuardedParsed.buyingTemperature,
      likelyCustomerGoal: truthGuardedParsed.likelyCustomerGoal,
      bestNextQuestion: truthGuardedParsed.bestNextQuestion,
      suggestedResponse: truthGuardedParsed.suggestedResponse,
      commitmentAsk: truthGuardedParsed.commitmentAsk,
      complianceWarning: truthGuardedParsed.complianceWarning,
      debugError: truthGuardedParsed.debugError ?? aiError,
      options,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens,
        estimatedCostUsd,
      },
      complianceFlags,
    };

    return apiResponse as AiGenerateResponse;
  }

  async recordFeedback(rawInput: unknown, actor: NonNullable<Request['auth']>) {
    const request = aiFeedbackRequestSchema.parse(rawInput);
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      include: { dealership: true },
    });

    if (!user) throw notFound('User not found');
    if (!hasPermission(user, 'canUseAi')) throw forbidden('AI access is not enabled for this user');

    const log = await prisma.messageLog.findFirst({
      where: {
        dealershipId: user.dealershipId,
        conversationId: request.conversationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!log) {
      return { ok: true, learned: false };
    }

    const output = outputRecord(log.output);
    const nextLearning = [
      {
        outcome: request.outcome,
        selectedText: request.selectedText,
        reason: request.reason,
        action: request.action ?? log.action,
        channel: request.channel,
        userId: user.id,
        userName: user.name,
        createdAt: new Date().toISOString(),
        leadSummary: request.leadContext
          ? {
              customerName: request.leadContext.customerName,
              vehicleOfInterest: request.leadContext.vehicleOfInterest,
              leadScore: request.leadContext.leadScore,
              paymentBudgetHints: request.leadContext.paymentBudgetHints,
              tradeInfo: request.leadContext.tradeInfo,
            }
          : undefined,
      },
      ...learningItems(output),
    ].slice(0, 20);
    output.learning = nextLearning;

    await Promise.all([
      prisma.messageLog.update({
        where: { id: log.id },
        data: { output: jsonValue(output) },
      }),
      prisma.auditLog.create({
        data: {
          dealershipId: user.dealershipId,
          actorUserId: user.id,
          action: 'ai.feedback',
          targetType: 'message_log',
          targetId: log.id,
          metadata: {
            conversationId: request.conversationId,
            outcome: request.outcome,
            action: request.action ?? log.action,
            channel: request.channel,
          },
        },
      }),
    ]);

    return { ok: true, learned: true };
  }

}
