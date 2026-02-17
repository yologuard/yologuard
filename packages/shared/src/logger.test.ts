import { createLogger } from './logger.js'

describe('createLogger', () => {
	it('should create a logger with default name', () => {
		const logger = createLogger()
		expect(logger).toBeDefined()
		// pino logger should have standard methods
		expect(typeof logger.info).toBe('function')
		expect(typeof logger.error).toBe('function')
		expect(typeof logger.warn).toBe('function')
		expect(typeof logger.debug).toBe('function')
	})

	it('should create a logger with custom name and level', () => {
		const logger = createLogger({ name: 'gateway', level: 'debug' })
		expect(logger).toBeDefined()
		expect(logger.level).toBe('debug')
	})
})
