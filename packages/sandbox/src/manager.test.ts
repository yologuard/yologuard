import type { Logger } from '@yologuard/shared'
import { createSandboxManager, DEVCONTAINER_JS } from './manager.js'
import type { DevcontainerConfig } from './detect.js'

const createMockLogger = (): Logger =>
	({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(),
	}) as unknown as Logger

const containerEventStderr = (containerId: string) =>
	`Container started\nLog: startEventSeen#data {"Type":"container","Action":"start","Actor":{"ID":"${containerId}"}}`

const createMockSpawn = (result: { stdout: string; stderr: string }) =>
	vi.fn().mockResolvedValue(result)

const createFailingSpawn = (error: Error) =>
	vi.fn().mockRejectedValue(error)

const createMockConfig = (sandboxId = 'test-sandbox'): DevcontainerConfig => ({
	name: `yologuard-${sandboxId}`,
	build: { dockerfile: 'Dockerfile' },
	containerEnv: { YOLOGUARD_SANDBOX_ID: sandboxId },
	remoteUser: 'node',
	customizations: { yologuard: { sandboxId, managed: true } },
})

describe('createSandboxManager', () => {
	describe('createSandbox', () => {
		it('should run devcontainer up and parse container ID from stderr event', async () => {
			const logger = createMockLogger()
			const spawnImpl = createMockSpawn({
				stdout: '',
				stderr: containerEventStderr('abc123def456'),
			})

			const manager = createSandboxManager({ logger, spawnImpl })

			const result = await manager.createSandbox({
				id: 'sandbox-1',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-1'),
				logger,
			})

			expect(result.containerId).toBe('abc123def456')
			expect(result.state).toBe('running')
			expect(spawnImpl).toHaveBeenCalledWith(
				expect.objectContaining({
					bin: process.execPath,
					args: [DEVCONTAINER_JS, 'up', '--remove-existing-container', '--log-level', 'trace', '--workspace-folder', '/tmp/workspace'],
					timeout: 300_000,
				}),
			)
		})

		it('should pass resource limits as override config', async () => {
			const logger = createMockLogger()
			const spawnImpl = createMockSpawn({
				stdout: '',
				stderr: containerEventStderr('def456'),
			})

			const manager = createSandboxManager({ logger, spawnImpl })

			await manager.createSandbox({
				id: 'sandbox-limits',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-limits'),
				resourceLimits: { cpus: 2, memoryMb: 1024 },
				logger,
			})

			const callArgs = spawnImpl.mock.calls[0][0].args as string[]
			expect(callArgs).toContain('--override-config')
			const configIndex = callArgs.indexOf('--override-config')
			const configJson = JSON.parse(callArgs[configIndex + 1])
			expect(configJson.hostRequirements.cpus).toBe(2)
			expect(configJson.hostRequirements.memory).toBe('1024mb')
		})

		it('should pass --config flag when configPath is provided', async () => {
			const logger = createMockLogger()
			const spawnImpl = createMockSpawn({
				stdout: '',
				stderr: containerEventStderr('cfg789'),
			})

			const manager = createSandboxManager({ logger, spawnImpl })

			await manager.createSandbox({
				id: 'sandbox-config',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-config'),
				configPath: '/home/user/.yologuard/configs/sandbox-config/devcontainer.json',
				logger,
			})

			const callArgs = spawnImpl.mock.calls[0][0].args as string[]
			expect(callArgs).toContain('--config')
			const configIndex = callArgs.indexOf('--config')
			expect(callArgs[configIndex + 1]).toBe(
				'/home/user/.yologuard/configs/sandbox-config/devcontainer.json',
			)
		})

		it('should not pass --config flag when configPath is not provided', async () => {
			const logger = createMockLogger()
			const spawnImpl = createMockSpawn({
				stdout: '',
				stderr: containerEventStderr('nocfg'),
			})

			const manager = createSandboxManager({ logger, spawnImpl })

			await manager.createSandbox({
				id: 'sandbox-noconfig',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-noconfig'),
				logger,
			})

			const callArgs = spawnImpl.mock.calls[0][0].args as string[]
			expect(callArgs).not.toContain('--config')
		})

		it('should handle devcontainer up failure', async () => {
			const logger = createMockLogger()
			const spawnImpl = createFailingSpawn(new Error('devcontainer not found'))

			const manager = createSandboxManager({ logger, spawnImpl })

			await expect(
				manager.createSandbox({
					id: 'sandbox-fail',
					workspacePath: '/tmp/workspace',
					devcontainerConfig: createMockConfig('sandbox-fail'),
					logger,
				}),
			).rejects.toThrow('devcontainer not found')
		})

		it('should return unknown when container ID not found in stderr', async () => {
			const logger = createMockLogger()
			const spawnImpl = createMockSpawn({
				stdout: '',
				stderr: 'Container started',
			})

			const manager = createSandboxManager({ logger, spawnImpl })

			const result = await manager.createSandbox({
				id: 'sandbox-noid',
				workspacePath: '/tmp/workspace',
				devcontainerConfig: createMockConfig('sandbox-noid'),
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
				process.execPath,
				[DEVCONTAINER_JS, 'down', '--workspace-folder', '/tmp/workspace'],
				expect.objectContaining({ timeout: 300_000 }),
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
				process.execPath,
				[
					DEVCONTAINER_JS,
					'exec',
					'--workspace-folder',
					'/tmp/workspace',
					'echo',
					'hello world',
				],
				expect.objectContaining({ timeout: 300_000 }),
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
