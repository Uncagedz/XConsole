import { Role, UserStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PromptBuilderService } from '../src/services/prompt-builder.service.js';

describe('PromptBuilderService', () => {
  it('injects store process and lead context', () => {
    const builder = new PromptBuilderService();
    const prompt = builder.build({
      request: {
        action: 'appointment_push',
        channel: 'sms',
        tone: 'standard_closer',
        conversationId: 'lead-1',
        leadContext: {
          customerName: 'Avery',
          vehicleOfInterest: '2025 Toyota Camry',
          timestamps: [],
          priorMessages: [],
          sentiment: 'unknown',
          leadScore: 'warm',
        },
      },
      user: {
        id: 'user-1',
        userId: 'avery-sales',
        email: 'avery@example.com',
        name: 'Avery Sales',
        passwordHash: 'hash',
        role: Role.SALESPERSON,
        status: UserStatus.ACTIVE,
        aiEnabled: true,
        dailyTokenLimit: null,
        lastLoginAt: null,
        dealershipId: 'dealer-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        dealership: {
          id: 'dealer-1',
          name: 'Demo Motors',
          slug: 'demo-motors',
          isActive: true,
          aiEnabled: true,
          dailyTokenLimit: 250000,
          monthlyTokenLimit: 5000000,
          settings: { leadStages: ['new'] },
          extensionMinVersion: '0.1.0',
          extensionLatestVersion: '0.1.0',
          supportEmail: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      workflowRules: [],
      promptTemplates: [],
    });

    expect(prompt.system).toContain('Guardrails');
    expect(prompt.system).toContain('pressure-test');
    expect(prompt.system).toContain('Conversation continuity rule');
    expect(prompt.system).toContain('Automotive sales book principles');
    expect(prompt.system).toContain('Remote buyer proof points');
    expect(prompt.system).toContain('No em dashes');
    expect(prompt.user).toContain('2025 Toyota Camry');
    expect(prompt.user).toContain('leadStages');
    expect(prompt.user).toContain('salesPressureTest');
    expect(prompt.user).toContain('needsAnalysis');
  });

  it('switches STOP leads into phone-only compliance guidance', () => {
    const builder = new PromptBuilderService();
    const prompt = builder.build({
      request: {
        action: 'appointment_push',
        channel: 'sms',
        tone: 'standard_closer',
        conversationId: 'lead-stop',
        leadContext: {
          customerName: 'Glen',
          vehicleOfInterest: '2025 Jeep Gladiator Nighthawk',
          timestamps: [],
          priorMessages: ['Glen Today at 2:12 PM STOP'],
          conversationTimeline: [
            {
              actor: 'customer',
              direction: 'inbound',
              channel: 'text',
              timestampIso: '2026-04-25T18:12:00.000Z',
              text: 'STOP',
            },
          ],
          sentiment: 'neutral',
          leadScore: 'hot',
        },
      },
      user: {
        id: 'user-1',
        userId: 'avery-sales',
        email: 'avery@example.com',
        name: 'Avery Sales',
        passwordHash: 'hash',
        role: Role.SALESPERSON,
        status: UserStatus.ACTIVE,
        aiEnabled: true,
        dailyTokenLimit: null,
        lastLoginAt: null,
        dealershipId: 'dealer-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        dealership: {
          id: 'dealer-1',
          name: 'Demo Motors',
          slug: 'demo-motors',
          isActive: true,
          aiEnabled: true,
          dailyTokenLimit: 250000,
          monthlyTokenLimit: 5000000,
          settings: { leadStages: ['new'] },
          extensionMinVersion: '0.1.0',
          extensionLatestVersion: '0.1.0',
          supportEmail: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      workflowRules: [],
      promptTemplates: [],
    });

    expect(prompt.system).toContain('Do not draft a text or email reply');
    expect(prompt.user).toContain('"status": "sms_opt_out"');
    expect(prompt.user).toContain('"leadScore": "cold"');
    expect(prompt.user).toContain('call/voicemail script');
  });

  it('adds manager handoff instructions when manager mode is selected', () => {
    const builder = new PromptBuilderService();
    const prompt = builder.build({
      request: {
        action: 'generate_reply',
        channel: 'sms',
        tone: 'manager_takeover',
        roleMode: 'manager',
        conversationId: 'lead-manager',
        leadContext: {
          customerName: 'Glen',
          vehicleOfInterest: '2025 Jeep Gladiator',
          timestamps: [],
          priorMessages: ['Glen asked if the Gladiator is still available.'],
          sentiment: 'neutral',
          leadScore: 'warm',
        },
      },
      user: {
        id: 'manager-1',
        userId: 'sales-manager',
        email: 'manager@example.com',
        name: 'Sales Manager',
        passwordHash: 'hash',
        role: Role.MANAGER,
        status: UserStatus.ACTIVE,
        aiEnabled: true,
        dailyTokenLimit: null,
        lastLoginAt: null,
        dealershipId: 'dealer-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        dealership: {
          id: 'dealer-1',
          name: 'Demo Motors',
          slug: 'demo-motors',
          isActive: true,
          aiEnabled: true,
          dailyTokenLimit: 250000,
          monthlyTokenLimit: 5000000,
          settings: { leadStages: ['new'] },
          extensionMinVersion: '0.1.0',
          extensionLatestVersion: '0.1.0',
          supportEmail: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      workflowRules: [],
      promptTemplates: [],
    });

    expect(prompt.system).toContain('Manager situational mode');
    expect(prompt.system).toContain('Jeep sales specialist');
    expect(prompt.system).toContain('family-owned');
    expect(prompt.system).toContain('two years');
    expect(prompt.system).toContain('15 years');
    expect(prompt.system).toContain('do not name a specific salesperson');
    expect(prompt.user).toContain('"mode": "manager"');
    expect(prompt.user).toContain('manager handoff only');
  });
});
