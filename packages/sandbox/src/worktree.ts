import { execFile as execFileCb } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import type { Logger } from '@yologuard/shared'

export const execFile = promisify(execFileCb)

const GIT_BIN = 'git' as const
const DEFAULT_EXEC_TIMEOUT_MS = 60_000 as const

export const hashRepoUrl = (url: string): string =>
  createHash('sha256').update(url).digest('hex').slice(0, 16)

type EnsureBareCloneParams = {
  readonly repoUrl: string
  readonly cacheDir: string
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
}

export const ensureBareClone = async ({
  repoUrl,
  cacheDir,
  logger,
  execFileImpl = execFile,
}: EnsureBareCloneParams): Promise<string> => {
  const hash = hashRepoUrl(repoUrl)
  const bareRepoPath = `${cacheDir}/${hash}.git`

  try {
    // Try fetching — if the bare clone already exists, this updates it
    await execFileImpl(GIT_BIN, ['--git-dir', bareRepoPath, 'fetch', '--all'], {
      timeout: DEFAULT_EXEC_TIMEOUT_MS,
    })
    logger.info({ repoUrl, bareRepoPath }, 'Fetched updates for bare clone')
  } catch {
    // Bare clone doesn't exist yet, create it
    logger.info({ repoUrl, bareRepoPath }, 'Creating bare clone')
    await execFileImpl(GIT_BIN, ['clone', '--bare', repoUrl, bareRepoPath], {
      timeout: DEFAULT_EXEC_TIMEOUT_MS,
    })
  }

  return bareRepoPath
}

type CreateWorktreeParams = {
  readonly bareRepoPath: string
  readonly targetDir: string
  readonly branch: string
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
}

export const createWorktree = async ({
  bareRepoPath,
  targetDir,
  branch,
  logger,
  execFileImpl = execFile,
}: CreateWorktreeParams): Promise<void> => {
  logger.info({ bareRepoPath, targetDir, branch }, 'Creating worktree')
  await execFileImpl(GIT_BIN, ['--git-dir', bareRepoPath, 'worktree', 'add', targetDir, branch], {
    timeout: DEFAULT_EXEC_TIMEOUT_MS,
  })
}

type RemoveWorktreeParams = {
  readonly bareRepoPath: string
  readonly worktreePath: string
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
}

export const removeWorktree = async ({
  bareRepoPath,
  worktreePath,
  logger,
  execFileImpl = execFile,
}: RemoveWorktreeParams): Promise<void> => {
  logger.info({ bareRepoPath, worktreePath }, 'Removing worktree')
  await execFileImpl(
    GIT_BIN,
    ['--git-dir', bareRepoPath, 'worktree', 'remove', worktreePath, '--force'],
    { timeout: DEFAULT_EXEC_TIMEOUT_MS },
  )
}

type PruneWorktreesParams = {
  readonly bareRepoPath: string
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
}

export const pruneWorktrees = async ({
  bareRepoPath,
  logger,
  execFileImpl = execFile,
}: PruneWorktreesParams): Promise<void> => {
  logger.info({ bareRepoPath }, 'Pruning worktrees')
  await execFileImpl(GIT_BIN, ['--git-dir', bareRepoPath, 'worktree', 'prune'], {
    timeout: DEFAULT_EXEC_TIMEOUT_MS,
  })
}

type WarmCacheParams = {
  readonly repos: readonly { readonly url: string }[]
  readonly cacheDir: string
  readonly logger: Logger
  readonly execFileImpl?: typeof execFile
}

export const warmCache = async ({
  repos,
  cacheDir,
  logger,
  execFileImpl = execFile,
}: WarmCacheParams): Promise<void> => {
  logger.info({ repoCount: repos.length }, 'Warming repo cache')
  await Promise.all(
    repos.map((repo) => ensureBareClone({ repoUrl: repo.url, cacheDir, logger, execFileImpl })),
  )
}
