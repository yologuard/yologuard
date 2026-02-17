import { prepareRepos, cleanupRepos } from './repo-manager.js'
import { hashRepoUrl } from './worktree.js'
import type { RepoMount } from '@yologuard/shared'

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  level: 'info',
})

describe('repo-manager', () => {
  const logger = createMockLogger() as unknown as Parameters<typeof prepareRepos>[0]['logger']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('prepareRepos', () => {
    it('should clone and create worktree for each repo', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/my-app.git', access: 'read-write' },
      ]

      const result = await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        repoUrl: 'https://github.com/org/my-app.git',
        mountPath: '/workspace/my-app',
        access: 'read-write',
      })

      // ensureBareClone (fetch) + createWorktree
      expect(mockExecFile).toHaveBeenCalledTimes(2)
    })

    it('should configure sparse checkout when sparsePaths are provided', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        {
          url: 'https://github.com/org/my-app.git',
          access: 'readonly',
          sparsePaths: ['src/', 'docs/'],
        },
      ]

      const result = await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(result).toHaveLength(1)
      expect(result[0]?.access).toBe('readonly')

      // ensureBareClone (fetch) + createWorktree + configureSparseCheckout
      expect(mockExecFile).toHaveBeenCalledTimes(3)
      // Last call should be sparse-checkout
      expect(mockExecFile).toHaveBeenLastCalledWith(
        'git',
        expect.arrayContaining(['sparse-checkout', 'set', 'src/', 'docs/']),
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
    })

    it('should skip sparse checkout when sparsePaths is empty', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        {
          url: 'https://github.com/org/my-app.git',
          access: 'read-write',
          sparsePaths: [],
        },
      ]

      await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      // ensureBareClone (fetch) + createWorktree only, no sparse-checkout
      expect(mockExecFile).toHaveBeenCalledTimes(2)
    })

    it('should handle multiple repos', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/repo-a.git', access: 'read-write' },
        { url: 'https://github.com/org/repo-b.git', access: 'readonly' },
      ]

      const result = await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(result).toHaveLength(2)
      expect(result[0]?.mountPath).toBe('/workspace/repo-a')
      expect(result[1]?.mountPath).toBe('/workspace/repo-b')
    })

    it('should strip .git suffix from repo name for mount path', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/my-project.git', access: 'read-write' },
      ]

      const result = await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(result[0]?.mountPath).toBe('/workspace/my-project')
    })

    it('should handle URLs without .git suffix', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/my-project', access: 'read-write' },
      ]

      const result = await prepareRepos({
        repos,
        sandboxId: 'sandbox-1',
        cacheDir: '/cache',
        workspaceDir: '/workspace',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(result[0]?.mountPath).toBe('/workspace/my-project')
    })
  })

  describe('cleanupRepos', () => {
    it('should remove worktrees and prune for each repo', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/my-app.git', access: 'read-write' },
      ]

      await cleanupRepos({
        sandboxId: 'sandbox-1',
        repos,
        workspaceDir: '/workspace',
        cacheDir: '/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      const hash = hashRepoUrl('https://github.com/org/my-app.git')

      // removeWorktree + pruneWorktrees
      expect(mockExecFile).toHaveBeenCalledTimes(2)
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'remove', '/workspace/my-app', '--force']),
        expect.any(Object),
      )
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['--git-dir', `/cache/${hash}.git`, 'worktree', 'prune'],
        expect.any(Object),
      )
    })

    it('should continue cleanup when worktree remove fails', async () => {
      const mockExecFile = vi
        .fn()
        .mockRejectedValueOnce(new Error('worktree not found'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      const repos: RepoMount[] = [
        { url: 'https://github.com/org/my-app.git', access: 'read-write' },
      ]

      // Should not throw
      await cleanupRepos({
        sandboxId: 'sandbox-1',
        repos,
        workspaceDir: '/workspace',
        cacheDir: '/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      // Still called prune after failed remove
      expect(mockExecFile).toHaveBeenCalledTimes(2)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should handle multiple repos during cleanup', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const repos: RepoMount[] = [
        { url: 'https://github.com/org/repo-a.git', access: 'read-write' },
        { url: 'https://github.com/org/repo-b.git', access: 'readonly' },
      ]

      await cleanupRepos({
        sandboxId: 'sandbox-1',
        repos,
        workspaceDir: '/workspace',
        cacheDir: '/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      // 2 repos × (remove + prune) = 4 calls
      expect(mockExecFile).toHaveBeenCalledTimes(4)
    })
  })
})
