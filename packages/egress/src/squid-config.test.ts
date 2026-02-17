import { generateSquidConfig } from './squid-config.js'
import {
	DOH_ENDPOINTS,
	KNOWN_EXFILTRATION_DOMAINS,
} from '@yologuard/shared'

describe('generateSquidConfig', () => {
	it('should generate config with allowed domains', () => {
		const allowlist = ['registry.npmjs.org', 'github.com']

		const config = generateSquidConfig({ allowlist })

		expect(config).toContain('acl allowed_domains dstdomain registry.npmjs.org github.com')
		expect(config).toContain('http_access allow CONNECT allowed_domains')
		expect(config).toContain('http_access allow allowed_domains')
	})

	it('should listen on port 3128', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('http_port 3128')
		expect(config).not.toContain('ssl-bump')
	})

	it('should block exfiltration domains by default', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('acl exfiltration_domains dstdomain')
		for (const domain of KNOWN_EXFILTRATION_DOMAINS) {
			expect(config).toContain(domain)
		}
		expect(config).toContain('http_access deny exfiltration_domains')
	})

	it('should block DoH endpoints', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('acl doh_domains dstdomain')
		for (const endpoint of DOH_ENDPOINTS) {
			expect(config).toContain(endpoint)
		}
		expect(config).toContain('http_access deny doh_domains')
	})

	it('should deny all when allowlist is empty', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('http_access deny all')
		expect(config).not.toContain('http_access allow CONNECT')
	})

	it('should accept custom blocklist', () => {
		const config = generateSquidConfig({
			allowlist: [],
			blocklist: ['evil.com', 'malware.net'],
		})

		expect(config).toContain('evil.com')
		expect(config).toContain('malware.net')
		expect(config).not.toContain('pastebin.com')
	})

	it('should include access logging with yologuard format', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('logformat yologuard')
		expect(config).toContain('access_log stdio:/var/log/squid/access.log yologuard')
	})

	it('should deny caching', () => {
		const config = generateSquidConfig({ allowlist: [] })

		expect(config).toContain('cache deny all')
	})
})
