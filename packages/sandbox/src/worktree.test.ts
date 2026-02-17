import {
  hashRepoUrl,
  ensureBareClone,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  warmCache,
} from './worktree.js'

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

describe('worktree', () => {
  const logger = createMockLogger() as unknown as Parameters<typeof ensureBareClone>[0]['logger']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hashRepoUrl', () => {
    it('should produce a consistent 16-character hex hash', () => {
      const hash = hashRepoUrl('https://github.com/org/repo.git')
      expect(hash).toHaveLength(16)
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it('should produce the same hash for the same URL', () => {
      const hash1 = hashRepoUrl('https://github.com/org/repo.git')
      const hash2 = hashRepoUrl('https://github.com/org/repo.git')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different URLs', () => {
      const hash1 = hashRepoUrl('https://github.com/org/repo-a.git')
      const hash2 = hashRepoUrl('https://github.com/org/repo-b.git')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('ensureBareClone', () => {
    it('should fetch when bare clone already exists', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

      const result = await ensureBareClone({
        repoUrl: 'https://github.com/org/repo.git',
        cacheDir: '/tmp/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).toHaveBeenCalledOnce()
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['fetch', '--all']),
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
      const hash = hashRepoUrl('https://github.com/org/repo.git')
      expect(result).toBe(`/tmp/cache/${hash}.git`)
    })

    it('should clone when fetch fails (no existing bare clone)', async () => {
      const mockExecFile = vi
        .fn()
        .mockRejectedValueOnce(new Error('not a git repository'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' })

      const result = await ensureBareClone({
        repoUrl: 'https://github.com/org/repo.git',
        cacheDir: '/tmp/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).toHaveBeenCalledTimes(2)
      expect(mockExecFile).toHaveBeenLastCalledWith(
        'git',
        ['clone', '--bare', 'https://github.com/org/repo.git', result],
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
    })

    it('should propagate clone errors', async () => {
      const mockExecFile = vi
        .fn()
        .mockRejectedValueOnce(new Error('not a git repository'))
        .mockRejectedValueOnce(new Error('clone failed'))

      await expect(
        ensureBareClone({
          repoUrl: 'https://github.com/org/repo.git',
          cacheDir: '/tmp/cache',
          logger,
          execFileImpl: mockExecFile as never,
        }),
      ).rejects.toThrow('clone failed')
    })
  })

  describe('createWorktree', () => {
    it('should call git worktree add with correct args', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

      await createWorktree({
        bareRepoPath: '/cache/abc123.git',
        targetDir: '/workspace/my-repo',
        branch: 'main',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['--git-dir', '/cache/abc123.git', 'worktree', 'add', '/workspace/my-repo', 'main'],
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
    })
  })

  describe('removeWorktree', () => {
    it('should call git worktree remove with --force', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

      await removeWorktree({
        bareRepoPath: '/cache/abc123.git',
        worktreePath: '/workspace/my-repo',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['--git-dir', '/cache/abc123.git', 'worktree', 'remove', '/workspace/my-repo', '--force'],
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
    })
  })

  describe('pruneWorktrees', () => {
    it('should call git worktree prune', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

      await pruneWorktrees({
        bareRepoPath: '/cache/abc123.git',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['--git-dir', '/cache/abc123.git', 'worktree', 'prune'],
        expect.objectContaining({ timeout: expect.any(Number) }),
      )
    })
  })

  describe('warmCache', () => {
    it('should fetch all repos in parallel', async () => {
      const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

      await warmCache({
        repos: [
          { url: 'https://github.com/org/repo-a.git' },
          { url: 'https://github.com/org/repo-b.git' },
        ],
        cacheDir: '/tmp/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      // Each repo triggers a fetch call (or clone)
      expect(mockExecFile).toHaveBeenCalledTimes(2)
    })

    it('should handle empty repos list', async () => {
      const mockExecFile = vi.fn()

      await warmCache({
        repos: [],
        cacheDir: '/tmp/cache',
        logger,
        execFileImpl: mockExecFile as never,
      })

      expect(mockExecFile).not.toHaveBeenCalled()
    })
  })
})
