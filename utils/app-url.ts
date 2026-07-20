const APP_URL_ENV = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function configuredOrigin() {
  return normalizeOrigin(APP_URL_ENV) ?? normalizeOrigin(process.env.VERCEL_URL);
}

export function appOrigin(requestOrigin?: string | null) {
  return configuredOrigin() ?? normalizeOrigin(requestOrigin) ?? "http://localhost:3000";
}

export function appPath(value: string | null | undefined) {
  if (!value) return "/";
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

export function appUrl(path = "/", requestOrigin?: string | null) {
  return new URL(appPath(path), appOrigin(requestOrigin)).toString();
}

