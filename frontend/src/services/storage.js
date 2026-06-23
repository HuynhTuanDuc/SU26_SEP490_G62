const USER_KEY = "user";
const REMEMBER_EMAIL_KEY = "rememberEmail";

function safeParseJSON(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  return safeParseJSON(localStorage.getItem(USER_KEY));
}

export function getRememberedEmail() {
  return localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
}

export function saveSession({ user }) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  localStorage.removeItem(USER_KEY);
}

export function saveRememberedEmail(email) {
  if (!email) {
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
    return;
  }

  localStorage.setItem(REMEMBER_EMAIL_KEY, email);
}
