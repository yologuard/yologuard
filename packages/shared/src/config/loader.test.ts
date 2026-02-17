import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from './loader.js'
import { DEFAULT_GATEWAY_HOST, DEFAULT_GATEWAY_PORT } from '../constants.js'

describe('loadConfig', () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'yologuard-test-'))
	})

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true })
	})

	it('should return defaults when no config files exist', () => {
		const config = loadConfig({
			globalPath: join(tempDir, 'nonexistent.json'),
		})

		expect(config.gateway.host).toBe(DEFAULT_GATEWAY_HOST)
		expect(config.gateway.port).toBe(DEFAULT_GATEWAY_PORT)
		expect(config.sandbox.agent).toBe('claude')
		expect(config.protectedBranches).toEqual(['main', 'master', 'production'])
		expect(config.branchPrefix).toBe('yologuard/')
	})

	it('should load and parse global JSON5 config', () => {
		const configPath = join(tempDir, 'yologuard.json')
		writeFileSync(
			configPath,
			`{
				// JSON5 comments work
				gateway: { port: 5000 },
				branchPrefix: 'sandbox/',
			}`,
		)

		const config = loadConfig({ globalPath: configPath })

		expect(config.gateway.port).toBe(5000)
		expect(config.gateway.host).toBe(DEFAULT_GATEWAY_HOST)
		expect(config.branchPrefix).toBe('sandbox/')
	})

	it('should merge workspace config over global config', () => {
		const globalPath = join(tempDir, 'global.json')
		const workspacePath = join(tempDir, 'workspace.json')

		writeFileSync(globalPath, JSON.stringify({ gateway: { port: 5000 }, branchPrefix: 'global/' }))
		writeFileSync(workspacePath, JSON.stringify({ gateway: { port: 6000 } }))

		const config = loadConfig({ globalPath, workspacePath })

		expect(config.gateway.port).toBe(6000)
		expect(config.branchPrefix).toBe('global/')
	})

	it('should apply overrides on top of file configs', () => {
		const globalPath = join(tempDir, 'global.json')
		writeFileSync(globalPath, JSON.stringify({ gateway: { port: 5000 } }))

		const config = loadConfig({
			globalPath,
			overrides: { gateway: { port: 9999 } },
		})

		expect(config.gateway.port).toBe(9999)
	})

	it('should validate config and reject invalid values', () => {
		const configPath = join(tempDir, 'bad.json')
		writeFileSync(configPath, JSON.stringify({ gateway: { port: -1 } }))

		expect(() => loadConfig({ globalPath: configPath })).toThrow()
	})
})
