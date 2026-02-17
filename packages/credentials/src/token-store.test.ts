import {
	createTokenStore,
	approveRemote,
	revokeRemote,
	_resetTokenStoreState,
} from './token-store.js'

const createLogger = () => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis(),
})

describe('createTokenStore', () => {
	let store: ReturnType<typeof createTokenStore>
	let logger: ReturnType<typeof createLogger>

	beforeEach(() => {
		_resetTokenStoreState()
		logger = createLogger()
		store = createTokenStore({ logger })
	})

	describe('addToken / removeToken / listTokens', () => {
		it('adds a token and lists it', () => {
			const token = store.addToken({
				provider: 'github',
				token: 'ghp_test123',
			})
			expect(token.id).toBeDefined()
			expect(token.provider).toBe('github')
			expect(token.token).toBe('ghp_test123')
			expect(token.createdAt).toBeDefined()

			const list = store.listTokens()
			expect(list).toHaveLength(1)
			expect(list[0].id).toBe(token.id)
		})

		it('adds a token with scopes', () => {
			const token = store.addToken({
				provider: 'gitlab',
				token: 'glpat_test',
				scopes: ['read_repository', 'write_repository'],
			})
			expect(token.scopes).toEqual(['read_repository', 'write_repository'])
		})

		it('removes a token', () => {
			const token = store.addToken({
				provider: 'github',
				token: 'ghp_test',
			})
			expect(store.removeToken(token.id)).toBe(true)
			expect(store.listTokens()).toHaveLength(0)
		})

		it('returns false when removing non-existent token', () => {
			expect(store.removeToken('nonexistent')).toBe(false)
		})
	})

	describe('isAllowedBranch', () => {
		it('allows yologuard/* branches', () => {
			expect(store.isAllowedBranch('yologuard/fix-bug')).toBe(true)
			expect(store.isAllowedBranch('yologuard/feature')).toBe(true)
		})

		it('blocks protected branches', () => {
			expect(store.isAllowedBranch('main')).toBe(false)
			expect(store.isAllowedBranch('master')).toBe(false)
			expect(store.isAllowedBranch('production')).toBe(false)
		})

		it('blocks protected branches with refs prefix', () => {
			expect(store.isAllowedBranch('refs/heads/main')).toBe(false)
			expect(store.isAllowedBranch('refs/heads/master')).toBe(false)
		})

		it('allows other branches', () => {
			expect(store.isAllowedBranch('feature/my-thing')).toBe(true)
			expect(store.isAllowedBranch('develop')).toBe(true)
		})
	})

	describe('isAllowedRemote', () => {
		it('denies unapproved remotes', () => {
			expect(
				store.isAllowedRemote({
					sandboxId: 'sb-1',
					remote: 'https://github.com/org/repo',
				}),
			).toBe(false)
		})

		it('allows approved remotes', () => {
			approveRemote({
				sandboxId: 'sb-1',
				remote: 'https://github.com/org/repo',
			})
			expect(
				store.isAllowedRemote({
					sandboxId: 'sb-1',
					remote: 'https://github.com/org/repo',
				}),
			).toBe(true)
		})

		it('does not cross-approve between sandboxes', () => {
			approveRemote({
				sandboxId: 'sb-1',
				remote: 'https://github.com/org/repo',
			})
			expect(
				store.isAllowedRemote({
					sandboxId: 'sb-2',
					remote: 'https://github.com/org/repo',
				}),
			).toBe(false)
		})
	})

	describe('issueCredential', () => {
		beforeEach(() => {
			store.addToken({ provider: 'github', token: 'ghp_real_token' })
			approveRemote({
				sandboxId: 'sb-1',
				remote: 'https://github.com/org/repo',
			})
		})

		it('issues a scoped credential', () => {
			const cred = store.issueCredential({
				sandboxId: 'sb-1',
				remote: 'https://github.com/org/repo',
				branch: 'yologuard/fix',
			})
			expect(cred).toBeDefined()
			expect(cred!.token).toBe('ghp_real_token')
			expect(cred!.expiresAt).toBeDefined()
		})

		it('denies credential for protected branch', () => {
			const cred = store.issueCredential({
				sandboxId: 'sb-1',
				remote: 'https://github.com/org/repo',
				branch: 'main',
			})
			expect(cred).toBeUndefined()
		})

		it('denies credential for unapproved remote', () => {
			const cred = store.issueCredential({
				sandboxId: 'sb-1',
				remote: 'https://github.com/other/repo',
				branch: 'yologuard/fix',
			})
			expect(cred).toBeUndefined()
		})

		it('denies credential when no tokens available', () => {
			_resetTokenStoreState()
			const emptyStore = createTokenStore({ logger })
			approveRemote({
				sandboxId: 'sb-empty',
				remote: 'https://github.com/org/repo',
			})
			const cred = emptyStore.issueCredential({
				sandboxId: 'sb-empty',
				remote: 'https://github.com/org/repo',
			})
			expect(cred).toBeUndefined()
		})
	})
})

describe('approveRemote / revokeRemote', () => {
	beforeEach(() => {
		_resetTokenStoreState()
	})

	it('revokes an approved remote', () => {
		const logger = createLogger()
		const store = createTokenStore({ logger })

		approveRemote({
			sandboxId: 'sb-revoke',
			remote: 'https://github.com/org/repo',
		})
		expect(
			store.isAllowedRemote({
				sandboxId: 'sb-revoke',
				remote: 'https://github.com/org/repo',
			}),
		).toBe(true)

		revokeRemote({
			sandboxId: 'sb-revoke',
			remote: 'https://github.com/org/repo',
		})
		expect(
			store.isAllowedRemote({
				sandboxId: 'sb-revoke',
				remote: 'https://github.com/org/repo',
			}),
		).toBe(false)
	})
})
