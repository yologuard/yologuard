import { join } from 'node:path'
import { createLogger, loadConfig, getConfigDir } from '@yologuard/shared'
import { warmCache } from '@yologuard/sandbox'

export const warm = async () => {
  const logger = createLogger({ name: 'cli' })
  const config = loadConfig()

  const workspaces = Object.values(config.workspaces)
  if (workspaces.length === 0) {
    logger.info('No workspaces configured — nothing to warm')
    return
  }

  const repos = workspaces.flatMap((ws) => ws.repos)
  const uniqueRepos = [...new Map(repos.map((r) => [r.url, r])).values()]

  const cacheDir = join(getConfigDir(), 'repos')
  logger.info({ repoCount: uniqueRepos.length }, 'Warming repo cache')

  await warmCache({ repos: uniqueRepos, cacheDir, logger })

  logger.info('Repo cache warmed successfully')
}
