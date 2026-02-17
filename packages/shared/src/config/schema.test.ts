import { describe, it, expect } from 'vitest'
import { yologuardConfigSchema } from './schema.js'

describe('yologuardConfigSchema', () => {
	it('should produce valid defaults from empty input', () => {
		const config = yologuardConfigSchema.parse({})

		expect(config.gateway.host).toBe('127.0.0.1')
		expect(config.gateway.port).toBe(4200)
		expect(config.sandbox.agent).toBe('claude')
		expect(config.sandbox.networkPolicy).toBe('none')
		expect(config.protectedBranches).toEqual(['main', 'master', 'production'])
	})

	it('should accept valid custom config', () => {
		const config = yologuardConfigSchema.parse({
			gateway: { host: '0.0.0.0', port: 8080 },
			sandbox: { agent: 'codex', idleTimeoutMs: 60000 },
			egressAllowlist: ['github.com', 'npmjs.org'],
		})

		expect(config.gateway.host).toBe('0.0.0.0')
		expect(config.gateway.port).toBe(8080)
		expect(config.sandbox.agent).toBe('codex')
		expect(config.egressAllowlist).toEqual(['github.com', 'npmjs.org'])
	})

	it('should reject invalid port numbers', () => {
		expect(() =>
			yologuardConfigSchema.parse({ gateway: { port: 99999 } }),
		).toThrow()
	})

	it('should accept workspace definitions', () => {
		const config = yologuardConfigSchema.parse({
			workspaces: {
				myProject: {
					name: 'my-project',
					repos: [
						{ url: 'https://github.com/org/frontend', access: 'read-write' },
						{ url: 'https://github.com/org/backend', access: 'readonly' },
					],
				},
			},
		})

		expect(config.workspaces.myProject.repos).toHaveLength(2)
		expect(config.workspaces.myProject.repos[1].access).toBe('readonly')
	})
})
