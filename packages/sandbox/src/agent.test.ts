import { launchAgent, isAgentRunning, getAttachCommand, stopAgent, SUPPORTED_AGENTS } from './agent.js'

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
	mockExecFile.mockImplementation((_cmd, _args, callback) => {
		if (typeof callback === 'function') {
			;(callback as (err: Error | null, stdout: string, stderr: string) => void)(null, '', '')
		}
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

		expect(mockExecFile).toHaveBeenCalledWith(
			'devcontainer',
			[
				'exec',
				'--workspace-folder',
				'/workspace/my-repo',
				'bash',
				'-c',
				expect.stringContaining('tmux new-session'),
			],
			expect.any(Function),
		)

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[5] as string
		expect(bashCommand).toContain('claude --dangerously-skip-permissions')
		expect(bashCommand).toContain('yologuard-agent')
	})

	it('launches codex agent', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'codex',
			logger: mockLogger,
		})

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[5] as string
		expect(bashCommand).toContain('codex --full-auto')
	})

	it('launches opencode agent', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'opencode',
			logger: mockLogger,
		})

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[5] as string
		expect(bashCommand).toContain('opencode')
	})

	it('passes prompt to agent command', async () => {
		await launchAgent({
			workspacePath: '/workspace/my-repo',
			agent: 'claude',
			prompt: 'Fix the login bug',
			logger: mockLogger,
		})

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[5] as string
		expect(bashCommand).toContain('--prompt')
		expect(bashCommand).toContain('Fix the login bug')
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
		mockExecFile.mockImplementation((_cmd, _args, callback) => {
			if (typeof callback === 'function') {
				;(callback as (err: Error | null) => void)(new Error('session not found'))
			}
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
			'devcontainer exec --workspace-folder /workspace/my-repo tmux attach-session -t yologuard-agent',
		)
	})
})

describe('stopAgent', () => {
	it('kills the tmux session', async () => {
		await stopAgent({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})

		const bashCommand = mockExecFile.mock.calls[0]?.[1]?.[5] as string
		expect(bashCommand).toContain('tmux kill-session')
		expect(bashCommand).toContain('yologuard-agent')
	})

	it('handles non-existent session gracefully', async () => {
		mockExecFile.mockImplementation((_cmd, _args, callback) => {
			if (typeof callback === 'function') {
				;(callback as (err: Error | null) => void)(new Error('no session'))
			}
			return undefined as never
		})

		// Should not throw
		await stopAgent({
			workspacePath: '/workspace/my-repo',
			logger: mockLogger,
		})
	})
})
