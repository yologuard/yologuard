import {
	DOH_ENDPOINTS,
	KNOWN_EXFILTRATION_DOMAINS,
} from '@yologuard/shared'

const SQUID_PORT = 3128 as const

type GenerateSquidConfigParams = {
	readonly allowlist: readonly string[]
	readonly blocklist?: readonly string[]
}

export const generateSquidConfig = ({
	allowlist,
	blocklist = KNOWN_EXFILTRATION_DOMAINS,
}: GenerateSquidConfigParams): string => {
	const lines: string[] = [
		`http_port ${SQUID_PORT} ssl-bump cert=/etc/squid/ssl/squid-ca.pem generate-host-certificates=on dynamic_cert_mem_cache_size=4MB`,
		'',
		'# SSL bump: peek at SNI then splice or terminate',
		'acl step1 at_step SslBump1',
		'ssl_bump peek step1',
		'',
	]

	// Allowed domains ACL
	if (allowlist.length > 0) {
		lines.push('# Allowed domains')
		lines.push(`acl allowed_domains dstdomain ${allowlist.join(' ')}`)
		lines.push('ssl_bump splice allowed_domains')
	}

	lines.push('ssl_bump terminate all')
	lines.push('')

	// Exfiltration blocklist
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

	// Access rules
	if (allowlist.length > 0) {
		lines.push('http_access allow allowed_domains')
	}
	lines.push('http_access deny all')
	lines.push('')

	// Access logging
	lines.push('# Access logging')
	lines.push('logformat yologuard %ts %6tr %>a %Ss/%03>Hs %<st %rm %ru %ssl::>sni')
	lines.push('access_log stdio:/var/log/squid/access.log yologuard')
	lines.push('')

	// Cache and PID
	lines.push('cache deny all')
	lines.push('pid_filename /var/run/squid/squid.pid')
	lines.push('')

	return lines.join('\n')
}
