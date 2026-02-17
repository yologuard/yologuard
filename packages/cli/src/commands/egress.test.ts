import { vi } from 'vitest'

vi.mock('../ensure-gateway.js', () => ({
  ensureGateway: vi.fn(),
}))

vi.mock('../resolve-sandbox.js', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    resolveSandboxId: vi.fn(async (provided?: string) => provided ?? undefined),
  }
})

const mockGetEgress = vi.fn()
const mockSetEgress = vi.fn()
const mockAddEgressDomains = vi.fn()
const mockRemoveEgressDomains = vi.fn()

vi.mock('../gateway-client.js', () => ({
  getEgress: (...args: unknown[]) => mockGetEgress(...args),
  setEgress: (...args: unknown[]) => mockSetEgress(...args),
  addEgressDomains: (...args: unknown[]) => mockAddEgressDomains(...args),
  removeEgressDomains: (...args: unknown[]) => mockRemoveEgressDomains(...args),
}))

import { egress } from './egress.js'

describe('egress command', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.exitCode = undefined
  })

  describe('show (default)', () => {
    it('should display egress config for a sandbox', async () => {
      mockGetEgress.mockResolvedValue({
        preset: 'node-web',
        allowlist: ['github.com', 'npmjs.org'],
      })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['sandbox-123'])

      expect(mockGetEgress).toHaveBeenCalledWith('sandbox-123')
      expect(spy).toHaveBeenCalledWith('Preset: node-web')
      spy.mockRestore()
    })

    it('should show empty allowlist message', async () => {
      mockGetEgress.mockResolvedValue({ preset: 'none', allowlist: [] })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['sandbox-123'])

      expect(spy).toHaveBeenCalledWith('Allowlist: (empty)')
      spy.mockRestore()
    })
  })

  describe('add', () => {
    it('should add domains to allowlist', async () => {
      mockAddEgressDomains.mockResolvedValue({ preset: 'none', allowlist: ['example.com'] })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['add', 'sandbox-123', 'example.com'])

      expect(mockAddEgressDomains).toHaveBeenCalledWith({
        sandboxId: 'sandbox-123',
        domains: ['example.com'],
      })
      spy.mockRestore()
    })

    it('should reject missing domains', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await egress(['add', 'sandbox-123'])

      expect(process.exitCode).toBe(1)
      spy.mockRestore()
    })
  })

  describe('remove', () => {
    it('should remove domains from allowlist', async () => {
      mockRemoveEgressDomains.mockResolvedValue({ preset: 'none', allowlist: [] })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['remove', 'sandbox-123', 'example.com'])

      expect(mockRemoveEgressDomains).toHaveBeenCalledWith({
        sandboxId: 'sandbox-123',
        domains: ['example.com'],
      })
      spy.mockRestore()
    })
  })

  describe('set', () => {
    it('should set preset via --preset flag', async () => {
      mockSetEgress.mockResolvedValue({ preset: 'node-web', allowlist: ['github.com'] })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['set', 'sandbox-123', '--preset', 'node-web'])

      expect(mockSetEgress).toHaveBeenCalledWith({
        sandboxId: 'sandbox-123',
        preset: 'node-web',
        additionalDomains: undefined,
      })
      spy.mockRestore()
    })

    it('should replace allowlist with explicit domains', async () => {
      mockSetEgress.mockResolvedValue({ preset: 'none', allowlist: ['a.com', 'b.com'] })
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await egress(['set', 'sandbox-123', 'a.com', 'b.com'])

      expect(mockSetEgress).toHaveBeenCalledWith({
        sandboxId: 'sandbox-123',
        allowlist: ['a.com', 'b.com'],
      })
      spy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('should show error message on failure', async () => {
      mockGetEgress.mockRejectedValue(new Error('Gateway error (404): Sandbox not found'))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await egress(['sandbox-123'])

      expect(process.exitCode).toBe(1)
      expect(spy).toHaveBeenCalledWith('Failed: Gateway error (404): Sandbox not found')
      spy.mockRestore()
    })

    it('should exit when no sandbox available', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await egress([])

      expect(process.exitCode).toBe(1)
      spy.mockRestore()
    })
  })
})
