const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function emailDomain(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  const angleAddress = trimmed.match(/<([^<>]+)>$/)?.[1];
  const address = (angleAddress ?? trimmed).trim();
  const atIndex = address.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === address.length - 1) return null;

  const domain = address.slice(atIndex + 1).toLowerCase().replace(/\.$/, "");
  return DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function domainFaviconUrl(value: string | null | undefined): string | null {
  const domain = emailDomain(value);
  return domain ? `https://${domain}/favicon.ico` : null;
}

export function domainFaviconUrls(value: string | null | undefined): string[] {
  const domain = emailDomain(value);
  if (!domain) return [];
  return [
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
  ];
}
