import { type FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { GatewayError, gateway } from './api';
import './unified.css';
import './shell.css';

const navigation = [
  ['/dashboard', 'Dashboard'],
  ['/inventory', 'Inventory'],
  ['/leads', 'Leads'],
  ['/tasks', 'Tasks'],
  ['/marketplace', 'Marketplace'],
  ['/messenger', 'Messenger'],
  ['/bank-brain', 'Bank Brain'],
  ['/connectors', 'Connectors'],
  ['/settings', 'Settings'],
] as const;

export function UnifiedShell() {
  const [sessionState, setSessionState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'offline'>('checking');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    gateway.session()
      .then(() => {
        if (active) setSessionState('authenticated');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSessionState(error instanceof GatewayError && error.status === 401 ? 'unauthenticated' : 'offline');
        setMessage(error instanceof Error ? error.message : 'The XConsole gateway is unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await gateway.login(token);
      setToken('');
      setSessionState('authenticated');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in failed.');
      setSessionState(error instanceof GatewayError && error.status === 401 ? 'unauthenticated' : 'offline');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await gateway.logout();
    } finally {
      setSessionState('unauthenticated');
    }
  }

  if (sessionState !== 'authenticated') {
    return (
      <main className="ux-auth">
        <section className="ux-auth-card" aria-live="polite">
          <div className="ux-brand ux-auth-brand">
            <span className="ux-brand-mark">X</span>
            <div><strong>XConsole</strong><small>Secure dealership workspace</small></div>
          </div>
          {sessionState === 'checking' ? (
            <p className="ux-auth-status">Checking your secure session…</p>
          ) : (
            <>
              <h1>{sessionState === 'offline' ? 'Gateway unavailable' : 'Sign in'}</h1>
              <p>
                {sessionState === 'offline'
                  ? 'Confirm the gateway is running, then retry. You can also enter your dashboard token below.'
                  : 'Enter the dashboard access token configured on the XConsole gateway.'}
              </p>
              <form onSubmit={login}>
                <label htmlFor="dashboard-token">Dashboard token</label>
                <input
                  id="dashboard-token"
                  type="password"
                  autoComplete="current-password"
                  minLength={24}
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                {message && <div className="ux-auth-error" role="alert">{message}</div>}
                <button disabled={submitting} type="submit">
                  {submitting ? 'Signing in…' : 'Open XConsole'}
                </button>
              </form>
              {sessionState === 'offline' && (
                <button className="ux-auth-retry" type="button" onClick={() => window.location.reload()}>
                  Retry connection
                </button>
              )}
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="ux-shell">
      <aside className="ux-sidebar">
        <div className="ux-brand">
          <span className="ux-brand-mark">X</span>
          <div><strong>XConsole</strong><small>Personal dealership OS</small></div>
        </div>
        <nav>
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ux-sidebar-footer">
          <NavLink to="/legacy" className="ux-legacy-link">Legacy command center</NavLink>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="ux-main"><Outlet /></main>
    </div>
  );
}
