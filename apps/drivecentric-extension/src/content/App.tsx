import { useEffect, useState } from 'react';
import type {
  AiGenerateResponse,
  Channel,
  PublicUser,
  QuickAction,
  ResponseRoleMode,
  Tone,
  UserPermission,
} from '@drivecentric-ai/shared';
import { CHANNELS, QUICK_ACTIONS, TONES } from '@drivecentric-ai/shared';
import { sendExtensionMessage } from '../shared/messages';
import { parseDriveCentricPage } from './drivecentric/parser';
import { insertTextIntoDriveCentric } from './page-actions';

const actionLabels: Record<QuickAction, string> = {
  generate_reply: 'Generate reply',
  rewrite_shorter: 'Rewrite shorter',
  rewrite_stronger: 'Rewrite stronger',
  humanize: 'More human',
  appointment_push: 'Appointment push',
  trade_in_push: 'Trade-in push',
  finance_push: 'Finance push',
  reengage_ghosted: 'Re-engage ghosted',
  confirm_appointment: 'Confirm appointment',
  missed_appointment_follow_up: 'Missed appointment',
  sold_follow_up: 'Sold follow-up',
};

const toneLabels: Record<Tone, string> = {
  standard_closer: 'Standard closer',
  soft_consultative: 'Soft consultative',
  aggressive_appointment_setter: 'Aggressive appointment setter',
  manager_takeover: 'Manager takeover',
};

const channelLabels: Record<Channel, string> = {
  sms: 'SMS',
  email: 'Email',
  crm_note: 'CRM note',
};

const actionPermissions: Partial<Record<QuickAction, UserPermission>> = {
  appointment_push: 'canUseAppointmentPush',
  trade_in_push: 'canUseTradePush',
  finance_push: 'canUseFinancePush',
  reengage_ghosted: 'canUseReengageGhosted',
  confirm_appointment: 'canUseConfirmAppointment',
  missed_appointment_follow_up: 'canUseMissedAppointment',
  sold_follow_up: 'canUseSoldFollowUp',
};

const channelPermissions: Record<Channel, UserPermission> = {
  sms: 'canGenerateSms',
  email: 'canGenerateEmail',
  crm_note: 'canGenerateCrmNote',
};

const tonePermissions: Record<Tone, UserPermission> = {
  standard_closer: 'canUseStandardTone',
  soft_consultative: 'canUseSoftTone',
  aggressive_appointment_setter: 'canUseAggressiveTone',
  manager_takeover: 'canUseManagerTone',
};

interface AuthStatus {
  authenticated: boolean;
  user?: PublicUser;
}

