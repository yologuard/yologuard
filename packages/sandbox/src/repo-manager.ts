import { basename } from 'node:path'
import type { Logger, RepoMount } from '@yologuard/shared'
import { ensureBareClone, createWorktree, removeWorktree, pruneWorktrees, hashRepoUrl, execFile } from './worktree.js'
import { configureSparseCheckout } from './sparse.js'

type PreparedRepo = {
	readonly repoUrl: string
	readonly mountPath: string
	readonly access: RepoMount['access']
}

type PrepareReposParams = {
	readonly repos: readonly RepoMount[]
	readonly sandboxId: string
	readonly cacheDir: string
	readonly workspaceDir: string
	readonly logger: Logger
	readonly execFileImpl?: typeof execFile
}

const repoNameFromUrl = (url: string): string => {
	const name = basename(url)
	return name.endsWith('.git') ? name.slice(0, -4) : name
}

export const prepareRepos = async ({
	repos,
	sandboxId,
	cacheDir,
	workspaceDir,
	logger,
	execFileImpl,
}: PrepareReposParams): Promise<readonly PreparedRepo[]> => {
	logger.info({ sandboxId, repoCount: repos.length }, 'Preparing repos for sandbox')

	const results: PreparedRepo[] = []

	for (const repo of repos) {
		const bareRepoPath = await ensureBareClone({
			repoUrl: repo.url,
			cacheDir,
			logger,
			execFileImpl,
		})

		const repoName = repoNameFromUrl(repo.url)
		const targetDir = `${workspaceDir}/${repoName}`

		await createWorktree({
			bareRepoPath,
			targetDir,
			branch: 'HEAD',
			logger,
			execFileImpl,
		})

		if (repo.sparsePaths && repo.sparsePaths.length > 0) {
			await configureSparseCheckout({
				worktreePath: targetDir,
				patterns: repo.sparsePaths,
				logger,
				execFileImpl,
			})
		}

		results.push({
			repoUrl: repo.url,
			mountPath: targetDir,
			access: repo.access,
		})
	}

	return results
}

type CleanupReposParams = {
	readonly sandboxId: string
	readonly repos: readonly RepoMount[]
	readonly workspaceDir: string
	readonly cacheDir: string
	readonly logger: Logger
	readonly execFileImpl?: typeof execFile
}

export const cleanupRepos = async ({
	sandboxId,
	repos,
	workspaceDir,
	cacheDir,
	logger,
	execFileImpl,
}: CleanupReposParams): Promise<void> => {
	logger.info({ sandboxId }, 'Cleaning up repos for sandbox')

	for (const repo of repos) {
		const hash = hashRepoUrl(repo.url)
		const bareRepoPath = `${cacheDir}/${hash}.git`
		const repoName = repoNameFromUrl(repo.url)
		const worktreePath = `${workspaceDir}/${repoName}`

		try {
			await removeWorktree({
				bareRepoPath,
				worktreePath,
				logger,
				execFileImpl,
			})
		} catch (error) {
			logger.warn({ worktreePath, error }, 'Failed to remove worktree, will prune')
		}

		try {
			await pruneWorktrees({
				bareRepoPath,
				logger,
				execFileImpl,
			})
		} catch (error) {
			logger.warn({ bareRepoPath, error }, 'Failed to prune worktrees')
		}
	}
}
