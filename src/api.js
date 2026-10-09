const TOKEN_KEY = "oneshowlearn_token";
import {recordApiFailure} from './telemetry.js';
const SESSION_EVENT = "oneshowlearn:session";

export function getToken() { return window.localStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(token) {
  token ? window.localStorage.setItem(TOKEN_KEY, token) : window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function subscribeToSession(listener) {
  const onStorage = (event) => { if (event.key === TOKEN_KEY || event.key === null) listener(); };
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(SESSION_EVENT, listener); window.removeEventListener("storage", onStorage); };
}

export async function api(path, options = {}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try{response=await fetch(`/api${path}`, { ...options, headers });}catch(e){if(e.name!=='AbortError')recordApiFailure();throw e;}
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if(response.status>=500)recordApiFailure();
    const error = new Error(data?.error || (response.status === 429 ? "操作过于频繁，请稍后再试" : "请求失败，请稍后重试"));
    error.status = response.status;
    error.code = data?.code;
    error.cooldownSeconds = Number(data?.cooldownSeconds || response.headers.get("Retry-After")) || 0;
    throw error;
  }
  return data;
}

export const money = (cents = 0) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
