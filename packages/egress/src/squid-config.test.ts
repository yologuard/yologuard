import { generateSquidConfig } from './squid-config.js'
import {
	DOH_ENDPOINTS,
	KNOWN_EXFILTRATION_DOMAINS,
} from '@yologuard/shared'

describe('generateSquidConfig', () => {
	it('should generate config with allowed domains', () => {
		// Given: an allowlist of domains
		const allowlist = ['registry.npmjs.org', 'github.com']

		// When: generating the squid config
		const config = generateSquidConfig({ allowlist })

		// Then: it includes the allowed domains ACL and splice rule
		expect(config).toContain('acl allowed_domains dstdomain registry.npmjs.org github.com')
		expect(config).toContain('ssl_bump splice allowed_domains')
		expect(config).toContain('http_access allow allowed_domains')
	})

	it('should listen on port 3128 with SSL bump', () => {
		// Given: any config
		const config = generateSquidConfig({ allowlist: [] })

		// Then: it listens on 3128 with ssl-bump
		expect(config).toContain('http_port 3128 ssl-bump')
	})

	it('should block exfiltration domains by default', () => {
		// Given: default blocklist
		const config = generateSquidConfig({ allowlist: [] })

		// Then: it blocks known exfiltration domains
		expect(config).toContain('acl exfiltration_domains dstdomain')
		for (const domain of KNOWN_EXFILTRATION_DOMAINS) {
			expect(config).toContain(domain)
		}
		expect(config).toContain('http_access deny exfiltration_domains')
	})

	it('should block DoH endpoints', () => {
		// Given: any config
		const config = generateSquidConfig({ allowlist: [] })

		// Then: it blocks DNS-over-HTTPS endpoints
		expect(config).toContain('acl doh_domains dstdomain')
		for (const endpoint of DOH_ENDPOINTS) {
			expect(config).toContain(endpoint)
		}
		expect(config).toContain('http_access deny doh_domains')
	})

	it('should terminate all SSL when allowlist is empty', () => {
		// Given: no allowed domains
		const config = generateSquidConfig({ allowlist: [] })

		// Then: it terminates all SSL connections and denies all HTTP
		expect(config).toContain('ssl_bump terminate all')
		expect(config).toContain('http_access deny all')
		expect(config).not.toContain('ssl_bump splice')
	})

	it('should use peek-and-splice for SNI inspection', () => {
		// Given: any config
		const config = generateSquidConfig({ allowlist: ['example.com'] })

		// Then: it peeks at step1 for SNI
		expect(config).toContain('acl step1 at_step SslBump1')
		expect(config).toContain('ssl_bump peek step1')
	})

	it('should accept custom blocklist', () => {
		// Given: a custom blocklist
		const config = generateSquidConfig({
			allowlist: [],
			blocklist: ['evil.com', 'malware.net'],
		})

		// Then: it uses the custom blocklist instead of default
		expect(config).toContain('evil.com')
		expect(config).toContain('malware.net')
		expect(config).not.toContain('pastebin.com')
	})

	it('should include access logging with yologuard format', () => {
		// Given: any config
		const config = generateSquidConfig({ allowlist: [] })

		// Then: it includes the yologuard log format
		expect(config).toContain('logformat yologuard')
		expect(config).toContain('access_log stdio:/var/log/squid/access.log yologuard')
	})

	it('should deny caching', () => {
		// Given: any config
		const config = generateSquidConfig({ allowlist: [] })

		// Then: caching is disabled
		expect(config).toContain('cache deny all')
	})
})
