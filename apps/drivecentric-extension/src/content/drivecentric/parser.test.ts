import { describe, expect, it } from 'vitest';
import { parseDriveCentricPage } from './parser';

describe('parseDriveCentricPage', () => {
  it('extracts lead context from visible DriveCentric-like markup', () => {
    document.body.innerHTML = `
      <main class="lead-detail">
        <h1 class="customer-name">Jordan Ellis</h1>
        <div class="vehicle-of-interest">2025 Ford F-150 XLT</div>
        <div class="stock-number">Stock #FT1234</div>
        <div class="lead-source">Cars.com</div>
        <div class="message-body">Is this available today? I have a trade.</div>
        <time>2026-04-12 09:30</time>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/customers/abc123');

    expect(parsed.isLeadPage).toBe(true);
    expect(parsed.context.customerName).toContain('Jordan Ellis');
    expect(parsed.context.vehicleOfInterest).toContain('2025 Ford F-150');
    expect(parsed.context.leadScore).toBe('hot');
    expect(parsed.conversationId).toBe('abc123');
  });

  it('prioritizes the active DriveCentric deal popup over the full pipeline page', () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h1>Appointment Hub</h1>
          <div>Unreplied</div>
        </section>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>pedro crespo</h1>
            <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
            <div>Engaged</div>
            <div>(786) 290-4572</div>
            <div>Deal: #29344 / Customer: #349181</div>
            <div>2026 Ram 1500 #R165537</div>
            <div>Phone / Personal Networking</div>
          </header>
          <aside>
            <div>Address Miami FL 33172</div>
            <div>Sales 1 Ani Sharma</div>
            <div>Genius Summary</div>
          </aside>
          <nav>
            <button>Activity</button>
            <button>Conversation</button>
          </nav>
          <article>
            <div>Ani Sharma Today at 3:34 PM broker deal do not contact</div>
            <div>Phone Task Tomorrow at 7:00 AM</div>
          </article>
          <aside>
            <button>New Deal</button>
            <button>Credit App</button>
            <button>Mark as Sold</button>
          </aside>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.isLeadPage).toBe(true);
    expect(parsed.context.customerName).toBe('pedro crespo');
    expect(parsed.context.customerLocation).toContain('Miami FL 33172');
    expect(parsed.context.vehicleOfInterest).toContain('2026 Ram 1500');
    expect(parsed.context.stockNumber).toBe('#R165537');
    expect(parsed.context.leadSource).toContain('Phone / Personal Networking');
    expect(parsed.context.salespersonName).toContain('Ani Sharma');
    expect(parsed.context.priorMessages.some((line) => /New Deal/i.test(line))).toBe(false);
    expect(parsed.context.visibleText).toContain('pedro crespo');
    expect(parsed.conversationId).toBe('deal-29344');
  });

  it('reads the open activity modal instead of the lead list behind it', () => {
    document.body.innerHTML = `
      <main>
        <section class="smart-table">
          <div>Brian Miller</div>
          <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
          <div>Address Collingswood NJ 08108</div>
          <div>2022 Jeep Wrangler #CV106329</div>
        </section>
        <mat-dialog-container>
          <drc-deal-card>
            <div class="deal-header">
              <h1>Gerardo Sibulo</h1>
              <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
              <div>Engaged</div>
              <div>Mobile (786) 834-4879</div>
              <div>No Vehicle</div>
              <div class="deal-source">ILM / 2026-jeep-wrangler-rubicon-439-lease-special-spal</div>
            </div>
            <div class="card">
              <div>Best Contact Method</div>
              <div>Text</div>
              <div>(786) 834-4879</div>
            </div>
            <div class="card card-details">
              <div>Sales 1 Ani Sharma</div>
              <div>BDC Aniyah Ferguson</div>
            </div>
            <drc-card-open-deal>
              <div>Open Deal</div>
              <div>Engaged today</div>
              <div>Interested Add</div>
              <div>Trade-in Add</div>
              <div>Source Internet</div>
              <div>Date Created April 29, 2026</div>
            </drc-card-open-deal>
            <drc-deal-card-activity>
              <drc-timeline>
                <drc-planned-timeline>
                  <li drctimelineitem class="videotask timeline-item tasktodo systemplanned">
                    <div class="cmp-tml-hd"><span>Video Task</span><div class="item-details">Today at 8:00 AM</div></div>
                    <div class="cmp-tml-bd">READ THE LEAD & send TAILORED video to customer AGAIN</div>
                  </li>
                </drc-planned-timeline>
                <drc-past-timeline>
                  <ul>
                    <li drctimelineitem class="text timeline-item customer">
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">• Aniyah Ferguson</div>
                        <div class="item-details">• Yesterday at 4:35 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>I'm Driving - Sent from My Car</span></div>
                    </li>
                    <li drctimelineitem class="text timeline-item user">
                      <div class="cmp-tml-hd">
                        <span>Text To Customer</span>
                        <div class="item-user-fullname">• Aniyah Ferguson</div>
                        <div class="item-details">• Yesterday at 4:35 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content">
                        <span>Are you on the way to the dealership for our Sales Event? Address: 777 N State Road 7 Plantation, FL 33317</span>
                      </div>
                    </li>
                  </ul>
                </drc-past-timeline>
              </drc-timeline>
            </drc-deal-card-activity>
          </drc-deal-card>
        </mat-dialog-container>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/engaged');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(parsed.context.customerName).toBe('Gerardo Sibulo');
    expect(parsed.context.phoneNumbers).toContain('(786) 834-4879');
    expect(parsed.context.customerZipCode).not.toBe('08108');
    expect(parsed.context.customerLocation ?? '').not.toContain('Collingswood');
    expect(parsed.context.vehicleOfInterest).toContain('2026 Jeep Wrangler Rubicon');
    expect(latestCustomer?.text).toContain("I'm Driving");
    expect(parsed.context.parserDebug?.latestCustomerMessageFound).toBe(true);
  });

  it('pulls details from supporting summary and contact rails around the active popup', () => {
    document.body.innerHTML = `
      <main>
        <section class="summary-rail">
          <div>Best Contact Method</div>
          <div>Text</div>
          <div>Address Miami FL 33172</div>
          <div>Sales 1 Ani Sharma</div>
        </section>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>pedro crespo</h1>
            <div>Engaged</div>
            <div>Deal: #29344 / Customer: #349181</div>
            <div>2026 Ram 1500 #R165537</div>
            <div>Phone / Personal Networking</div>
          </header>
          <article>
            <div>Genius Summary</div>
            <div>Need details on pricing and lease terms.</div>
            <div>(786) 290-4572</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.customerLocation).toContain('Miami FL 33172');
    expect(parsed.context.salespersonName).toContain('Ani Sharma');
    expect(parsed.context.visibleText).toMatch(/lease terms/i);
    expect(parsed.context.phoneNumbers).toContain('(786) 290-4572');
  });

  it('extracts the customer name from DriveCentric initials header rows', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <div>AW</div>
          <div>Aaron Witty</div>
          <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
          <div>Engaged</div>
          <div>(978) 888-1501</div>
          <div>aaronwitty@example.com</div>
          <div>Deal: #29342 / Customer: #349178</div>
          <div>2021 Jeep Wrangler</div>
          <article>
            <div>Text From Customer • Ani Sharma • Yesterday at 8:52 PM Any chance someone can see the car tomorrow?</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.customerName).toBe('Aaron Witty');
  });

  it('builds a conversation timeline and marks the customer as the latest speaker when they replied last', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>pedro crespo</h1>
            <div>Deal: #29344 / Customer: #349181</div>
            <div>2026 Ram 1500 #R165537</div>
            <div>Sales 1 Ani Sharma</div>
          </header>
          <article>
            <div>pedro crespo Today at 3:34 PM Is the 2026 Ram 1500 still available and what are the lease numbers?</div>
          </article>
          <article>
            <div>Ani Sharma Today at 3:12 PM I can verify the exact figures and make this easy. Would 4:15 or 6:00 work better?</div>
          </article>
          <article>
            <div>Claire Parker Today at 3:00 PM Thanks for reaching out. Reply STOP at any time.</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.conversationTimeline[0]?.actor).toBe('customer');
    expect(parsed.context.conversationTimeline[0]?.timestampLabel).toBe('Today at 3:34 PM');
    expect(parsed.context.conversationTimeline[1]?.actor).toBe('salesperson');
    expect(parsed.context.conversationTimeline[2]?.actor).toBe('automation');
    expect(parsed.context.priorMessages.join(' ')).toMatch(/lease numbers/i);
  });

  it('reads DriveCentric conversation chat bubbles as customer messages', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Steven Williams</h1>
            <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
            <div>Engaged</div>
            <div>(901) 340-8950</div>
            <div>srw15@netzero.net</div>
            <div>Address 6587 Sungate Dr S Memphis TN 38135</div>
            <div>2023 Jeep Wrangler #CV595879</div>
            <div>ILM / CarGurus - Soft Pull - Digital Deal</div>
          </header>
          <div class="deal-conversation">
            <div class="conversation-message inbound">
              <span class="avatar">SW</span>
              <div class="message-body">Hey Brianna, it's Steve from Memphis. I'm ready to move forward with my purchase of a jeep but I haven't heard back from my offer. If you could let me know the status I'd appreciate it. Thanks</div>
              <div class="message-meta">Text • 2h</div>
            </div>
            <div class="conversation-message outbound">
              <div class="message-body">Waiting on my manager</div>
              <div class="message-meta">Text • 52m</div>
            </div>
          </div>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/engaged');

    expect(parsed.context.customerName).toBe('Steven Williams');
    expect(parsed.context.vehicleOfInterest).toContain('2023 Jeep Wrangler');
    expect(parsed.context.stockNumber).toBe('#CV595879');
    expect(parsed.context.customerLocation).toContain('Memphis TN 38135');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');
    expect(latestCustomer?.text).toMatch(/ready to move forward/i);
    expect(parsed.context.priorMessages.join(' ')).toMatch(/heard back from my offer/i);
  });

  it('keeps the newest inbound conversation bubble when the customer asks for OTD', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Alex Rivera</h1>
            <div>(415) 567-8456</div>
            <div>2021 Honda Pilot #HP45000</div>
            <div>Internet / Store Listing</div>
          </header>
          <div class="deal-conversation">
            <div class="conversation-message outbound">
              <div class="message-body">I can help with numbers. What ZIP are you registering it in?</div>
              <div class="message-meta">Text • 18m</div>
            </div>
            <div class="conversation-message inbound">
              <span class="avatar">AR</span>
              <div class="message-body">I want the full out the door before I give my zip code.</div>
              <div class="message-meta">Text • 3m</div>
            </div>
          </div>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/engaged');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(latestCustomer?.text).toMatch(/full out the door/i);
    expect(parsed.context.conversationTimeline[0]?.actor).toBe('customer');
    expect(parsed.context.vehicleOfInterest).toContain('2021 Honda Pilot');
    expect(parsed.context.personalizationSignals.join(' ')).toMatch(/San Francisco|California/i);
  });

  it('recognizes BDC appointment intent from a short inbound bubble', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Mia Carter</h1>
            <div>(786) 555-0199</div>
            <div>2024 Jeep Grand Cherokee #GC123</div>
            <div>Sales 1 Brianna Vassell</div>
          </header>
          <div class="deal-conversation">
            <div class="conversation-message inbound customer">
              <div class="message-body">Can I see it after work today?</div>
              <div class="message-meta">Text • 9m</div>
            </div>
          </div>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/visit');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer');

    expect(latestCustomer?.text).toMatch(/after work today/i);
    expect(parsed.context.leadScore).toBe('hot');
    expect(parsed.context.sentiment).toBe('neutral');
  });

  it('still reads the customer even when the rep answered after them', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Chris Nolan</h1>
            <div>2022 Ram 1500 #R2233</div>
          </header>
          <div class="deal-conversation">
            <div class="conversation-message inbound">
              <span class="avatar">CN</span>
              <div class="message-body">My payment needs to be under 600 or I am out.</div>
              <div class="message-meta">Text • 22m</div>
            </div>
            <div class="conversation-message outbound">
              <div class="message-body">I understand. Let me see what structure makes sense.</div>
              <div class="message-meta">Text • 5m</div>
            </div>
          </div>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/proposal');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(latestCustomer?.text).toMatch(/under 600/i);
    expect(parsed.context.paymentBudgetHints).toMatch(/600/i);
  });

  it('does not score a lead hot when the customer sent STOP without a later START', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Glen Stone</h1>
            <div>Deal: #30001 / Customer: #40001</div>
            <div>2025 Jeep Gladiator Nighthawk #J517514</div>
            <div>Sales 1 Ani Sharma</div>
          </header>
          <article>
            <div>Glen Stone Today at 2:12 PM STOP</div>
          </article>
          <article>
            <div>Claire Parker Today at 1:10 PM Reply STOP at any time.</div>
          </article>
          <aside>
            <button>New Deal</button>
            <button>Credit App</button>
            <button>Mark as Sold</button>
          </aside>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.communicationCompliance?.status).toBe('sms_opt_out');
    expect(parsed.context.leadScore).toBe('cold');
    expect(parsed.context.sentiment).toBe('negative');
    expect(parsed.context.communicationCompliance?.evidence.join(' ')).toMatch(/STOP/i);
  });

  it('keeps Georgia phone-area clues instead of treating the store address as the customer address', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Glen Stone</h1>
            <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
            <div>777 N State Road 7 Plantation FL 33317</div>
            <div>(404) 555-1212</div>
            <div>Deal: #30002 / Customer: #40002</div>
            <div>2025 Jeep Gladiator Nighthawk #J517514</div>
            <div>Sales 1 Ani Sharma</div>
          </header>
          <article>
            <div>Glen Stone Today at 2:12 PM Can you send me numbers before I drive down?</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.customerLocation ?? '').not.toContain('Plantation FL 33317');
    expect(parsed.context.phoneNumbers).toContain('(404) 555-1212');
    expect(parsed.context.personalizationSignals.join(' ')).toMatch(/Atlanta|Georgia/i);
  });

  it('reads DriveCentric Angular timeline items without inverting customer constraints', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <drc-card-customer>
            <h1>Thomas Ceaser</h1>
            <div>Mobile (904) 535-4145</div>
            <div>tc6792@gmail.com</div>
            <div>Address 365 Boxwood Ct Midland GA 31820</div>
          </drc-card-customer>
          <drc-card-details>
            <div>Sales 1 Ani Sharma</div>
            <div>Best Contact Method Text</div>
          </drc-card-details>
          <drc-card-open-deal>
            <div>Open Deal Engaged</div>
            <div>2022 Jeep Wrangler</div>
            <div>Internet : RunMyLease Inc</div>
          </drc-card-open-deal>
          <drc-timeline>
            <drc-pinned-notes>
              <drc-timeline-pinned-note>
                <div class="header-container">
                  <span class="user-full-name">Brianna Vassell</span>
                  <span class="time">Friday at 7:58 PM</span>
                </div>
                <span class="note-message">cx wants the otd //CV118609</span>
              </drc-timeline-pinned-note>
            </drc-pinned-notes>
            <drc-past-timeline>
              <ul>
                <li drctimelineitem class="text timeline-item user">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text To Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Today at 12:32 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content">
                      <span>now send me a stock number you like!</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Saturday at 10:08 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>I'm looking for a Jeep Wrangler (Hard-Top) with leather seats, under 55,000 miles. Not interested in red, white or neon.<br>Don't want a hybrid vehicle.</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Saturday at 10:04 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>No, I must mis-read your text. I thought you were asking for non-negotiable things????</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item user">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text To Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Saturday at 10:02 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content">
                      <span>so you want a red and white color car, under 55000 miles with cloth seats and cannot be a hybrid</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Claire Parker </div>
                      <div class="item-details">&bull; Friday at 3:37 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>Could someone please give me the out the door price registering in Georgia with having the license plate in hand for vehicle Stock# CV118609? Also, can someone do a video of the vehicle.</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Saturday at 7:31 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>I have $31,200 cash that I can spend.</span>
                    </div>
                  </drc-timeline-text>
                </li>
              </ul>
            </drc-past-timeline>
          </drc-timeline>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');
    const timeline = parsed.context.conversationTimeline;
    const latestCustomer = timeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(parsed.context.customerName).toBe('Thomas Ceaser');
    expect(parsed.context.customerZipCode).toBe('31820');
    expect(parsed.context.phoneNumbers).toContain('(904) 535-4145');
    expect(parsed.context.stockNumber).toBe('#CV118609');
    expect(timeline[0]?.text).toMatch(/stock number you like/i);
    expect(latestCustomer?.text).toMatch(/Hard-Top/i);
    expect(latestCustomer?.text).toMatch(/Not interested in red, white or neon/i);
    expect(latestCustomer?.text).toMatch(/Don't want a hybrid/i);
    expect(parsed.context.priorMessages.join('\n')).not.toMatch(/cx wants the otd \/\/CV118609/i);
    expect(parsed.context.priorMessages[0]).toMatch(/Customer truth read/i);
    expect(parsed.context.priorMessages[0]).toMatch(/Do not recommend or name a 4xe\/hybrid/i);
    expect(parsed.context.priorMessages[0]).toMatch(/Do not push credit app or financing/i);
    expect(parsed.context.visibleText).toMatch(/DriveCentric structured customer-facing timeline \(newest first\)/i);
    expect(parsed.context.visibleText).toMatch(/Internal CRM notes\/tasks\/system events \(not customer-authored\)/i);
  });

  it('reads multiline contact-card address and keeps internal notes out of customer truth', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Joseph Collins</h1>
            <div>Deal: #29441 / Customer: #349334</div>
            <div>2022 Jeep Gladiator #CV129464</div>
          </header>
          <aside>
            <div>Mobile (561) 719-4190</div>
            <div>Email collinsjoe777@gmail.com</div>
            <div>Address</div>
            <div>11815 W BISCAYNE CANAL RD</div>
            <div>MIAMI FL 33161</div>
          </aside>
          <drc-deal-card-sidebar>
            <button>New Deal</button>
            <button>Vehicles</button>
            <button>Trade In</button>
            <button>Credit App</button>
            <button>Add Source</button>
          </drc-deal-card-sidebar>
          <drc-timeline>
            <drc-past-timeline>
              <ul>
                <li drctimelineitem class="note timeline-item user">
                  <drc-timeline-note>
                    <div class="cmp-tml-hd">
                      <span>Note</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Monday at 6:30 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content">
                      <span class="note-message">Sales. Created by Ani Sharma on 4/25/2026 @ 1:02 PM. might come in early. get the car ready from service to test drive Customer was a no-show.</span>
                    </div>
                  </drc-timeline-note>
                </li>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Yesterday at 6:18 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>You sent photos of all other gladiators. Is the one I want non existent</span>
                    </div>
                  </drc-timeline-text>
                </li>
              </ul>
            </drc-past-timeline>
          </drc-timeline>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(parsed.context.customerZipCode).toBe('33161');
    expect(parsed.context.customerLocation).toContain('11815 W BISCAYNE CANAL RD');
    expect(parsed.context.vehicleOfInterest).toBe('2022 Jeep Gladiator');
    expect(parsed.context.vehicleOfInterest).not.toMatch(/Trade|Add Source/i);
    expect(parsed.context.parserDebug?.warnings ?? []).not.toContain('ZIP missing');
    expect(latestCustomer?.text).toMatch(/photos of all other gladiators/i);
    expect(parsed.context.priorMessages.join('\n')).not.toMatch(/might come in early/i);
    expect(parsed.context.customerIntelligence?.bestNextMove).toMatch(/mix-up/i);
    expect(parsed.context.qualification?.highestValueQuestion).toMatch(/Do not qualify yet/i);
  });

  it('does not classify a trade-in vehicle as the vehicle of interest when trade appears first', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <div class="trade-info">
            <h3>Trade In</h3>
            <div>Current vehicle: 2018 Honda Accord EX with 91,000 miles. Payoff $8,200.</div>
          </div>
          <drc-card-open-deal>
            <div>Open Deal</div>
            <div>2024 Jeep Wrangler Sahara Stock #JW442211</div>
          </drc-card-open-deal>
          <drc-timeline>
            <drc-past-timeline>
              <ul>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-details">&bull; Today at 9:10 AM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>Can you get me real numbers on the Wrangler with my Accord trade?</span>
                    </div>
                  </drc-timeline-text>
                </li>
              </ul>
            </drc-past-timeline>
          </drc-timeline>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.vehicleOfInterest).toContain('2024 Jeep Wrangler');
    expect(parsed.context.stockNumber).toBe('#JW442211');
    expect(parsed.context.tradeVehicle?.rawText).toMatch(/2018 Honda Accord/i);
    expect(parsed.context.tradeInfo).toMatch(/2018 Honda Accord/i);
    expect(parsed.context.parserDebug?.warnings ?? []).not.toContain('Trade-in detected but vehicle of interest missing');
  });

  it('leaves vehicle of interest unknown when only a trade-in is present', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <div class="trade-info">Trade In: 2020 Toyota Camry SE, 54,000 miles, payoff unknown</div>
          <article>
            <div>Text From Customer • Today at 11:05 AM What can you give me for my Camry?</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.vehicleOfInterest).toBeUndefined();
    expect(parsed.context.tradeVehicle?.rawText).toMatch(/2020 Toyota Camry/i);
    expect(parsed.context.parserDebug?.warnings).toContain('Trade-in detected but vehicle of interest missing');
    expect(parsed.context.parserDebug?.warnings).toContain('Vehicle of interest unknown');
  });

  it('uses phone area code only as a low-confidence location clue when ZIP is missing', () => {
    document.body.innerHTML = `
      <main>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Casey Buyer</h1>
            <div>(404) 555-1222</div>
            <div>2025 Ram 1500 Big Horn #R555121</div>
          </header>
          <article>
            <div>Text From Customer • Today at 12:02 PM Can you send the out the door number?</div>
          </article>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');

    expect(parsed.context.customerZipCode).toBeUndefined();
    expect(parsed.context.phoneNumbers).toContain('(404) 555-1222');
    expect(parsed.context.parserDebug?.warnings).toContain('ZIP missing');
    expect(parsed.context.parserDebug?.warnings).toContain('Phone area estimate only until ZIP is confirmed');
  });

  it('keeps other pipeline leads out of the active lead context', () => {
    document.body.innerHTML = `
      <main>
        <section class="pipeline-card">
          <h2>Glen Stone</h2>
          <div>2025 Jeep Gladiator #BAD999</div>
          <div>Text From Customer Today at 2:12 PM STOP</div>
        </section>
        <section role="dialog" aria-modal="true">
          <header>
            <h1>Joseph Collins</h1>
            <div>Mobile (561) 719-4190</div>
            <div>Address</div>
            <div>11815 W BISCAYNE CANAL RD</div>
            <div>MIAMI FL 33161</div>
            <div>Deal: #29441 / Customer: #349334</div>
            <div>2022 Jeep Gladiator #CV129464</div>
            <div>Sales 1 Ani Sharma</div>
          </header>
          <drc-timeline>
            <drc-past-timeline>
              <ul>
                <li drctimelineitem class="text timeline-item customer">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text From Customer</span>
                      <div class="item-user-fullname">&bull; Ani Sharma </div>
                      <div class="item-details">&bull; Yesterday at 6:18 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content unread">
                      <span>You sent photos of all other gladiators. Is the one I want non existent</span>
                    </div>
                  </drc-timeline-text>
                </li>
                <li drctimelineitem class="text timeline-item user">
                  <drc-timeline-text>
                    <div class="cmp-tml-hd">
                      <span>Text To Customer</span>
                      <div class="item-details">&bull; Yesterday at 5:55 PM</div>
                    </div>
                    <div class="cmp-tml-bd is-content">
                      <span>Thanks. Reply STOP at any time.</span>
                    </div>
                  </drc-timeline-text>
                </li>
              </ul>
            </drc-past-timeline>
          </drc-timeline>
        </section>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(parsed.context.customerName).toBe('Joseph Collins');
    expect(parsed.context.conversationTimeline.length).toBeGreaterThan(0);
    expect(latestCustomer?.text).toMatch(/photos of all other gladiators/i);
    expect(parsed.context.vehicleOfInterest).toBe('2022 Jeep Gladiator');
    expect(parsed.context.stockNumber).toBe('#CV129464');
    expect(parsed.context.communicationCompliance?.status).toBe('clear');
    expect(parsed.context.visibleText).not.toMatch(/BAD999|Glen Stone|Text From Customer Today at 2:12 PM STOP/i);
  });

  it('reads the active Angular deal card and newest customer message from the pasted DriveCentric layout', () => {
    document.body.innerHTML = `
      <main>
        <div class="smart-list">
          <table>
            <tr class="table__row--clickable">
              <td>Manny Pannu</td>
              <td>Wrong pipeline row should not win</td>
            </tr>
          </table>
        </div>
        <mat-dialog-container role="dialog">
          <drc-deal-card>
            <div class="deal-header">
              <div class="deal-customer">
                <span class="cust-name">Manny Pannu</span>
                <span class="hotdeal fas fa-fire-alt"></span>
              </div>
              <div class="deal-enterprise">Taverna Chrysler Dodge Jeep Ram Fiat</div>
              <div class="deal-details">
                <ul>
                  <li class="phone"><span class="phone-detail">(954) 629-5367</span></li>
                  <li class="email"><span class="email-detail">pannu.inc@gmail.com</span></li>
                </ul>
              </div>
              <div class="right-info">
                <div class="customer-numbers"><div class="detailvalue"><span id="detailNumElement">#CV697148</span></div></div>
                <div class="deal-vehicle"><div class="detailvalue">2023 Jeep Wrangler 4xe</div></div>
                <div class="deal-source"><div class="detailvalue">ILM / RunMyLease Inc</div></div>
              </div>
            </div>
            <drc-card-customer>
              <div class="card-customer__name">Manny Pannu</div>
              <div class="card-customer__store">Taverna Chrysler Dodge Jeep Ram Fiat</div>
            </drc-card-customer>
            <drc-card-open-deal>
              <div class="card-open-deal__deal-stage">Visit <span>2 days</span></div>
              <p class="card-open-deal__vehicle-label">2023 Jeep Wrangler 4xe</p>
              <p>Source Internet</p>
              <p>Date Created April 26, 2026</p>
            </drc-card-open-deal>
            <drc-timeline>
              <drc-past-timeline>
                <ul>
                  <li drctimelineitem class="text timeline-item user">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text To Customer</span>
                        <div class="item-user-fullname">&bull; Aniyah Ferguson </div>
                        <div class="item-details">&bull; Monday at 2:03 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content"><span>Yes, Claire is AI system. She responds back to customers outside of business hours.</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Aniyah Ferguson </div>
                        <div class="item-details">&bull; Monday at 1:54 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>Im not trying to play games, I just want a quick and smooth transaction</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Aniyah Ferguson </div>
                        <div class="item-details">&bull; Monday at 1:53 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>But now youre saying you dont talk numbers via phone or email</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Claire Parker </div>
                        <div class="item-details">&bull; Sunday at 11:56 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>The price is $25,825 plus $2k in dealer fees?</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="dealcreated timeline-item">
                    <drc-timeline-deal>
                      <div class="cmp-tml-hd"><span>Deal Created</span><div class="item-details">&bull; Sunday at 11:51 PM</div></div>
                      <div class="cmp-tml-bd"><span>Internet : RunMyLease Inc</span></div>
                    </drc-timeline-deal>
                  </li>
                </ul>
              </drc-past-timeline>
            </drc-timeline>
          </drc-deal-card>
        </mat-dialog-container>
        <aside class="dcai-shell">AI Sales Assistant for Dealerships Latest customer message not found</aside>
        <div id="intercom-container">Open Intercom Messenger, 2 new messages</div>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/visit');
    const latestCustomer = parsed.context.conversationTimeline.find((entry) => entry.actor === 'customer' && entry.direction === 'inbound');

    expect(parsed.isLeadPage).toBe(true);
    expect(parsed.context.customerName).toBe('Manny Pannu');
    expect(parsed.context.vehicleOfInterest).toBe('2023 Jeep Wrangler 4xe');
    expect(parsed.context.stockNumber).toBe('#CV697148');
    expect(parsed.context.leadSource).toContain('ILM / RunMyLease Inc');
    expect(parsed.context.phoneNumbers).toContain('(954) 629-5367');
    expect(parsed.context.emails).toContain('pannu.inc@gmail.com');
    expect(latestCustomer?.text).toMatch(/quick and smooth transaction/i);
    expect(parsed.context.priorMessages.join('\n')).toMatch(/dont talk numbers via phone or email/i);
    expect(parsed.context.visibleText).not.toMatch(/AI Sales Assistant for Dealerships|Intercom Messenger/i);
    expect(parsed.context.parserDebug?.warnings ?? []).not.toContain('Latest customer message not found');
  });

  it('turns visible DriveCentric call summaries and activity notes into parsed decision context', () => {
    document.body.innerHTML = `
      <mat-dialog-container>
        <drc-deal-card>
          <div class="deal-header">
            <h1>Ita vision corp</h1>
            <span>Visit</span>
            <span>Mobile (786) 280-5923</span>
            <span>linatarango@gmail.com</span>
            <span>Address Dania FL 33004</span>
            <span>Deal: #29506 / Customer: #349426</span>
            <span>No Vehicle</span>
            <span>Showroom / Drive By</span>
          </div>
          <drc-timeline>
            <ul>
              <li drctimelineitem class="note timeline-item user">
                <drc-timeline-note>
                  <div class="cmp-tml-hd"><span>Note</span><div class="item-user-fullname">&bull; Daneska Martinez</div><div class="item-details">&bull; Today at 3:35 PM</div></div>
                  <div class="cmp-tml-bd is-content"><span>@Ani Sharma he is calling for you, wants to finalize everything today</span></div>
                </drc-timeline-note>
              </li>
            </ul>
          </drc-timeline>
        </drc-deal-card>
      </mat-dialog-container>
      <div class="cdk-overlay-pane">
        <div class="call-summary-modal">
          <h2>Call Summary</h2>
          <span>Ita vision corp</span>
          <span>Ani Sharma</span>
          <span>April 26, 2026 at 4:03 PM</span>
          <h3>Summary</h3>
          <p>Taverna Chrysler Dodge Jeep Ram Fiat received a call from a customer to discuss the best deal possible on a Wagoneer Upland with a $3,000 down payment. The best payment the customer could reach was around $1,100. The customer said they need the payment to be at or under $1,000 and would not increase the down payment beyond $3,000, noting they are also working another deal and planned to apply online then come in if the price is adjusted within the next four days before month end.</p>
        </div>
      </div>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales/engaged');

    expect(parsed.context.customerName).toBe('Ita vision corp');
    expect(parsed.context.callNotes).toMatch(/Wagoneer Upland/i);
    expect(parsed.context.activitySummary).toMatch(/wants to finalize everything today/i);
    expect(parsed.context.conversationTimeline.length).toBeGreaterThan(0);
    expect(parsed.context.conversationTimeline.some((entry) => /Call summary \/ phone context/i.test(entry.text ?? ''))).toBe(true);
    expect(parsed.context.visibleText).toMatch(/under \$1,000/i);
    expect(parsed.context.parserDebug?.warnings ?? []).not.toContain('Latest customer message not found');
  });

  it('uses Text From Customer as the controlling message and keeps Text To Customer as history only', () => {
    document.body.innerHTML = `
      <main>
        <mat-dialog-container role="dialog">
          <drc-deal-card>
            <div class="deal-header">
              <h1>Brian Patullo</h1>
              <div>Taverna Chrysler Dodge Jeep Ram Fiat</div>
              <div>Mobile (954) 464-6288</div>
              <div>2025 Jeep Wagoneer S Launch Edition AWD #CV651193</div>
              <div>Sales 1 Ani Sharma</div>
            </div>
            <drc-timeline>
              <drc-past-timeline>
                <ul>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Claire Parker</div>
                        <div class="item-details">&bull; Today at 4:10 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>Hey any luck today?</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="note timeline-item user">
                    <drc-timeline-note>
                      <div class="cmp-tml-hd">
                        <span>Note</span>
                        <div class="item-user-fullname">&bull; Maria Bedoya</div>
                        <div class="item-details">&bull; Yesterday at 7:05 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content"><span>@Jonathan Dussan</span></div>
                    </drc-timeline-note>
                  </li>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Claire Parker</div>
                        <div class="item-details">&bull; Yesterday at 5:45 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>Sure no rush</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="text timeline-item user">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text To Customer</span>
                        <div class="item-user-fullname">&bull; Maria Bedoya</div>
                        <div class="item-details">&bull; Yesterday at 5:45 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content"><span>Thank you Brian! Give me some time please just finishing up with a customer</span></div>
                    </drc-timeline-text>
                  </li>
                  <li drctimelineitem class="text timeline-item customer">
                    <drc-timeline-text>
                      <div class="cmp-tml-hd">
                        <span>Text From Customer</span>
                        <div class="item-user-fullname">&bull; Claire Parker</div>
                        <div class="item-details">&bull; Yesterday at 5:29 PM</div>
                      </div>
                      <div class="cmp-tml-bd is-content unread"><span>What does it look like on the lease for the Grand Wagoneer L, base trim</span></div>
                    </drc-timeline-text>
                  </li>
                </ul>
              </drc-past-timeline>
            </drc-timeline>
          </drc-deal-card>
        </mat-dialog-container>
      </main>
    `;

    const parsed = parseDriveCentricPage(document, 'https://app.drivecentric.com/#/pipeline/sales');
    const outbound = parsed.context.conversationTimeline.find((entry) => /finishing up with a customer/i.test(entry.text ?? ''));
    const inboundTexts = parsed.context.conversationTimeline
      .filter((entry) => entry.actor === 'customer' && entry.direction === 'inbound')
      .map((entry) => entry.text ?? '')
      .join('\n');

    expect(parsed.context.customerName).toBe('Brian Patullo');
    expect(parsed.context.vehicleOfInterest).toContain('2025 Jeep Wagoneer S');
    expect(parsed.context.stockNumber).toBe('#CV651193');
    expect(parsed.context.parserDebug?.latestCustomerMessageText).toMatch(/Hey any luck today/i);
    expect(outbound?.actor).toBe('salesperson');
    expect(outbound?.direction).toBe('outbound');
    expect(inboundTexts).toMatch(/Hey any luck today/i);
    expect(inboundTexts).not.toMatch(/finishing up with a customer/i);
  });

});
