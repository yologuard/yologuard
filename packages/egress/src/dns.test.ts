import { generateDnsmasqConfig } from './dns.js'

describe('generateDnsmasqConfig', () => {
  it('should generate server entries for each allowed domain', () => {
    // Given: a list of allowed domains
    const allowlist = ['registry.npmjs.org', 'github.com']

    // When: generating the dnsmasq config
    const config = generateDnsmasqConfig({ allowlist })

    // Then: each domain gets a server directive to 8.8.8.8
    expect(config).toContain('server=/registry.npmjs.org/8.8.8.8')
    expect(config).toContain('server=/github.com/8.8.8.8')
  })

  it('should return NXDOMAIN for all other queries', () => {
    // Given: any allowlist
    const config = generateDnsmasqConfig({ allowlist: [] })

    // Then: default rule returns NXDOMAIN
    expect(config).toContain('address=/#/')
  })

  it('should only have the default rule when allowlist is empty', () => {
    // Given: an empty allowlist
    const config = generateDnsmasqConfig({ allowlist: [] })

    // Then: only the default NXDOMAIN rule is present
    const lines = config.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('address=/#/')
  })

  it('should place server entries before the default rule', () => {
    // Given: an allowlist with one domain
    const config = generateDnsmasqConfig({ allowlist: ['example.com'] })

    // Then: the server entry comes before the default
    const serverIndex = config.indexOf('server=/example.com/')
    const defaultIndex = config.indexOf('address=/#/')
    expect(serverIndex).toBeLessThan(defaultIndex)
  })
})
