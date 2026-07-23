export interface FieldSelectorConfig {
  selectors: string[];
  labelPatterns: RegExp[];
}

export interface ParserConfig {
  leadPageUrlPatterns: RegExp[];
  leadRootSelectors: string[];
  focusRootSelectors: string[];
  focusKeywords: string[];
  replyInputSelectors: string[];
  fields: {
    customerName: FieldSelectorConfig;
    vehicleOfInterest: FieldSelectorConfig;
    stockNumber: FieldSelectorConfig;
    tradeInfo: FieldSelectorConfig;
    paymentBudgetHints: FieldSelectorConfig;
    leadSource: FieldSelectorConfig;
    appointmentStatus: FieldSelectorConfig;
    salespersonName: FieldSelectorConfig;
    priorMessages: FieldSelectorConfig;
    timestamps: FieldSelectorConfig;
  };
}

export const driveCentricParserConfig: ParserConfig = {
  leadPageUrlPatterns: [/\/customers?\//i, /\/leads?\//i, /\/opportunities?\//i, /\/crm\/.*(customer|lead)/i, /#\/pipeline\/sales/i],
  leadRootSelectors: [
    'mat-dialog-container',
    'drc-deal-card',
    'drc-deal-card-state-view',
    'drc-deal-card-activity',
    'drc-timeline',
    'drc-timeline-item',
    '[drctimelineitem]',
    '[data-testid*="lead" i]',
    '[data-testid*="customer" i]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[class*="summary" i]',
    '[class*="contact" i]',
    '.customer-detail',
    '.lead-detail',
    '.opportunity-detail',
  ],
  focusRootSelectors: [
    'mat-dialog-container',
    'drc-deal-card',
    'drc-deal-card-state-view',
    'drc-deal-card-activity',
    'drc-timeline',
    'drc-timeline-item',
    '[drctimelineitem]',
    'drc-conversation-card',
    '.conversation-card',
    '.deal-header',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[class*="modal" i]',
    '[class*="dialog" i]',
    '[class*="drawer" i]',
    '[class*="overlay" i]',
    '[class*="detail" i]',
    '[class*="customer" i]',
    '[class*="summary" i]',
    '[class*="contact" i]',
    '[class*="activity" i]',
    '[class*="deal" i]',
    '[class*="panel" i]',
  ],
  focusKeywords: [
    'Text From Customer',
    'Email From Customer',
    'Customer Reply',
    'Chat From Customer',
    'Web Lead',
    'Inbound Call',
    'Call From Customer',
    'Text To Customer',
    'Email To Customer',
    'Call To Customer',
    'Outbound Call',
    'Phone Task Completed',
    'Voicemail Left',
    'Manager Note',
    'CRM Note',
    'Automation',
    'Claire',
    'Deal Created',
    'Deal Imported From System',
    'Open Deal',
    'Deal:',
    'Customer #',
    'Genius Summary',
    'Best Contact Method',
    'Wish List',
    'Activity',
    'Conversation',
    'New Deal',
    'Credit App',
    'Mark as Sold',
    'Fire Genius',
    'Details',
  ],
  replyInputSelectors: [
    'textarea[placeholder*="Type your note here" i]',
    '[contenteditable="true"][data-placeholder*="Type your note here" i]',
    '[contenteditable="true"][aria-label*="note" i]',
    '[contenteditable="true"][role="textbox"]',
    '.ql-editor[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    'textarea[name*="message" i]',
    'textarea[placeholder*="message" i]',
    '[contenteditable="true"]',
    'textarea',
  ],
  fields: {
    customerName: {
      selectors: [
        '.deal-header .cust-name',
        '.card-customer__name',
        '.deal-customer .cust-name',
        'header h1',
        'header h2',
        '[role="dialog"] h1',
        '[role="dialog"] h2',
        '[class*="name" i]',
        '[data-testid*="customer-name" i]',
        '.customer-name',
        '[class*="customerName"]',
      ],
      labelPatterns: [/customer\s*name[:\s]+([A-Z][^\n]{1,80})/i, /name[:\s]+([A-Z][^\n]{1,80})/i],
    },
    vehicleOfInterest: {
      selectors: [
        '.deal-header .deal-vehicle .detailvalue',
        'drc-card-open-deal .card-open-deal__vehicle-label',
        'drc-card-open-deal [class*="vehicle-label" i]',
        '[data-testid*="vehicle" i]',
        '.vehicle-of-interest',
        '[class*="vehicle"]',
        '[class*="unit" i]',
        'header [class*="vehicle" i]',
      ],
      labelPatterns: [
        /vehicle\s*(of interest)?[:\s]+([^\n]{2,120})/i,
        /interested\s*in[:\s]+([^\n]{2,120})/i,
      ],
    },
    stockNumber: {
      selectors: [
        '#detailNumElement',
        '.customer-numbers .detailvalue',
        '[data-testid*="stock" i]',
        '.stock-number',
        '[class*="stock"]',
        'header [class*="stock" i]',
      ],
      labelPatterns: [/stock\s*(#|number)?[:\s#]+([A-Z0-9-]{2,40})/i],
    },
    tradeInfo: {
      selectors: ['[data-testid*="trade" i]', '.trade-info', '[class*="trade"]'],
      labelPatterns: [/trade[:\s]+([^\n]{2,180})/i],
    },
    paymentBudgetHints: {
      selectors: ['[data-testid*="payment" i]', '[data-testid*="budget" i]', '.payment-info'],
      labelPatterns: [/(payment|budget)[:\s]+([^\n]{2,180})/i],
    },
    leadSource: {
      selectors: [
        '.deal-header .deal-source .detailvalue',
        '[data-testid*="source" i]',
        '.lead-source',
        '[class*="source"]',
        '[class*="network" i]',
        'header [class*="source" i]',
      ],
      labelPatterns: [/source[:\s]+([^\n]{2,80})/i],
    },
    appointmentStatus: {
      selectors: ['[data-testid*="appointment" i]', '.appointment-status', '[class*="appointment"]', '[class*="stage" i]', 'header [class*="stage" i]'],
      labelPatterns: [/appointment[:\s]+([^\n]{2,120})/i],
    },
    salespersonName: {
      selectors: [
        '[data-testid*="salesperson" i]',
        '.salesperson-name',
        '[class*="salesperson"]',
        '[class*="sales" i]',
        'aside [class*="sales" i]',
        '[class*="assigned" i]',
        '[data-testid*="assigned" i]',
      ],
      labelPatterns: [/(salesperson|owner|assigned to|sales\s*1|sales\s*2|bdc)[:\s]+([^\n]{2,80})/i],
    },
    priorMessages: {
      selectors: [
        'drc-timeline li[drctimelineitem]',
        'drc-timeline-item',
        '[drctimelineitem]',
        'drc-timeline',
        '.timeline-item',
        '.cmp-tml-hd',
        '.cmp-tml-bd.is-content',
        '.cmp-tml-bd:not(.is-media)',
        '.cmp-tml-ft',
        '.cmp-tml-sts',
        '.item-user-fullname',
        '.item-details',
        '[data-testid*="message" i]',
        '[data-testid*="timeline" i]',
        '[data-testid*="activity" i]',
        '[data-testid*="conversation" i]',
        '.message-body',
        '.conversation-message',
        '[class*="message"]',
        '[class*="timeline" i]',
        '[class*="activity" i]',
        '[class*="conversation" i]',
        '[class*="activity" i] [class*="item" i]',
        '[class*="conversation" i] [class*="item" i]',
        '[class*="note" i]',
        '[class*="task" i]',
      ],
      labelPatterns: [],
    },
    timestamps: {
      selectors: [
        'time',
        '.item-details',
        '[data-testid*="timestamp" i]',
        '.timestamp',
        '[class*="timestamp"]',
        '[class*="time" i]',
        '[class*="date" i]',
      ],
      labelPatterns: [],
    },
  },
};
