export const defaultWorkflowConfig = {
  version: '2026-04-demo',
  leadStages: [
    'new',
    'attempted_contact',
    'engaged',
    'appointment_set',
    'appointment_confirmed',
    'showed',
    'working_deal',
    'sold',
    'lost',
  ],
  followUpTiming: [
    {
      stage: 'new',
      afterMinutes: 0,
      action: 'Respond immediately, answer the exact question, and ask the lightest useful next question.',
    },
    {
      stage: 'attempted_contact',
      afterMinutes: 20,
      action: 'Send a concise second touch with a specific reason to reply.',
    },
    {
      stage: 'ghosted',
      afterMinutes: 1440,
      action: 'Send a useful re-engagement with a specific vehicle or alternative option.',
    },
  ],
  objectionPlaybooks: {
    price: [
      'Acknowledge the concern directly.',
      'Do not promise a discount without manager approval.',
      'Clarify whether the issue is total price, monthly payment, trade value, or fear of wasting time.',
      'Move to value, availability, verified numbers, remote proof, or manager review. Appointment only when the customer is local or clearly ready.',
    ],
    availability: [
      'Avoid guaranteeing availability unless the CRM context clearly confirms it.',
      'Offer to verify status quickly and provide a close substitute, video, or walkaround if needed.',
    ],
    payment: [
      'Ask for target payment and money down only when it helps the next step.',
      'Do not imply financing approval.',
      'Move toward verified numbers or a finance manager review. Use a credit app only when financing/payment is the customer concern.',
    ],
    credit: [
      'Use lender-approval language and avoid guaranteed outcomes.',
      'Offer the cleanest finance path: credit app or finance call only when financing/payment is the customer concern; otherwise use verified numbers.',
      'Make the customer feel safe about finding options without promising the result.',
    ],
    trade: [
      'Ask for VIN, miles, condition, and payoff when missing.',
      'Push for an in-person appraisal because market value changes by condition.',
    ],
    remote_or_out_of_state: [
      'Do not ask for a blind trip.',
      'Offer a remote walkaround, call, FaceTime/video, or numbers review first.',
      'Make it easy to involve a family member or trusted person near the store.',
    ],
    condition_or_history: [
      'Verify what is known before answering.',
      'Use available proof only: inspection, service, Carfax/history, photos, video, warranty options, or appraisal.',
      'Offer a walkaround or third-party inspection when it reduces risk.',
    ],
    comparison_shopper: [
      'Respect the comparison without sounding weak.',
      'Differentiate the exact unit, proof, store process, or convenience.',
      'Earn a small commitment before the customer shops you into a commodity.',
    ],
    just_looking: [
      'Respect the pace, then offer a low-friction next step.',
      'Ask one helpful qualifying question and keep the door open without forcing an appointment.',
    ],
  },
  escalationRules: [
    {
      name: 'pricing_dispute',
      when: 'Customer demands out-the-door pricing, threatens bad review, or asks for manager.',
      action: 'Suggest manager takeover and draft a calm manager-forward response.',
    },
    {
      name: 'legal_or_finance_claim',
      when: 'Lead asks about approval guarantee, rebate eligibility, legal claim, or adverse action.',
      action: 'Use uncertainty language and route to manager or finance.',
    },
  ],
  compliancePhrases: [
    'I can verify that for you.',
    'Based on what I can see here',
    'Subject to final lender approval',
    'Availability can change quickly',
  ],
  prohibitedPhrases: [
    'You are approved',
    'I guarantee',
    'This price is locked',
    'Rebate guaranteed',
    'No credit check needed',
  ],
  managerEscalationTriggers: [
    'angry',
    'lawsuit',
    'bait and switch',
    'manager',
    'out the door',
    'credit denied',
  ],
  crmAutomationNotes: [
    'Claire is DriveCentric AI bot automation. Treat Claire messages as CRM context, not customer intent.',
  ],
};
