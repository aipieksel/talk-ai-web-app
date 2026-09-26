const MEMORY = "walkie.session";
const MEMORY_LS = "walkie.session.remember";

let memoryToken = "";

export function getSessionToken(): string {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(MEMORY) || localStorage.getItem(MEMORY_LS) || "";
  } catch {
    return "";
  }
}

export function persistSessionToken(token: string, remember: boolean) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MEMORY, token);
    if (remember) localStorage.setItem(MEMORY_LS, token);
    else localStorage.removeItem(MEMORY_LS);
  } catch {
    /* */
  }
}

export function clearSessionToken() {
  memoryToken = "";
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MEMORY);
    localStorage.removeItem(MEMORY_LS);
  } catch {
    /* */
  }
}

export function sessionFields(): { sessionToken?: string } {
  const sessionToken = getSessionToken();
  return sessionToken ? { sessionToken } : {};
}
