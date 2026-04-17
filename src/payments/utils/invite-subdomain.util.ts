/** Nhãn DNS một cấp (RFC 1035-ish): chữ thường, số, gạch giữa; 1–63 ký tự. */
export const INVITE_SUBDOMAIN_LABEL_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED_INVITE_SUBDOMAINS = new Set(
  [
    'www',
    'api',
    'app',
    'admin',
    'mail',
    'email',
    'ftp',
    'cdn',
    'static',
    'assets',
    'staging',
    'dev',
    'test',
    'localhost',
    'invite',
    'invites',
    'payment',
    'payments',
    'popular',
  ].map((s) => s.toLowerCase()),
);

export function tryNormalizeInviteSubdomain(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const s = raw.trim().toLowerCase();
  if (!s) {
    return null;
  }
  if (!INVITE_SUBDOMAIN_LABEL_RE.test(s) || RESERVED_INVITE_SUBDOMAINS.has(s)) {
    return null;
  }
  return s;
}

export function buildInviteSubdomainPublicUrl(
  subdomain: string | null | undefined,
  rootDomain: string | null | undefined,
  protocol: 'http' | 'https',
): string | null {
  const sub = subdomain?.trim().toLowerCase();
  const root = rootDomain
    ?.trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');
  if (!sub || !root) {
    return null;
  }
  return `${protocol}://${sub}.${root}/`;
}
