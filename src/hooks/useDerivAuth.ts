import { useEffect, useRef, useState, useCallback } from 'react';
import { buildOAuthUrl, exchangeCodeForToken, validateState, clearPKCE } from '@/lib/pkce';
import { DERIV_APP_ID, DERIV_API_URL } from '@/lib/config';

const TOKEN_KEY = 'deriv_api_token';

export type Account = {
  loginid: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
};

export type AccountInfo = {
  loginid: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
  isActive: boolean;
};

export type TradeResult = {
  success: boolean;
  contractId?: string;
  error?: string;
};

type PendingRequest = {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
};

let wsInstance: WebSocket | null = null;
let authToken: string | null = null;
let reqIdCounter = 100;
let connectPromise: Promise<WebSocket> | null = null;
let activeAccountId: string | null = null;

const pending = new Map<number, PendingRequest>();
const listeners = new Set<(account: Account | null) => void>();
const accountListListeners = new Set<(accounts: AccountInfo[]) => void>();
const contractSubs = new Map<string, Set<(data: Record<string, unknown>) => void>>();

function nextReqId() {
  reqIdCounter += 1;
  return reqIdCounter;
}

function notifyParentSession(type: string, payload: Record<string, unknown> = {}) {
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'digitflow',
        type,
        ...payload,
      }, '*');
    }
  } catch {
    // Cross-origin restriction
  }
}

