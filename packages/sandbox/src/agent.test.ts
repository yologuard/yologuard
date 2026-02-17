import { launchAgent, isAgentRunning, getAttachCommand, stopAgent, SUPPORTED_AGENTS } from './agent.js'
import { DEVCONTAINER_JS } from './manager.js'

vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
}))

import { execFile } from 'node:child_process'

const mockExecFile = vi.mocked(execFile)

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	fatal: vi.fn(),
	trace: vi.fn(),
	child: vi.fn(),
	level: 'info',
	silent: vi.fn(),
} as never

beforeEach(() => {
	vi.clearAllMocks()
	mockExecFile.mockImplementation((...args: unknown[]) => {
		const callback = args.find((a) => typeof a === 'function') as
			| ((err: Error | null, stdout: string, stderr: string) => void)
			| undefined
		callback?.(null, '', '')
		return undefined as never
	})
})

describe('agent launcher', () => {
	it('launches claude agent in tmux session', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'claude',
			logger: mockLogger,
		})

		expect(mockExecFile).toHaveBeenCalledTimes(1)
		const tmuxCommand = mockExecFile.mock.calls[0]?.[1]?.[6] as string
		expect(tmuxCommand).toContain('tmux new-session')
		expect(tmuxCommand).toContain('claude --dangerously-skip-permissions')
		expect(tmuxCommand).toContain('yologuard-agent')
	})

	it('launches codex agent', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'codex',
			logger: mockLogger,
		})

		const tmuxCommand = mockExecFile.mock.calls[0]?.[1]?.[6] as string
		expect(tmuxCommand).toContain('codex --full-auto')
	})

	it('launches opencode agent', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'opencode',
			logger: mockLogger,
		})

		const tmuxCommand = mockExecFile.mock.calls[0]?.[1]?.[6] as string
		expect(tmuxCommand).toContain('opencode')
	})

	it('passes prompt to agent command', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'claude',
			prompt: 'Fix the login bug',
			logger: mockLogger,
		})

		const tmuxCommand = mockExecFile.mock.calls[0]?.[1]?.[6] as string
		expect(tmuxCommand).toContain('--prompt')
		expect(tmuxCommand).toContain('Fix the login bug')
	})

	it('exports supported agent types', () => {
		expect(SUPPORTED_AGENTS).toContain('claude')
		expect(SUPPORTED_AGENTS).toContain('codex')
		expect(SUPPORTED_AGENTS).toContain('opencode')
	})
})

describe('isAgentRunning', () => {
	it('returns true when tmux session exists', async () => {
		const result = await isAgentRunning({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})

		expect(result).toBe(true)
	})

	it('returns false when tmux session does not exist', async () => {
		mockExecFile.mockImplementation((...args: unknown[]) => {
			const callback = args.find((a) => typeof a === 'function') as
				| ((err: Error | null) => void)
				| undefined
			callback?.(new Error('session not found'))
			return undefined as never
		})

		const result = await isAgentRunning({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})

		expect(result).toBe(false)
	})
})

describe('getAttachCommand', () => {
	it('returns the correct tmux attach command', () => {
		const cmd = getAttachCommand({ workspacePath: '/workspace/my-repo' })
		expect(cmd).toBe(
			`${process.execPath} ${DEVCONTAINER_JS} exec --workspace-folder /workspace/my-repo tmux attach-session -t yologuard-agent`,
		)
	})

	it('includes --config when configPath is provided', () => {
		const cmd = getAttachCommand({
			workspacePath: '/workspace/my-repo',
			configPath: '/home/user/.yologuard/configs/abc/devcontainer.json',
		})
		expect(cmd).toBe(
			`${process.execPath} ${DEVCONTAINER_JS} exec --workspace-folder /workspace/my-repo --config /home/user/.yologuard/configs/abc/devcontainer.json tmux attach-session -t yologuard-agent`,
		)
	})
})

describe('stopAgent', () => {
	it('kills the tmux session', async () => {
		await stopAgent({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[6] as string
		expect(bashCommand).toContain('tmux kill-session')
		expect(bashCommand).toContain('yologuard-agent')
	})

	it('handles non-existent session gracefully', async () => {
		mockExecFile.mockImplementation((...args: unknown[]) => {
			const callback = args.find((a) => typeof a === 'function') as
				| ((err: Error | null) => void)
				| undefined
			callback?.(new Error('no session'))
			return undefined as never
		})

		// Should not throw
		await stopAgent({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})
	})
})
