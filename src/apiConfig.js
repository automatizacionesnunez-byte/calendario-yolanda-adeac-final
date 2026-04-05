// Centralized API configuration to detect environments automatically
// In development, it defaults to localhost. In production, it uses relative paths 
// so Vercel can route them correctly via proxy or serverless functions.

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE_URL = isLocalhost 
  ? 'http://localhost:3001' 
  : '/api'; // Use relative path for production (Vercel)

export const API_ENDPOINTS = {
  TELEGRAM_STATUS: `${API_BASE_URL}/telegram/status`,
  TELEGRAM_GEN_CODE: `${API_BASE_URL}/telegram/generate-code`,
  TELEGRAM_SETUP_WEBHOOK: `${API_BASE_URL}/telegram/setup-webhook`,
  PLAN_POST: `${API_BASE_URL}/plan-post`,
  GEN_POST: `${API_BASE_URL}/generate-full-post`,
  REFINE_POST: `${API_BASE_URL}/refine-post`
};
