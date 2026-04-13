import { createXdgSessionStore, type Session, type SessionStore } from './session-store.js';

const defaultStore: SessionStore = createXdgSessionStore();

export type { Session, SessionStore };
export { createXdgSessionStore };

export function loadSession(): Promise<Session | null> {
  return defaultStore.load();
}

export function saveSession(session: Session, token: string): Promise<void> {
  return defaultStore.save(session, token);
}

export function clearSession(): Promise<boolean> {
  return defaultStore.clear();
}

export function getSessionToken(): Promise<string | null> {
  return defaultStore.getToken();
}
