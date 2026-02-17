import { execFile as execFileCb, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import type { Logger, ResourceLimits, SandboxState } from '@yologuard/shared'
import type { DevcontainerConfig } from './detect.js'

const execFile = promisify(execFileCb)

const DEFAULT_EXEC_TIMEOUT_MS = 300_000 as const

const require = createRequire(import.meta.url)

// Resolve the absolute path to devcontainer.js from @devcontainers/cli
// This works regardless of whether the binary is on PATH
export const DEVCONTAINER_JS = require.resolve('@devcontainers/cli/devcontainer.js')

const devcontainerExecArgs = (subArgs: readonly string[]): [string, string[]] => [
  process.execPath,
  [DEVCONTAINER_JS, ...subArgs],
]

export const devcontainerCommand = (subArgs: readonly string[]): string =>
  [process.execPath, DEVCONTAINER_JS, ...subArgs].join(' ')

type CreateSandboxParams = {
  readonly id: string
  readonly workspacePath: string
  readonly devcontainerConfig: DevcontainerConfig
  readonly resourceLimits?: ResourceLimits
  readonly configPath?: string
  readonly logger: Logger
}

type CreateSandboxResult = {
  readonly containerId: string
  readonly state: SandboxState
}

type DestroySandboxParams = {
  readonly id: string
  readonly workspacePath: string
  readonly logger: Logger
}

type ExecInSandboxParams = {
  readonly id: string
  readonly workspacePath: string
  readonly command: readonly string[]
  readonly logger: Logger
}

type ExecResult = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

type GetSandboxStatusParams = {
  readonly containerId: string
}

type SandboxManager = {
  readonly createSandbox: (params: CreateSandboxParams) => Promise<CreateSandboxResult>
  readonly destroySandbox: (params: DestroySandboxParams) => Promise<void>
  readonly execInSandbox: (params: ExecInSandboxParams) => Promise<ExecResult>
  readonly getSandboxStatus: (params: GetSandboxStatusParams) => Promise<SandboxState>
}

const containerStateToSandboxState = (dockerState: string): SandboxState => {
  switch (dockerState.toLowerCase()) {
    case 'running':
      return 'running'
    case 'created':
    case 'restarting':
      return 'creating'
    case 'paused':
      return 'paused'
    case 'exited':
    case 'dead':
    case 'removing':
      return 'stopped'
    default:
      return 'stopped'
  }
}

const parseContainerIdFromStderr = (stderr: string): string => {
  // devcontainer up logs a docker event with the container ID:
  // Log: startEventSeen#data {"Type":"container","Action":"start","Actor":{"ID":"abc123...",...}}
  const match = stderr.match(/startEventSeen#data\s*(\{.+\})/)
  if (match) {
    try {
      const event = JSON.parse(match[1]) as { Actor?: { ID?: string } }
      if (event.Actor?.ID) return event.Actor.ID.slice(0, 12)
    } catch {
      // ignore parse errors
    }
  }
  return 'unknown'
}

type SpawnWithProgressParams = {
  readonly bin: string
  readonly args: string[]
  readonly env?: Record<string, string | undefined>
  readonly logger: Logger
  readonly timeout: number
}

const spawnWithProgress = ({
  bin,
  args,
  env,
  logger: progressLogger,
  timeout,
}: SpawnWithProgressParams): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, timeout })
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    let resolved = false

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString())
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) {
        stderrChunks.push(line)
        progressLogger.info({ progress: line }, 'devcontainer')
      }

      // devcontainer up never exits — it stays attached to the container.
      // Resolve when we see the docker start event which contains the container ID.
      if (!resolved && line.includes('startEventSeen')) {
        resolved = true
        child.unref()
        resolve({ stdout: stdoutChunks.join(''), stderr: stderrChunks.join('\n') })
      }
    })

    child.on('close', (code) => {
      if (resolved) return
      const stdout = stdoutChunks.join('')
      const stderr = stderrChunks.join('\n')
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(
          Object.assign(new Error(`Command failed with exit code ${code}`), {
            code,
            stdout,
            stderr,
            cmd: [bin, ...args].join(' '),
          }),
        )
      }
    })

    child.on('error', (err) => {
      if (!resolved) reject(err)
    })
  })

type SpawnFn = (params: SpawnWithProgressParams) => Promise<{ stdout: string; stderr: string }>

type CreateSandboxManagerParams = {
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
  readonly spawnImpl?: SpawnFn
  readonly dockerInspect?: (containerId: string) => Promise<{ State: { Status: string } }>
}

