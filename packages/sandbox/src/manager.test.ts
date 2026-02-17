import type { Logger } from '@yologuard/shared'
import { createSandboxManager } from './manager.js'
import type { DevcontainerConfig } from './detect.js'

const createMockLogger = (): Logger =>
	({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	}) as unknown as Logger

const createMockConfig = (sandboxId = 'test-sandbox'): DevcontainerConfig => ({
	name: `yologuard-${sandboxId}`,
	image: 'mcr.microsoft.com/devcontainers/javascript-node:22',
	containerEnv: { YOLOGUARD_SANDBOX_ID: sandboxId },
	remoteUser: 'node',
	customizations: { yologuard: { sandboxId, managed: true } },
})

describe('createSandboxManager', () => {
	describe('createSandbox', () => {
		it('should run devcontainer up and return container info on success', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: '{"outcome":"success","containerId":"abc123"}\n',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			const result = await manager.createSandbox({
				id: 'sandbox-1',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-1'),
				logger,
			})

			expect(result.containerId).toBe('abc123')
			expect(result.state).toBe('running')
			expect(execFileImpl).toHaveBeenCalledWith(
				'devcontainer',
				['up', '--workspace-folder', '/tmp/workspace'],
				expect.objectContaining({
					timeout: 120_000,
					env: expect.objectContaining({
						YOLOGUARD_SANDBOX_ID: 'sandbox-1',
					}),
				}),
			)
		})

		it('should pass resource limits as override config', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: '{"outcome":"success","containerId":"def456"}\n',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			await manager.createSandbox({
				id: 'sandbox-limits',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-limits'),
				resourceLimits: { cpus: 2, memoryMb: 1024 },
				logger,
			})

			const args = execFileImpl.mock.calls[0][1] as string[]
			expect(args).toContain('--override-config')
			const configIndex = args.indexOf('--override-config')
			const configJson = JSON.parse(args[configIndex + 1])
			expect(configJson.hostRequirements.cpus).toBe(2)
			expect(configJson.hostRequirements.memory).toBe('1024mb')
		})

		it('should handle devcontainer up failure', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockRejectedValue(
				new Error('devcontainer not found'),
			)

			const manager = createSandboxManager({ logger, execFileImpl })

			await expect(
				manager.createSandbox({
					id: 'sandbox-fail',
					workspacePath: '/tmp/workspace',
					devcontainerConfig: createMockConfig('sandbox-fail'),
					logger,
				}),
			).rejects.toThrow('devcontainer not found')
		})

		it('should throw when outcome is error', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: '{"outcome":"error","message":"build failed"}\n',
				stderr: 'build error output',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			await expect(
				manager.createSandbox({
					id: 'sandbox-error',
					workspacePath: '/tmp/workspace',
					devcontainerConfig: createMockConfig('sandbox-error'),
					logger,
				}),
			).rejects.toThrow('devcontainer up failed: outcome=error')
		})

		it('should handle non-JSON output gracefully', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: 'some non-json output\n',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			// outcome is 'unknown' which is allowed
			const result = await manager.createSandbox({
				id: 'sandbox-nojson',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-nojson'),
				logger,
			})

			expect(result.containerId).toBe('unknown')
			expect(result.state).toBe('running')
		})
	})

	describe('destroySandbox', () => {
		it('should run devcontainer down', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: '',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			await manager.destroySandbox({
				id: 'sandbox-destroy',
				workspacePath: '/tmp/workspace',
				logger,
			})

			expect(execFileImpl).toHaveBeenCalledWith(
				'devcontainer',
				['down', '--workspace-folder', '/tmp/workspace'],
				expect.objectContaining({ timeout: 120_000 }),
			)
		})

		it('should throw when devcontainer down fails', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockRejectedValue(
				new Error('container not found'),
			)

			const manager = createSandboxManager({ logger, execFileImpl })

			await expect(
				manager.destroySandbox({
					id: 'sandbox-destroy-fail',
					workspacePath: '/tmp/workspace',
					logger,
				}),
			).rejects.toThrow('container not found')
		})
	})

	describe('execInSandbox', () => {
		it('should run devcontainer exec and return output', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: 'hello world\n',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			const result = await manager.execInSandbox({
				id: 'sandbox-exec',
				workspacePath: '/tmp/workspace',
				command: ['echo', 'hello world'],
				logger,
			})

			expect(result.stdout).toBe('hello world\n')
			expect(result.stderr).toBe('')
			expect(result.exitCode).toBe(0)
			expect(execFileImpl).toHaveBeenCalledWith(
				'devcontainer',
				[
					'exec',
					'--workspace-folder',
					'/tmp/workspace',
					'echo',
					'hello world',
				],
				expect.objectContaining({ timeout: 120_000 }),
			)
		})

		it('should handle non-zero exit codes', async () => {
			const logger = createMockLogger()
			const execError = Object.assign(new Error('command failed'), {
				stdout: '',
				stderr: 'not found\n',
				code: 1,
			})
			const execFileImpl = vi.fn().mockRejectedValue(execError)

			const manager = createSandboxManager({ logger, execFileImpl })

			const result = await manager.execInSandbox({
				id: 'sandbox-exec-fail',
				workspacePath: '/tmp/workspace',
				command: ['false'],
				logger,
			})

			expect(result.exitCode).toBe(1)
			expect(result.stderr).toBe('not found\n')
		})

		it('should throw on unexpected errors', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockRejectedValue(
				new Error('timeout exceeded'),
			)

			const manager = createSandboxManager({ logger, execFileImpl })

			await expect(
				manager.execInSandbox({
					id: 'sandbox-exec-timeout',
					workspacePath: '/tmp/workspace',
					command: ['sleep', '999'],
					logger,
				}),
			).rejects.toThrow('timeout exceeded')
		})
	})

	describe('getSandboxStatus', () => {
		it('should use dockerInspect when provided and map running state', async () => {
			const logger = createMockLogger()
			const dockerInspect = vi.fn().mockResolvedValue({
				State: { Status: 'running' },
			})

			const manager = createSandboxManager({
				logger,
				dockerInspect,
			})

			const state = await manager.getSandboxStatus({
				containerId: 'abc123',
			})

			expect(state).toBe('running')
			expect(dockerInspect).toHaveBeenCalledWith('abc123')
		})

		it('should map paused docker state to paused', async () => {
			const logger = createMockLogger()
			const dockerInspect = vi.fn().mockResolvedValue({
				State: { Status: 'paused' },
			})

			const manager = createSandboxManager({ logger, dockerInspect })

			const state = await manager.getSandboxStatus({
				containerId: 'paused-1',
			})

			expect(state).toBe('paused')
		})

		it('should map exited docker state to stopped', async () => {
			const logger = createMockLogger()
			const dockerInspect = vi.fn().mockResolvedValue({
				State: { Status: 'exited' },
			})

			const manager = createSandboxManager({ logger, dockerInspect })

			const state = await manager.getSandboxStatus({
				containerId: 'exited-1',
			})

			expect(state).toBe('stopped')
		})

		it('should map created docker state to creating', async () => {
			const logger = createMockLogger()
			const dockerInspect = vi.fn().mockResolvedValue({
				State: { Status: 'created' },
			})

			const manager = createSandboxManager({ logger, dockerInspect })

			const state = await manager.getSandboxStatus({
				containerId: 'created-1',
			})

			expect(state).toBe('creating')
		})

		it('should fall back to docker CLI when no dockerInspect provided', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockResolvedValue({
				stdout: 'running\n',
				stderr: '',
			})

			const manager = createSandboxManager({ logger, execFileImpl })

			const state = await manager.getSandboxStatus({
				containerId: 'cli-inspect-1',
			})

			expect(state).toBe('running')
			expect(execFileImpl).toHaveBeenCalledWith(
				'docker',
				['inspect', '--format', '{{.State.Status}}', 'cli-inspect-1'],
				expect.objectContaining({ timeout: 10_000 }),
			)
		})

		it('should return stopped when docker CLI inspect fails', async () => {
			const logger = createMockLogger()
			const execFileImpl = vi.fn().mockRejectedValue(
				new Error('no such container'),
			)

			const manager = createSandboxManager({ logger, execFileImpl })

			const state = await manager.getSandboxStatus({
				containerId: 'gone-1',
			})

			expect(state).toBe('stopped')
		})
	})
})
