import "server-only";

let cached: Set<string> | null = null;

export function getAllowedLogins(): Set<string> {
  if (cached) return cached;
  const raw = process.env.HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS ?? "";
  cached = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return cached;
}

export function isLoginAllowed(login: string | null | undefined): boolean {
  if (!login) return false;
  return getAllowedLogins().has(login.toLowerCase());
}
