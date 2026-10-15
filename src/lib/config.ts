// Deriv WebSocket Application ID (must be integer, 1089 is the standard public app ID)
export const DERIV_WS_APP_ID = import.meta.env.VITE_DERIV_WS_APP_ID || '1089';
export const DERIV_APP_ID = DERIV_WS_APP_ID;

// Deriv OAuth 2.0 Client ID (registered on auth.deriv.com)
// 343aX4kokbJ7cI5C42ytV is the registered client ID matching the Supabase token exchange edge function
export const DERIV_OAUTH_CLIENT_ID = import.meta.env.VITE_DERIV_OAUTH_CLIENT_ID || '343aX4kokbJ7cI5C42ytV';

export const DERIV_API_URL = import.meta.env.VITE_DERIV_API_URL || 'https://api.derivws.com';
export const PUBLIC_WS_URL = `wss://api.derivws.com/trading/v1/options/ws/public?app_id=${DERIV_WS_APP_ID}`;
export const TOKEN_EXCHANGE_URL = import.meta.env.VITE_TOKEN_EXCHANGE_URL || 'https://umnsatnhehymerpwdpze.supabase.co/functions/v1/deriv-token-exchange';
export const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 'https://digitflowhub.vercel.app';
export const DERIV_REDIRECT_URI = import.meta.env.VITE_DERIV_REDIRECT_URI || '';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://umnsatnhehymerpwdpze.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtbnNhdG5oZWh5bWVycHdkcHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjMwNjEsImV4cCI6MjEwMTI5OTA2MX0.QenrSpz2inNWBft1WVRNEivrhgmx6dsapi0b5BIzrqs';


