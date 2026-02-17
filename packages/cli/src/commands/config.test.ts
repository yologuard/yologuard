import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, vi } from 'vitest'

const mockHomedir = vi.fn<() => string>()
vi.mock('node:os', async () => {
	const actual = await vi.importActual<typeof import('node:os')>('node:os')
	return { ...actual, homedir: () => mockHomedir() }
})

const { config } = await import('./config.js')

let tempDir: string

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'yologuard-config-test-'))
	mockHomedir.mockReturnValue(tempDir)
	mkdirSync(join(tempDir, '.yologuard'), { recursive: true })
	process.exitCode = 0
})

describe('config get', () => {
	it('should return default value when no config file exists', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['get', 'gateway.port'])
		expect(log).toHaveBeenCalledWith('4200')
		log.mockRestore()
	})

	it('should return saved value from config file', async () => {
		writeFileSync(
			join(tempDir, '.yologuard', 'yologuard.json'),
			JSON.stringify({ gateway: { port: 9000 } }),
		)
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['get', 'gateway.port'])
		expect(log).toHaveBeenCalledWith('9000')
		log.mockRestore()
	})

	it('should print object values as JSON', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['get', 'gateway'])
		const output = log.mock.calls[0][0] as string
		const parsed = JSON.parse(output)
		expect(parsed).toHaveProperty('host')
		expect(parsed).toHaveProperty('port')
		log.mockRestore()
	})

	it('should error for nonexistent key', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		await config(['get', 'nonexistent.key'])
		expect(err).toHaveBeenCalledWith(expect.stringContaining('No config value'))
		expect(process.exitCode).toBe(1)
		err.mockRestore()
	})
})

describe('config set', () => {
	it('should write a numeric value', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['set', 'gateway.port', '9000'])
		expect(log).toHaveBeenCalledWith(expect.stringContaining('9000'))

		const raw = JSON.parse(readFileSync(join(tempDir, '.yologuard', 'yologuard.json'), 'utf-8'))
		expect(raw.gateway.port).toBe(9000)
		log.mockRestore()
	})

	it('should write a string value', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['set', 'sandbox.agent', 'aider'])
		expect(log).toHaveBeenCalledWith(expect.stringContaining('aider'))

		const raw = JSON.parse(readFileSync(join(tempDir, '.yologuard', 'yologuard.json'), 'utf-8'))
		expect(raw.sandbox.agent).toBe('aider')
		log.mockRestore()
	})

	it('should reject invalid config values', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		await config(['set', 'gateway.port', '-1'])
		expect(err).toHaveBeenCalledWith(expect.stringContaining('Invalid'))
		expect(process.exitCode).toBe(1)
		err.mockRestore()
	})
})

describe('config unset', () => {
	it('should remove a key from config', async () => {
		writeFileSync(
			join(tempDir, '.yologuard', 'yologuard.json'),
			JSON.stringify({ gateway: { port: 9000 } }),
		)
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		await config(['unset', 'gateway.port'])
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Removed'))

		const raw = JSON.parse(readFileSync(join(tempDir, '.yologuard', 'yologuard.json'), 'utf-8'))
		expect(raw.gateway?.port).toBeUndefined()
		log.mockRestore()
	})
})
