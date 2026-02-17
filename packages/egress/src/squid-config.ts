import { DOH_ENDPOINTS, KNOWN_EXFILTRATION_DOMAINS } from '@yologuard/shared'

const SQUID_PORT = 3128 as const

type GenerateSquidConfigParams = {
  readonly allowlist: readonly string[]
  readonly blocklist?: readonly string[]
}

export const generateSquidConfig = ({
  allowlist,
  blocklist = KNOWN_EXFILTRATION_DOMAINS,
}: GenerateSquidConfigParams): string => {
  const lines: string[] = [`http_port ${SQUID_PORT}`, '']

  // Exfiltration blocklist (checked first — deny before allow)
  if (blocklist.length > 0) {
    lines.push('# Exfiltration domain blocklist')
    lines.push(`acl exfiltration_domains dstdomain ${blocklist.join(' ')}`)
    lines.push('http_access deny exfiltration_domains')
    lines.push('')
  }

  // DoH blocking
  lines.push('# Block DNS-over-HTTPS endpoints')
  lines.push(`acl doh_domains dstdomain ${DOH_ENDPOINTS.join(' ')}`)
  lines.push('http_access deny doh_domains')
  lines.push('')

  // Allowed domains — CONNECT (HTTPS) and HTTP both filtered by destination domain
  if (allowlist.length > 0) {
    lines.push('# Allowed domains')
    lines.push(`acl allowed_domains dstdomain ${allowlist.join(' ')}`)
    lines.push('http_access allow CONNECT allowed_domains')
    lines.push('http_access allow allowed_domains')
  }

  // Deny everything else
  lines.push('http_access deny all')
  lines.push('')

  // Access logging — %ssl::>sni only works with ssl-bump, use %>rd (request domain) instead
  lines.push('# Access logging')
  lines.push('logformat yologuard %ts %6tr %>a %Ss/%03>Hs %<st %rm %ru %>rd')
  lines.push('access_log stdio:/var/log/squid/access.log yologuard')
  lines.push('')

  // Cache and PID
  lines.push('cache deny all')
  lines.push('pid_filename /var/run/squid/squid.pid')
  lines.push('')

  return lines.join('\n')
}