export const createSandboxManager = ({
  logger,
  execFileImpl = execFile,
  spawnImpl = spawnWithProgress,
  dockerInspect,
}: CreateSandboxManagerParams): SandboxManager => {
  const createSandbox = async ({
    id,
    workspacePath,
    devcontainerConfig,
    resourceLimits,
    configPath,
    logger: sandboxLogger,
  }: CreateSandboxParams): Promise<CreateSandboxResult> => {
    sandboxLogger.info({ sandboxId: id, workspacePath }, 'Creating sandbox')

    const subArgs = [
      'up',
      '--remove-existing-container',
      '--log-level',
      'trace',
      '--workspace-folder',
      workspacePath,
    ]

    if (configPath) {
      subArgs.push('--config', configPath)
    }

    // Pass resource limits via override config
    if (resourceLimits) {
      const overrideConfig: Record<string, unknown> = {
        hostRequirements: {
          ...(resourceLimits.cpus && { cpus: resourceLimits.cpus }),
          ...(resourceLimits.memoryMb && {
            memory: `${resourceLimits.memoryMb}mb`,
          }),
          ...(resourceLimits.diskMb && {
            storage: `${resourceLimits.diskMb}mb`,
          }),
        },
      }
      subArgs.push('--override-config', JSON.stringify(overrideConfig))
    }

    try {
      const [bin, args] = devcontainerExecArgs(subArgs)
      const result = await spawnImpl({
        bin,
        args,
        env: {
          ...process.env,
          YOLOGUARD_SANDBOX_ID: id,
        },
        logger: sandboxLogger,
        timeout: DEFAULT_EXEC_TIMEOUT_MS,
      })

      const containerId = parseContainerIdFromStderr(result.stderr)
      sandboxLogger.info({ sandboxId: id, containerId }, 'Sandbox created successfully')

      return {
        containerId,
        state: 'running',
      }
    } catch (error) {
      sandboxLogger.error({ sandboxId: id, error }, 'Failed to create sandbox')
      throw error
    }
  }

  const destroySandbox = async ({
    id,
    workspacePath,
    logger: sandboxLogger,
  }: DestroySandboxParams): Promise<void> => {
    sandboxLogger.info({ sandboxId: id, workspacePath }, 'Destroying sandbox')

    try {
      const [bin, args] = devcontainerExecArgs(['down', '--workspace-folder', workspacePath])
      const { stderr } = await execFileImpl(bin, args, {
        timeout: DEFAULT_EXEC_TIMEOUT_MS,
      })

      if (stderr) {
        sandboxLogger.debug({ stderr }, 'devcontainer down stderr')
      }

      sandboxLogger.info({ sandboxId: id }, 'Sandbox destroyed')
    } catch (error) {
      sandboxLogger.error({ sandboxId: id, error }, 'Failed to destroy sandbox')
      throw error
    }
  }

  const execInSandbox = async ({
    id,
    workspacePath,
    command,
    logger: sandboxLogger,
  }: ExecInSandboxParams): Promise<ExecResult> => {
    sandboxLogger.debug({ sandboxId: id, command }, 'Executing command in sandbox')

    try {
      const [bin, args] = devcontainerExecArgs([
        'exec',
        '--workspace-folder',
        workspacePath,
        ...command,
      ])

      const { stdout, stderr } = await execFileImpl(bin, args, { timeout: DEFAULT_EXEC_TIMEOUT_MS })

      return { stdout, stderr, exitCode: 0 }
    } catch (error: unknown) {
      const execError = error as {
        stdout?: string
        stderr?: string
        code?: number
      }
      // Non-zero exit codes from the exec'd command surface as errors
      if (execError.code !== undefined) {
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
          exitCode: execError.code,
        }
      }
      throw error
    }
  }

  const getSandboxStatus = async ({
    containerId,
  }: GetSandboxStatusParams): Promise<SandboxState> => {
    if (dockerInspect) {
      const info = await dockerInspect(containerId)
      return containerStateToSandboxState(info.State.Status)
    }

    // Fallback: use docker CLI inspect
    try {
      const { stdout } = await execFileImpl(
        'docker',
        ['inspect', '--format', '{{.State.Status}}', containerId],
        { timeout: 10_000 },
      )
      return containerStateToSandboxState(stdout.trim())
    } catch (error) {
      logger.warn({ containerId, error }, 'Failed to inspect container, assuming stopped')
      return 'stopped'
    }
  }

  return {
    createSandbox,
    destroySandbox,
    execInSandbox,
    getSandboxStatus,
  } as const
}
