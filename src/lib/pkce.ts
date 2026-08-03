import { DERIV_APP_ID, TOKEN_EXCHANGE_URL } from '@/lib/config';

const DERIV_AUTH_URL = 'https://auth.deriv.com/oauth2/auth';

const VERIFIER_KEY = 'deriv_pkce_verifier';
const STATE_KEY = 'deriv_oauth_state';

const CODE_VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function generateCodeVerifier(): string {
  const array = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(array).map((v) => CODE_VERIFIER_CHARS[v % 66]).join('');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateState(): string {
  const array = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildOAuthUrl(): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();
  const redirect_uri = window.location.origin;

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: DERIV_APP_ID,
    redirect_uri,
    scope: 'trade account_manage',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  let url = `${DERIV_AUTH_URL}?${params.toString()}`;
  url = url.replace('scope=trade%20account_manage', 'scope=trade+account_manage');
  return url;
}

export function getStoredVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY);
}

export function getStoredState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}

export function clearPKCE() {
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

export function validateState(state: string): boolean {
  const stored = getStoredState();
  return stored !== null && stored === state;
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const verifier = getStoredVerifier();
  if (!verifier) throw new Error('Missing PKCE verifier');
  const redirect_uri = window.location.origin;

  try {
    const res = await fetch(TOKEN_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri }),
    });

    if (res.ok) {
      const data = await res.json();
      clearPKCE();
      return data as TokenResponse;
    }
  } catch (err) {
    console.warn('Token exchange via Supabase edge function failed, trying direct exchange...', err);
  }

  // Fallback to direct token exchange
  const formBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: DERIV_APP_ID,
    code,
    code_verifier: verifier,
    redirect_uri,
  });

  const res = await fetch('https://auth.deriv.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }

  clearPKCE();
  return data as TokenResponse;
}

export { DERIV_APP_ID };