async function getOtpUrl(accountId: string, token: string): Promise<string> {
  const res = await fetch(`${DERIV_API_URL}/trading/v1/options/accounts/${accountId}/otp`, {
    method: 'POST',
    headers: {
      'Deriv-App-ID': DERIV_APP_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Failed to get OTP WebSocket URL');
  }
  const data = await res.json();
  return data.data.url;
}

function disconnectWs() {
  if (wsInstance) {
    const wsToClose = wsInstance;
    if (wsToClose.readyState === WebSocket.CONNECTING) {
      wsToClose.onopen = () => {
        wsToClose.close();
      };
    } else {
      wsToClose.close();
    }
    wsInstance = null;
  }
  connectPromise = null;
}

function connectWsForAccount(accountId: string, token: string, setAccounts: React.Dispatch<React.SetStateAction<AccountInfo[]>>): Promise<WebSocket> {
  activeAccountId = accountId;
  disconnectWs();

  connectPromise = (async () => {
    try {
      const url = await getOtpUrl(accountId, token);
      const ws = new WebSocket(url);
      wsInstance = ws;

      ws.onopen = () => {
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);
        
        // Save interval so we can clear it
        (ws as any)._pingInterval = pingInterval;

        // Subscribe to balance updates
        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        
        // Resubscribe to any active contracts
        contractSubs.forEach((_, contractId) => {
          ws.send(JSON.stringify({
            proposal_open_contract: 1,
            contract_id: Number(contractId),
            subscribe: 1,
            req_id: nextReqId(),
          }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as Record<string, any>;
          const reqId = data.req_id as number | undefined;
          const errMsg = (data.error && (data.error as any).message) ? (data.error as any).message as string : '';

          if (data.msg_type === 'balance') {
            const bal = data.balance as any | undefined;
            if (bal && bal.loginid === activeAccountId) {
              const updatedAccount: Account = {
                loginid: bal.loginid as string,
                currency: bal.currency as string,
                balance: bal.balance as number,
                isVirtual: String(bal.loginid).startsWith('VR'),
              };
              listeners.forEach((fn) => fn(updatedAccount));
              notifyParentSession('DIGITFLOW_BALANCE_UPDATE', { account: updatedAccount });
              
              // Update balance in the accounts list
              setAccounts((prev) => {
                const updated = prev.map((x) =>
                  x.loginid === bal.loginid
                    ? { ...x, balance: bal.balance as number }
                    : x
                );
                accountListListeners.forEach((fn) => fn(updated));
                return updated;
              });
            }
          }

          if (data.msg_type === 'proposal_open_contract') {
            const poc = data.proposal_open_contract as any | undefined;
            const cid = poc?.contract_id as string | number | undefined;
            if (cid && contractSubs.has(String(cid))) {
              contractSubs.get(String(cid))!.forEach(fn => fn(data));
            }
          }

          if (reqId && pending.has(reqId)) {
            const { resolve: res, reject: rej } = pending.get(reqId)!;
            pending.delete(reqId);
            if (data.error) rej(new Error(errMsg));
            else res(data);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if ((ws as any)._pingInterval) {
          clearInterval((ws as any)._pingInterval);
        }
        if (activeAccountId === accountId && authToken) {
          setTimeout(() => {
            if (activeAccountId === accountId && authToken) {
              connectWsForAccount(accountId, authToken, setAccounts).catch(() => {});
            }
          }, 2000);
        }
      };

      return ws;
    } catch (e) {
      if (activeAccountId === accountId && authToken) {
        setTimeout(() => {
          if (activeAccountId === accountId && authToken) {
            connectWsForAccount(accountId, authToken, setAccounts).catch(() => {});
          }
        }, 5000);
      }
      throw e;
    }
  })();

  return connectPromise;
}

function ensureWs(): Promise<WebSocket> {
  if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
    return Promise.resolve(wsInstance);
  }
  if (connectPromise) {
    return connectPromise;
  }
  return Promise.reject(new Error('WebSocket is not connected. Please log in.'));
}

function sendRequest<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  return ensureWs().then((ws) => {
    const reqId = nextReqId();
    const payloadWithId = { ...payload, req_id: reqId };
    return new Promise<T>((resolve, reject) => {
      pending.set(reqId, {
        resolve: resolve as (d: Record<string, unknown>) => void,
        reject,
      });
      ws.send(JSON.stringify(payloadWithId));
      setTimeout(() => {
        if (pending.has(reqId)) {
          pending.delete(reqId);
          reject(new Error('Request timeout'));
        }
      }, 15000);
    });
  });
}

export function useDerivAuth() {
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    listeners.add(setAccount);
    accountListListeners.add(setAccounts);
    return () => {
      listeners.delete(setAccount);
      accountListListeners.delete(setAccounts);
    };
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      authToken = token;
      
      const accountsRes = await fetch(`${DERIV_API_URL}/trading/v1/options/accounts`, {
        method: 'GET',
        headers: {
          'Deriv-App-ID': DERIV_APP_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!accountsRes.ok) {
        const errorData = await accountsRes.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch accounts list');
      }

      const { data: rawAccounts } = await accountsRes.json();
      if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) {
        throw new Error('No Options accounts found');
      }

      const mappedAccounts: AccountInfo[] = rawAccounts.map((a: any) => ({
        loginid: a.account_id,
        currency: a.currency,
        balance: a.balance || 0,
        isVirtual: a.account_type === 'demo' || String(a.account_id).startsWith('VR'),
        isActive: a.status === 'active',
      }));

      let active = mappedAccounts.find((a) => a.isActive);
      if (!active) {
        active = mappedAccounts[0];
        active.isActive = true;
      }

      const activeAccount: Account = {
        loginid: active.loginid,
        currency: active.currency,
        balance: active.balance,
        isVirtual: active.isVirtual,
      };

      setAccount(activeAccount);
      setAccounts(mappedAccounts);
      localStorage.setItem(TOKEN_KEY, token);

      accountListListeners.forEach((fn) => fn(mappedAccounts));
      listeners.forEach((fn) => fn(activeAccount));
      notifyParentSession('DIGITFLOW_SESSION_LOGIN', {
        token,
        account: activeAccount,
        accounts: mappedAccounts,
      });

      await connectWsForAccount(active.loginid, token, setAccounts);
    } catch (err) {
      authToken = null;
      setAccount(null);
      setAccounts([]);
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      localStorage.removeItem(TOKEN_KEY);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const selectAccount = useCallback(async (loginid: string) => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      let selectedAccount: Account | undefined;
      
      setAccounts((prev) => {
        const updated = prev.map((a) => ({
          ...a,
          isActive: a.loginid === loginid,
        }));
        accountListListeners.forEach((fn) => fn(updated));
        
        const s = prev.find((a) => a.loginid === loginid);
        if (s) {
          selectedAccount = {
            loginid: s.loginid,
            currency: s.currency,
            balance: s.balance,
            isVirtual: s.isVirtual,
          };
        }
        return updated;
      });

      if (selectedAccount) {
        setAccount(selectedAccount);
        listeners.forEach((fn) => fn(selectedAccount!));
        notifyParentSession('DIGITFLOW_ACCOUNT_SWITCH', { account: selectedAccount });
      }

      await connectWsForAccount(loginid, authToken, setAccounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch account');
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  const logout = useCallback(() => {
    authToken = null;
    activeAccountId = null;
    setAccount(null);
    setAccounts([]);
    localStorage.removeItem(TOKEN_KEY);
    disconnectWs();
    notifyParentSession('DIGITFLOW_SESSION_LOGOUT');
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!authToken || !activeAccountId) return;
    try {
      const accountsRes = await fetch(`${DERIV_API_URL}/trading/v1/options/accounts`, {
        method: 'GET',
        headers: {
          'Deriv-App-ID': DERIV_APP_ID,
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (accountsRes.ok) {
        const { data: rawAccounts } = await accountsRes.json();
        const activeRaw = rawAccounts.find((a: any) => a.account_id === activeAccountId);
        if (activeRaw) {
          const updatedAccount: Account = {
            loginid: activeRaw.account_id,
            currency: activeRaw.currency,
            balance: activeRaw.balance || 0,
            isVirtual: activeRaw.account_type === 'demo' || String(activeRaw.account_id).startsWith('VR'),
          };
          setAccount(updatedAccount);
          listeners.forEach((fn) => fn(updatedAccount));

          setAccounts((prev) => {
            const updated = prev.map((x) =>
              x.loginid === activeAccountId
                ? { ...x, balance: activeRaw.balance || 0 }
                : x
            );
            accountListListeners.forEach((fn) => fn(updated));
            return updated;
          });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const placeTrade = useCallback(async (params: {
    symbol: string;
    contractType: string;
    barrier?: string;
    amount: number;
    duration: number;
    durationUnit: string;
    basis?: string;
  }): Promise<TradeResult> => {
    if (!authToken) return { success: false, error: 'Not logged in' };
    try {
      const proposalPayload: Record<string, unknown> = {
        proposal: 1,
        amount: params.amount,
        basis: params.basis ?? 'stake',
        contract_type: params.contractType,
        currency: account?.currency ?? 'USD',
        duration: params.duration,
        duration_unit: params.durationUnit,
        underlying_symbol: params.symbol,
      };
      if (params.barrier) proposalPayload.barrier = params.barrier;

      const proposal = await sendRequest<{ proposal?: Record<string, unknown> }>(proposalPayload);
      const proposalId = proposal.proposal?.id as string;
      if (!proposalId) throw new Error('No proposal ID returned');

      const buyRes = await sendRequest<{ buy?: Record<string, unknown> }>({
        buy: proposalId,
        price: proposal.proposal?.ask_price as number,
      });
      const contractId = String(buyRes.buy?.contract_id);
      return { success: true, contractId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Trade failed' };
    }
  }, [account]);

  const watchContract = useCallback((contractId: string, onUpdate: (data: Record<string, unknown>) => void) => {
    if (!contractSubs.has(contractId)) {
      contractSubs.set(contractId, new Set());
    }
    contractSubs.get(contractId)!.add(onUpdate);
    ensureWs().then((ws) => {
      ws.send(JSON.stringify({
        proposal_open_contract: 1,
        contract_id: Number(contractId),
        subscribe: 1,
        req_id: nextReqId(),
      }));
    });
    return () => {
      const subs = contractSubs.get(contractId);
      if (subs) {
        subs.delete(onUpdate);
        if (subs.size === 0) {
          contractSubs.delete(contractId);
        }
      }
    };
  }, []);

  const loginWithOAuth = useCallback(async (customRedirectUri?: string) => {
    try {
      setLoading(true);
      setError(null);
      const url = await buildOAuthUrl(customRedirectUri);
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (isIframe) {
        // auth.deriv.com denies iframe rendering (X-Frame-Options: DENY).
        // Open OAuth inside a centered popup window so login succeeds without breaking out of the host page.
        const width = 560;
        const height = 720;
        const left = Math.max(0, Math.floor((window.screen.width - width) / 2));
        const top = Math.max(0, Math.floor((window.screen.height - height) / 2));
        const popup = window.open(
          url,
          'deriv_oauth_popup',
          `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          // If browser popup blocker intervened, try navigating top window if permissible
          try {
            if (window.top) {
              window.top.location.href = url;
              return;
            }
          } catch {
            // Cross-origin top navigation restricted
          }
          throw new Error('Login popup was blocked by browser. Please allow popups or connect with an API Token.');
        }
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth login');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOAuthCallback = useCallback(async (): Promise<boolean> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return false;

    if (!validateState(state)) {
      clearPKCE();
      setError('OAuth state mismatch — possible CSRF attack');
      window.history.replaceState({}, '', window.location.pathname);
      return false;
    }

    try {
      setLoading(true);
      const tokenRes = await exchangeCodeForToken(code);

      // If this window was opened as an OAuth popup by an iframe or another window:
      if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(
            {
              source: 'digitflow',
              type: 'DERIV_AUTH_SUCCESS',
              token: tokenRes.access_token,
            },
            '*'
          );
          window.close();
          return true;
        } catch {
          // If cross-window postMessage fails, proceed with login in current window
        }
      }

      await loginWithToken(tokenRes.access_token);
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    } catch (err) {
      clearPKCE();
      const msg = err instanceof Error ? err.message : 'OAuth login failed';
      setError(msg);
      window.history.replaceState({}, '', window.location.pathname);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loginWithToken]);

  // Listen for login / session messages from parent website or OAuth popups
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data;

      // 1. Session token received from parent website, popup, or external script
      if (
        data.type === 'DERIV_AUTH_SUCCESS' ||
        data.type === 'DERIV_SET_TOKEN' ||
        data.type === 'DERIV_SET_SESSION' ||
        data.type === 'DERIV_AUTH_TOKEN' ||
        data.type === 'LOGIN_SESSION' ||
        data.type === 'DERIV_SESSION_RESPONSE' ||
        data.action === 'setToken' ||
        data.action === 'login' ||
        (data.source === 'parent' && data.token)
      ) {
        const token = data.token || data.access_token;
        if (typeof token === 'string' && token.trim().length > 0) {
          loginWithToken(token.trim())
            .then(() => {
              if (event.source && 'postMessage' in event.source) {
                try {
                  (event.source as Window).postMessage(
                    {
                      source: 'digitflow',
                      type: 'DIGITFLOW_SESSION_ACK',
                      success: true,
                    },
                    '*'
                  );
                } catch {}
              }
            })
            .catch((err) => {
              console.error('Failed to log in with received message token:', err);
            });
        }
      }

      // 2. Logout requested from parent
      if (data.type === 'DERIV_LOGOUT' || data.action === 'logout') {
        logout();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [loginWithToken, logout]);

  // Initial mount: check URL parameters, hash, or local storage
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // Check for tokens passed directly (e.g., when embedded in iframe: ?token=xxx or #token=xxx)
    const directToken =
      urlParams.get('token') ||
      urlParams.get('access_token') ||
      urlParams.get('deriv_token') ||
      urlParams.get('api_token') ||
      hashParams.get('token') ||
      hashParams.get('access_token');

    const code = urlParams.get('code');

    if (directToken) {
      loginWithToken(directToken.trim())
        .then(() => {
          // Remove sensitive token from URL for security
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch(() => {
          const stored = localStorage.getItem(TOKEN_KEY);
          if (stored) {
            loginWithToken(stored).catch(() => localStorage.removeItem(TOKEN_KEY));
          }
        });
    } else if (code) {
      handleOAuthCallback();
    } else {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        loginWithToken(stored).catch(() => localStorage.removeItem(TOKEN_KEY));
      } else if (typeof window !== 'undefined' && window.self !== window.top) {
        // Embedded in iframe and no local token: request session from parent website
        notifyParentSession('DIGITFLOW_REQUEST_SESSION');
      }
    }
  }, [handleOAuthCallback, loginWithToken]);

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  return {
    account,
    accounts,
    loading,
    error,
    loginWithOAuth,
    loginWithToken,
    logout,
    refreshBalance,
    placeTrade,
    watchContract,
    selectAccount,
    isIframe,
  };
}

