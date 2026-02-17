import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import type { Logger } from '@yologuard/shared'
import { DEVCONTAINER_JS, devcontainerCommand } from './manager.js'

const execFileAsync = promisify(execFile)

const TMUX_SESSION_NAME = 'yologuard-agent' as const

const AGENT_COMMANDS = {
  claude: 'claude --dangerously-skip-permissions',
  codex: 'codex --full-auto',
  opencode: 'opencode',
  none: null,
} as const

export type AgentType = keyof typeof AGENT_COMMANDS

export const SUPPORTED_AGENTS = Object.keys(AGENT_COMMANDS) as AgentType[]

type LaunchAgentParams = {
  readonly workspacePath: string
  readonly agent: AgentType
  readonly prompt?: string
  readonly configPath?: string
  readonly logger: Logger
}

type AgentActionParams = {
  readonly workspacePath: string
  readonly configPath?: string
  readonly logger: Logger
}

const EXEC_TIMEOUT_MS = 30_000

const devcontainerExec = async ({
  workspacePath,
  configPath,
  containerId,
  command,
  timeout = EXEC_TIMEOUT_MS,
}: {
  readonly workspacePath: string
  readonly configPath?: string
  readonly containerId?: string
  readonly command: string
  readonly timeout?: number
}): Promise<{ readonly stdout: string; readonly stderr: string }> => {
  const args = [DEVCONTAINER_JS, 'exec']
  if (containerId) {
    args.push('--container-id', containerId)
  }
  args.push('--workspace-folder', workspacePath)
  if (configPath) {
    args.push('--config', configPath)
  }
  args.push('bash', '-c', command)
  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    timeout,
  })
  return { stdout, stderr }
}

export const launchAgent = async ({
  workspacePath,
  agent,
  prompt,
  configPath,
  logger,
}: LaunchAgentParams): Promise<void> => {
  const baseCommand = AGENT_COMMANDS[agent]

  if (baseCommand === null) {
    logger.info({ workspacePath }, 'Launching shell-only tmux session')
    const tmuxCommand = `tmux new-session -d -s ${TMUX_SESSION_NAME} -x 200 -y 50`
    await devcontainerExec({ workspacePath, configPath, command: tmuxCommand })
    logger.info({ session: TMUX_SESSION_NAME }, 'Shell session launched')
    return
  }

  const agentCommand = prompt ? `${baseCommand} --prompt ${JSON.stringify(prompt)}` : baseCommand

  logger.info({ agent, workspacePath }, 'Launching agent in tmux session')

  // Start agent in a detached tmux session — keep shell alive if agent exits
  const tmuxCommand = `tmux new-session -d -s ${TMUX_SESSION_NAME} -x 200 -y 50 '${agentCommand}; echo "Agent exited ($?). Press enter for shell."; read; exec bash'`
  await devcontainerExec({ workspacePath, configPath, command: tmuxCommand })

  logger.info({ agent, session: TMUX_SESSION_NAME }, 'Agent launched in tmux session')
}

export const isAgentRunning = async ({
  workspacePath,
  configPath,
  logger,
}: AgentActionParams): Promise<boolean> => {
  try {
    await devcontainerExec({
      workspacePath,
      configPath,
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
  configPath,
  containerId,
  remoteUser,
}: {
  readonly workspacePath: string
  readonly configPath?: string
  readonly containerId?: string
  readonly remoteUser?: string
}): string => {
  // Use docker exec -it directly for proper TTY allocation (colors, cursor, resize)
  if (containerId) {
    const userFlag = remoteUser ? `-u ${remoteUser} ` : ''
    return `docker exec -it ${userFlag}-e TERM=xterm-256color ${containerId} tmux attach-session -t ${TMUX_SESSION_NAME}`
  }
  // Fallback to devcontainer exec when no container ID
  const args = ['exec']
  args.push('--workspace-folder', workspacePath)
  if (configPath) {
    args.push('--config', configPath)
  }
  args.push('tmux', 'attach-session', '-t', TMUX_SESSION_NAME)
  return devcontainerCommand(args)
}

export const getShellCommand = ({
  workspacePath,
  configPath,
  containerId,
  remoteUser,
}: {
  readonly workspacePath: string
  readonly configPath?: string
  readonly containerId?: string
  readonly remoteUser?: string
}): string => {
  const containerWorkdir = `/workspaces/${basename(workspacePath)}`
  if (containerId) {
    const userFlag = remoteUser ? `-u ${remoteUser} ` : ''
    return `docker exec -it ${userFlag}-w ${containerWorkdir} -e TERM=xterm-256color ${containerId} bash`
  }
  const args = ['exec']
  args.push('--workspace-folder', workspacePath)
  if (configPath) {
    args.push('--config', configPath)
  }
  args.push('bash')
  return devcontainerCommand(args)
}

export const stopAgent = async ({
  workspacePath,
  configPath,
  logger,
}: AgentActionParams): Promise<void> => {
  logger.info('Stopping agent tmux session')
  try {
    await devcontainerExec({
      workspacePath,
      configPath,
      command: `tmux kill-session -t ${TMUX_SESSION_NAME}`,
    })
    logger.info('Agent tmux session stopped')
  } catch {
    logger.debug('No agent session to stop')
  }
}
