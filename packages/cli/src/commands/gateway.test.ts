vi.mock('@yologuard/shared', () => ({
  loadConfig: () => ({
    gateway: { host: '127.0.0.1', port: 4200 },
  }),
}))

vi.mock('../gateway-client.js', () => ({
  getHealth: vi.fn(),
}))

vi.mock('./start.js', () => ({
  start: vi.fn(),
}))

import { gateway, gatewayStart, gatewayStop } from './gateway.js'
import { getHealth } from '../gateway-client.js'
import { start } from './start.js'

describe('gateway command', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  describe('gateway subcommand routing', () => {
    it('should route to start', async () => {
      await gateway(['start'])
      expect(start).toHaveBeenCalled()
    })

    it('should show usage for unknown subcommand', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await gateway(['unknown'])
      expect(spy).toHaveBeenCalledWith('Usage: yologuard gateway <start|stop>')
      expect(process.exitCode).toBe(1)
    })

    it('should show usage for no subcommand', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await gateway([])
      expect(spy).toHaveBeenCalledWith('Usage: yologuard gateway <start|stop>')
      expect(process.exitCode).toBe(1)
    })
  })

  describe('gatewayStart', () => {
    it('should delegate to start command', async () => {
      await gatewayStart()
      expect(start).toHaveBeenCalled()
    })
  })

  describe('gatewayStop', () => {
    it('should error when gateway is not running', async () => {
      vi.mocked(getHealth).mockRejectedValue(new Error('ECONNREFUSED'))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await gatewayStop()

      expect(spy).toHaveBeenCalledWith('Gateway is not running on port 4200')
      expect(process.exitCode).toBe(1)
    })
  })
})
