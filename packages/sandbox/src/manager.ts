import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { Logger, ResourceLimits, SandboxState } from '@yologuard/shared'
import type { DevcontainerConfig } from './detect.js'

const execFile = promisify(execFileCb)

const DEVCONTAINER_BIN = 'devcontainer' as const
const DEFAULT_EXEC_TIMEOUT_MS = 120_000 as const

type CreateSandboxParams = {
	readonly id: string
	readonly workspacePath: string
	readonly devcontainerConfig: DevcontainerConfig
	readonly resourceLimits?: ResourceLimits
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

type DevcontainerUpOutput = {
	readonly outcome: string
	readonly containerId?: string
}

const parseDevcontainerOutput = (stdout: string): DevcontainerUpOutput => {
	try {
		// devcontainer CLI outputs JSON on the last line
		const lines = stdout.trim().split('\n')
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const parsed = JSON.parse(lines[i]) as Record<string, unknown>
				return {
					outcome: String(parsed.outcome ?? 'unknown'),
					containerId: parsed.containerId
						? String(parsed.containerId)
						: undefined,
				}
			} catch {
				// not JSON, try next line
			}
		}
	} catch {
		// ignore parse errors
	}
	return { outcome: 'unknown' }
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

type CreateSandboxManagerParams = {
	readonly logger: Logger
	readonly execFileImpl?: typeof execFile
	readonly dockerInspect?: (containerId: string) => Promise<{ State: { Status: string } }>
}

export const createSandboxManager = ({
	logger,
	execFileImpl = execFile,
	dockerInspect,
}: CreateSandboxManagerParams): SandboxManager => {
	const createSandbox = async ({
		id,
		workspacePath,
		devcontainerConfig,
		resourceLimits,
		logger: sandboxLogger,
	}: CreateSandboxParams): Promise<CreateSandboxResult> => {
		sandboxLogger.info({ sandboxId: id, workspacePath }, 'Creating sandbox')

		const args = [
			'up',
			'--workspace-folder',
			workspacePath,
		]

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
			args.push('--override-config', JSON.stringify(overrideConfig))
		}

		try {
			const { stdout, stderr } = await execFileImpl(DEVCONTAINER_BIN, args, {
				timeout: DEFAULT_EXEC_TIMEOUT_MS,
				env: {
					...process.env,
					YOLOGUARD_SANDBOX_ID: id,
				},
			})

			if (stderr) {
				sandboxLogger.debug({ stderr }, 'devcontainer up stderr')
			}

			const output = parseDevcontainerOutput(stdout)

			if (output.outcome !== 'success' && output.outcome !== 'unknown') {
				throw new Error(
					`devcontainer up failed: outcome=${output.outcome}`,
				)
			}

			const containerId = output.containerId ?? 'unknown'
			sandboxLogger.info(
				{ sandboxId: id, containerId },
				'Sandbox created successfully',
			)

			return {
				containerId,
				state: 'running',
			}
		} catch (error) {
			sandboxLogger.error(
				{ sandboxId: id, error },
				'Failed to create sandbox',
			)
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
			const args = ['down', '--workspace-folder', workspacePath]
			const { stderr } = await execFileImpl(DEVCONTAINER_BIN, args, {
				timeout: DEFAULT_EXEC_TIMEOUT_MS,
			})

			if (stderr) {
				sandboxLogger.debug({ stderr }, 'devcontainer down stderr')
			}

			sandboxLogger.info({ sandboxId: id }, 'Sandbox destroyed')
		} catch (error) {
			sandboxLogger.error(
				{ sandboxId: id, error },
				'Failed to destroy sandbox',
			)
			throw error
		}
	}

	const execInSandbox = async ({
		id,
		workspacePath,
		command,
		logger: sandboxLogger,
	}: ExecInSandboxParams): Promise<ExecResult> => {
		sandboxLogger.debug(
			{ sandboxId: id, command },
			'Executing command in sandbox',
		)

		try {
			const args = [
				'exec',
				'--workspace-folder',
				workspacePath,
				...command,
			]

			const { stdout, stderr } = await execFileImpl(
				DEVCONTAINER_BIN,
				args,
				{ timeout: DEFAULT_EXEC_TIMEOUT_MS },
			)

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
			logger.warn(
				{ containerId, error },
				'Failed to inspect container, assuming stopped',
			)
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
