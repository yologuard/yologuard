import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { Logger } from '@yologuard/shared'

const execFile = promisify(execFileCb)

const GIT_BIN = 'git' as const
const DEFAULT_EXEC_TIMEOUT_MS = 30_000 as const

type ConfigureSparseCheckoutParams = {
	readonly worktreePath: string
	readonly patterns: readonly string[]
	readonly logger: Logger
	readonly execFileImpl?: typeof execFile
}

export const configureSparseCheckout = async ({
	worktreePath,
	patterns,
	logger,
	execFileImpl = execFile,
}: ConfigureSparseCheckoutParams): Promise<void> => {
	logger.info({ worktreePath, patterns }, 'Configuring sparse checkout')
	await execFileImpl(
		GIT_BIN,
		['-C', worktreePath, 'sparse-checkout', 'set', ...patterns],
		{ timeout: DEFAULT_EXEC_TIMEOUT_MS },
	)
}

type IsSparseCheckoutParams = {
	readonly worktreePath: string
	readonly execFileImpl?: typeof execFile
}

export const isSparseCheckout = async ({
	worktreePath,
	execFileImpl = execFile,
}: IsSparseCheckoutParams): Promise<boolean> => {
	try {
		const { stdout } = await execFileImpl(
			GIT_BIN,
			['-C', worktreePath, 'config', '--get', 'core.sparseCheckout'],
			{ timeout: DEFAULT_EXEC_TIMEOUT_MS },
		)
		return stdout.trim() === 'true'
	} catch {
		return false
	}
}