export function ContentApp() {
  const [collapsed, setCollapsed] = useState(true);
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false });
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState<Channel>('sms');
  const [tone, setTone] = useState<Tone>('standard_closer');
  const [roleMode, setRoleMode] = useState<ResponseRoleMode>('salesperson');
  const [draft, setDraft] = useState<AiGenerateResponse | null>(null);
  const [selectedAction, setSelectedAction] = useState<QuickAction>('generate_reply');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [ask, setAsk] = useState('');
  const [parsed, setParsed] = useState(() => parseDriveCentricPage(document, window.location.href));
  const [lastReadAt, setLastReadAt] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const refreshAuth = () => {
      sendExtensionMessage<AuthStatus>({ type: 'AUTH_STATUS' })
        .then(setAuth)
        .catch((err) => setError(err.message));
    };
    refreshAuth();
    const intervalId = window.setInterval(refreshAuth, 1500);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let timeoutId: number | undefined;
    const refresh = () => {
      setParsed(parseDriveCentricPage(document, window.location.href));
      setLastReadAt(new Date().toLocaleTimeString());
    };
    const debouncedRefresh = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(refresh, 250);
    };
    const target = document.body ?? document.documentElement;
    const observer = new MutationObserver(debouncedRefresh);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    window.addEventListener('focus', refresh);
    refresh();

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', refresh);
      observer.disconnect();
    };
  }, []);

  function hasPermission(permission: UserPermission) {
    return auth.user?.role === 'owner' || Boolean(auth.user?.permissions?.includes(permission));
  }

  function canSwitchRoleMode() {
    return auth.user?.role === 'owner' || auth.user?.role === 'manager';
  }

  function canUseAction(action: QuickAction) {
    const permission = actionPermissions[action];
    return hasPermission('canUseAi') && (!permission || hasPermission(permission));
  }

  function canUseChannel(item: Channel) {
    return hasPermission(channelPermissions[item]);
  }

  function canUseTone(item: Tone) {
    return hasPermission(tonePermissions[item]);
  }

  useEffect(() => {
    if (!auth.authenticated) return;
    const nextChannel = CHANNELS.find(canUseChannel);
    const nextTone = TONES.find(canUseTone);
    if (nextChannel && !canUseChannel(channel)) setChannel(nextChannel);
    if (nextTone && !canUseTone(tone)) setTone(nextTone);
  }, [auth.authenticated, auth.user, channel, tone]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const response = await sendExtensionMessage<{ user: PublicUser }>({
        type: 'AUTH_LOGIN',
        userId,
        password,
      });
      setAuth({ authenticated: true, user: response.user });
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await sendExtensionMessage({ type: 'AUTH_LOGOUT' });
    setAuth({ authenticated: false });
  }

  async function generate(action: QuickAction) {
    setSelectedAction(action);
    setError('');
    setCopied('');
    if (!canUseAction(action)) {
      setError('This action is not enabled for your user. Ask an admin to update your permissions.');
      return;
    }
    if (!canUseChannel(channel) || !canUseTone(tone)) {
      setError('This channel or tone is not enabled for your user.');
      return;
    }
    setLoading(true);
    try {
      const latest = parseDriveCentricPage(document, window.location.href);
      const response = await sendExtensionMessage<AiGenerateResponse>({
        type: 'AI_GENERATE',
        payload: {
          action,
          channel,
          tone,
          roleMode,
          conversationId: latest.conversationId,
          leadContext: latest.context,
          userDraft: ask ? `Salesperson ask: ${ask}` : '',
        },
      });
      setDraft(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied('Copied');
  }

  function insert(text: string) {
    setCopied(insertTextIntoDriveCentric(text) ? 'Inserted' : 'Click the CRM reply box, then insert again');
  }

  if (collapsed) {
    return (
      <aside className="dcai-shell collapsed">
        <button className="dcai-button primary" onClick={() => setCollapsed(false)}>
          AI
        </button>
      </aside>
    );
  }

  return (
    <aside className="dcai-shell">
      <header className="dcai-header">
        <div>
          <p className="dcai-kicker">DriveCentric AI</p>
          <p className="dcai-title">{auth.authenticated ? auth.user?.name ?? 'Sales assistant' : 'Login required'}</p>
        </div>
        <button className="dcai-icon" onClick={() => setCollapsed(true)}>
          Min
        </button>
      </header>
      <div className="dcai-body">
        {!auth.authenticated ? (
          <section className="dcai-section">
            <h3>Login</h3>
            <div className="dcai-grid">
              <input className="dcai-input" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} />
              <input
                className="dcai-input"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button className="dcai-button primary" disabled={loading} onClick={handleLogin}>
                {loading ? 'Signing in' : 'Sign in'}
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="dcai-section">
              <h3>Lead Snapshot</h3>
              <div className="dcai-grid">
                <div className="dcai-row">
                  <span>Customer</span>
                  <strong>{parsed.context.customerName ?? 'Unknown'}</strong>
                </div>
                <div className="dcai-row">
                  <span>Vehicle</span>
                  <strong>{parsed.context.vehicleOfInterest ?? 'Need to verify'}</strong>
                </div>
                <div className="dcai-row">
                  <span>Stock</span>
                  <strong>{parsed.context.stockNumber ?? 'Missing'}</strong>
                </div>
                <div className="dcai-row">
                  <span>Lead score</span>
                  <strong>{draft?.leadScore ?? parsed.context.leadScore}</strong>
                </div>
                <div className="dcai-row">
                  <span>Sentiment</span>
                  <strong>{parsed.context.sentiment}</strong>
                </div>
                <div className="dcai-row">
                  <span>Reader</span>
                  <strong>{parsed.isLeadPage ? 'Watching messages' : 'Waiting for lead page'}</strong>
                </div>
                <div className="dcai-row">
                  <span>Last read</span>
                  <strong>{lastReadAt}</strong>
                </div>
              </div>
              {parsed.context.crmAutomationHints.length > 0 && (
                <p className="dcai-note">{parsed.context.crmAutomationHints.join(' ')}</p>
              )}
            </section>

            <section className="dcai-section">
              <h3>Recommended Next Move</h3>
              <p className="dcai-muted">
                {draft?.nextBestAction ??
                  (parsed.isLeadPage
                    ? 'Answer the latest question and push for a specific appointment.'
                    : 'Open a DriveCentric lead or customer page.')}
              </p>
            </section>

            <section className="dcai-section">
              <h3>Controls</h3>
              <div className="dcai-grid">
                <select className="dcai-select" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
                  {CHANNELS.map((item) => (
                    <option key={item} value={item} disabled={!canUseChannel(item)}>
                      {channelLabels[item]} {!canUseChannel(item) ? '(locked)' : ''}
                    </option>
                  ))}
                </select>
                <select className="dcai-select" value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                  {TONES.map((item) => (
                    <option key={item} value={item} disabled={!canUseTone(item)}>
                      {toneLabels[item]} {!canUseTone(item) ? '(locked)' : ''}
                    </option>
                  ))}
                </select>
                {canSwitchRoleMode() && (
                  <select className="dcai-select" value={roleMode} onChange={(event) => setRoleMode(event.target.value as ResponseRoleMode)}>
                    <option value="salesperson">Act as salesperson</option>
                    <option value="manager">Act as manager</option>
                  </select>
                )}
                <button
                  className="dcai-button primary"
                  disabled={loading || !hasPermission('canUseAi') || !canUseChannel(channel) || !canUseTone(tone)}
                  onClick={() => generate(selectedAction)}
                >
                  {loading ? 'Working' : 'Generate reply'}
                </button>
              </div>
              <div className="dcai-ask">
                <input
                  className="dcai-input"
                  placeholder="Ask: price objection, trade angle, payment close..."
                  value={ask}
                  onChange={(event) => setAsk(event.target.value)}
                />
                <button className="dcai-button" disabled={loading} onClick={() => generate(selectedAction)}>
                  Ask
                </button>
              </div>
            </section>

            <section className="dcai-section">
              <h3>Quick Actions</h3>
              <div className="dcai-actions">
                {QUICK_ACTIONS.map((action) => (
                  <button className="dcai-button" key={action} disabled={loading || !canUseAction(action)} onClick={() => generate(action)}>
                    {actionLabels[action]}
                  </button>
                ))}
              </div>
            </section>

            <section className="dcai-section">
              <h3>AI Draft</h3>
              <div className="dcai-grid">
                {draft?.options.map((option) => (
                  <article className="dcai-draft" key={option.label}>
                    <div className="dcai-draft-head">
                      <span>{option.label}</span>
                      <span>{option.score}/100</span>
                    </div>
                    <p>{option.text}</p>
                    {option.flags.length > 0 && <span className="dcai-badge">{option.flags.join(', ')}</span>}
                    <div className="dcai-footer-actions">
                      <button className="dcai-button primary" disabled={!hasPermission('canCopyDrafts')} onClick={() => copy(option.text)}>
                        Copy
                      </button>
                      <button className="dcai-button" disabled={!hasPermission('canInsertIntoCrm')} onClick={() => insert(option.text)}>
                        Insert
                      </button>
                    </div>
                  </article>
                )) ?? <p className="dcai-muted">Ready when the lead is open.</p>}
              </div>
            </section>

            <section className="dcai-section">
              <h3>Objection Handling</h3>
              <p className="dcai-muted">
                {parsed.context.tradeInfo
                  ? 'Trade angle is available. Ask for VIN, miles, payoff, and push the appraisal.'
                  : 'Use price, payment, trade, and availability pushes based on the latest customer message.'}
              </p>
            </section>

            <section className="dcai-section">
              <h3>Follow-Up Sequence</h3>
              <p className="dcai-muted">
                {parsed.context.appointmentStatus
                  ? `Appointment: ${parsed.context.appointmentStatus}`
                  : 'New lead, second touch, ghosted lead, confirmation, missed appointment, sold.'}
              </p>
            </section>

            <section className="dcai-section">
              <h3>Notes/Manager Assist</h3>
              <p className="dcai-muted">
                {draft?.complianceFlags.length
                  ? `Review flags: ${draft.complianceFlags.join(', ')}`
                  : 'Escalate manager takeover when price disputes, legal language, finance guarantees, or anger show up.'}
              </p>
              <button className="dcai-button warning" onClick={handleLogout}>
                Logout
              </button>
            </section>
          </>
        )}
        {error && <p className="dcai-alert">{error}</p>}
        {copied && <p className="dcai-badge">{copied}</p>}
      </div>
    </aside>
  );
}
