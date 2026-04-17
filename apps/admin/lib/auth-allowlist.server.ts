import "server-only";

let cachedRaw: string | null = null;
let cached: Set<string> | null = null;

export function getAllowedLogins(): Set<string> {
  const raw = process.env.HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS ?? "";
  if (cached && raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return cached;
}

export function isLoginAllowed(login: string | null | undefined): boolean {
  if (!login) return false;
  return getAllowedLogins().has(login.toLowerCase());
}
