import { type FormEvent, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { GatewayError, gateway } from './api';
import './unified.css';
import './shell.css';

export type ShellContext = {
  logout: () => Promise<void>;
};

function isClientError(error: unknown) {
  return error instanceof GatewayError && error.status >= 400 && error.status < 500;
}

function signInMessage(error: unknown) {
  if (error instanceof GatewayError && error.status === 400) {
    return 'Enter the complete dashboard access code. The code is at least 24 characters.';
  }
  if (error instanceof GatewayError && error.status === 401) {
    return 'That access code is not valid. Check the full code and try again.';
  }
  return error instanceof Error ? error.message : 'Sign-in failed.';
}

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
        setSessionState(isClientError(error) ? 'unauthenticated' : 'offline');
        setMessage(isClientError(error) ? '' : signInMessage(error));
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
      setMessage(signInMessage(error));
      setSessionState(isClientError(error) ? 'unauthenticated' : 'offline');
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
          <div className="ux-auth-brand">
            <span className="ux-brand-mark">X</span>
            <div><strong>XConsole</strong><small>Taverna mission control</small></div>
          </div>
          {sessionState === 'checking' ? (
            <p className="ux-auth-status">Checking your secure session…</p>
          ) : (
            <>
              <p className="ux-eyebrow">{sessionState === 'offline' ? 'Connection problem' : 'Secure access'}</p>
              <h1>{sessionState === 'offline' ? 'Service temporarily unavailable' : 'Open mission control'}</h1>
              <p>
                {sessionState === 'offline'
                  ? 'XConsole could not reach its server. Your data is not lost; retry when the connection is restored.'
                  : 'Enter the complete dashboard access code. It is never saved in the page or placed in a URL.'}
              </p>
              <form onSubmit={login}>
                <label htmlFor="dashboard-token">Dashboard access code</label>
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
                  {submitting ? 'Opening…' : 'Open XConsole'}
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

  return <Outlet context={{ logout } satisfies ShellContext} />;
}
