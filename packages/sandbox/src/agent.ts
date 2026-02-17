import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Logger } from '@yologuard/shared'

const execFileAsync = promisify(execFile)

const TMUX_SESSION_NAME = 'yologuard-agent' as const

const AGENT_COMMANDS = {
	claude: 'claude --dangerously-skip-permissions',
	codex: 'codex --full-auto',
	opencode: 'opencode',
} as const satisfies Record<string, string>

export type AgentType = keyof typeof AGENT_COMMANDS

export const SUPPORTED_AGENTS = Object.keys(AGENT_COMMANDS) as AgentType[]

type LaunchAgentParams = {
	readonly workspacePath: string
	readonly agent: AgentType
	readonly prompt?: string
	readonly logger: Logger
}

type AgentActionParams = {
	readonly workspacePath: string
	readonly logger: Logger
}

const devcontainerExec = async ({
	workspacePath,
	command,
}: {
	readonly workspacePath: string
	readonly command: string
}): Promise<{ readonly stdout: string; readonly stderr: string }> => {
	const { stdout, stderr } = await execFileAsync('devcontainer', [
		'exec',
		'--workspace-folder',
		workspacePath,
		'bash',
		'-c',
		command,
	])
	return { stdout, stderr }
}

export const launchAgent = async ({
	workspacePath,
	agent,
	prompt,
	logger,
}: LaunchAgentParams): Promise<void> => {
	const baseCommand = AGENT_COMMANDS[agent]
	const agentCommand = prompt
		? `${baseCommand} --prompt ${JSON.stringify(prompt)}`
		: baseCommand

	logger.info({ agent, workspacePath }, 'Launching agent in tmux session')

	// Create a new tmux session running the agent
	const tmuxCommand = `tmux new-session -d -s ${TMUX_SESSION_NAME} -x 200 -y 50 '${agentCommand}'`

	await devcontainerExec({ workspacePath, command: tmuxCommand })

	logger.info({ agent, session: TMUX_SESSION_NAME }, 'Agent launched in tmux session')
}

export const isAgentRunning = async ({
	workspacePath,
	logger,
}: AgentActionParams): Promise<boolean> => {
	try {
		await devcontainerExec({
			workspacePath,
			command: `tmux has-session -t ${TMUX_SESSION_NAME}`,
		})
		return true
	} catch {
		logger.debug('No active agent tmux session found')
		return false
	}
}

export const getAttachCommand = ({
	workspacePath,
}: {
	readonly workspacePath: string
}): string =>
	`devcontainer exec --workspace-folder ${workspacePath} tmux attach-session -t ${TMUX_SESSION_NAME}`

export const stopAgent = async ({
	workspacePath,
	logger,
}: AgentActionParams): Promise<void> => {
	logger.info('Stopping agent tmux session')
	try {
		await devcontainerExec({
			workspacePath,
			command: `tmux kill-session -t ${TMUX_SESSION_NAME}`,
		})
		logger.info('Agent tmux session stopped')
	} catch {
		logger.debug('No agent session to stop')
	}
}
