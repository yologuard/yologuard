import { configureSparseCheckout, isSparseCheckout } from './sparse.js'

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

describe('sparse', () => {
	const logger = createMockLogger() as unknown as Parameters<typeof configureSparseCheckout>[0]['logger']

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('configureSparseCheckout', () => {
		it('should call git sparse-checkout set with given patterns', async () => {
			const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

			await configureSparseCheckout({
				worktreePath: '/workspace/my-repo',
				patterns: ['src/', 'docs/'],
				logger,
				execFileImpl: mockExecFile as never,
			})

			expect(mockExecFile).toHaveBeenCalledWith(
				'git',
				['-C', '/workspace/my-repo', 'sparse-checkout', 'set', 'src/', 'docs/'],
				expect.objectContaining({ timeout: expect.any(Number) }),
			)
		})

		it('should handle a single pattern', async () => {
			const mockExecFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

			await configureSparseCheckout({
				worktreePath: '/workspace/my-repo',
				patterns: ['src/'],
				logger,
				execFileImpl: mockExecFile as never,
			})

			expect(mockExecFile).toHaveBeenCalledWith(
				'git',
				['-C', '/workspace/my-repo', 'sparse-checkout', 'set', 'src/'],
				expect.objectContaining({ timeout: expect.any(Number) }),
			)
		})

		it('should propagate git errors', async () => {
			const mockExecFile = vi.fn().mockRejectedValue(new Error('git error'))

			await expect(
				configureSparseCheckout({
					worktreePath: '/workspace/my-repo',
					patterns: ['src/'],
					logger,
					execFileImpl: mockExecFile as never,
				}),
			).rejects.toThrow('git error')
		})
	})

	describe('isSparseCheckout', () => {
		it('should return true when sparse checkout is configured', async () => {
			const mockExecFile = vi.fn().mockResolvedValue({ stdout: 'true\n', stderr: '' })

			const result = await isSparseCheckout({
				worktreePath: '/workspace/my-repo',
				execFileImpl: mockExecFile as never,
			})

			expect(result).toBe(true)
			expect(mockExecFile).toHaveBeenCalledWith(
				'git',
				['-C', '/workspace/my-repo', 'config', '--get', 'core.sparseCheckout'],
				expect.objectContaining({ timeout: expect.any(Number) }),
			)
		})

		it('should return false when sparse checkout is not configured', async () => {
			const mockExecFile = vi.fn().mockResolvedValue({ stdout: 'false\n', stderr: '' })

			const result = await isSparseCheckout({
				worktreePath: '/workspace/my-repo',
				execFileImpl: mockExecFile as never,
			})

			expect(result).toBe(false)
		})

		it('should return false when git config fails', async () => {
			const mockExecFile = vi.fn().mockRejectedValue(new Error('config not found'))

			const result = await isSparseCheckout({
				worktreePath: '/workspace/my-repo',
				execFileImpl: mockExecFile as never,
			})

			expect(result).toBe(false)
		})
	})
})
