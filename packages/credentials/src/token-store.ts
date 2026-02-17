import type { Logger } from '@yologuard/shared'
import { PROTECTED_BRANCHES } from '@yologuard/shared'

type Token = {
	readonly id: string
	readonly provider: 'github' | 'gitlab'
	readonly token: string
	readonly scopes?: readonly string[]
	readonly createdAt: string
	readonly expiresAt?: string
}

type ScopedCredential = {
	readonly token: string
	readonly expiresAt: string
}

type TokenStoreParams = {
	readonly logger: Logger
}

type IssueCredentialParams = {
	readonly sandboxId: string
	readonly remote: string
	readonly branch?: string
}

type TokenStore = {
	readonly addToken: (params: {
		readonly provider: 'github' | 'gitlab'
		readonly token: string
		readonly scopes?: readonly string[]
	}) => Token
	readonly removeToken: (id: string) => boolean
	readonly listTokens: () => readonly Token[]
	readonly issueCredential: (params: IssueCredentialParams) => ScopedCredential | undefined
	readonly isAllowedBranch: (branch: string) => boolean
	readonly isAllowedRemote: (params: {
		readonly sandboxId: string
		readonly remote: string
	}) => boolean
}

const CREDENTIAL_TTL_MS = 300_000 as const // 5 minutes
const BRANCH_PREFIX = 'yologuard/' as const

const tokens = new Map<string, Token>()
const approvedRemotes = new Map<string, Set<string>>() // sandboxId → Set of approved remotes

/** @internal Test-only: reset module state */
export const _resetTokenStoreState = (): void => {
	tokens.clear()
	approvedRemotes.clear()
}

export const createTokenStore = ({ logger }: TokenStoreParams): TokenStore => {
	const addToken = ({
		provider,
		token,
		scopes,
	}: {
		readonly provider: 'github' | 'gitlab'
		readonly token: string
		readonly scopes?: readonly string[]
	}): Token => {
		const entry: Token = {
			id: crypto.randomUUID(),
			provider,
			token,
			scopes,
			createdAt: new Date().toISOString(),
		}
		tokens.set(entry.id, entry)
		logger.info({ provider, id: entry.id }, 'Token added to store')
		return entry
	}

	const removeToken = (id: string): boolean => {
		const deleted = tokens.delete(id)
		if (deleted) {
			logger.info({ id }, 'Token removed from store')
		}
		return deleted
	}

	const listTokens = (): readonly Token[] => [...tokens.values()]

	const isAllowedBranch = (branch: string): boolean => {
		// Allow yologuard/* branches
		if (branch.startsWith(BRANCH_PREFIX)) return true

		// Block protected branches
		const branchName = branch.replace(/^refs\/heads\//, '')
		return !(PROTECTED_BRANCHES as readonly string[]).includes(branchName)
	}

	const isAllowedRemote = ({
		sandboxId,
		remote,
	}: {
		readonly sandboxId: string
		readonly remote: string
	}): boolean => {
		const approved = approvedRemotes.get(sandboxId)
		return approved?.has(remote) ?? false
	}

	const issueCredential = ({
		sandboxId,
		remote,
		branch,
	}: IssueCredentialParams): ScopedCredential | undefined => {
		// Check branch allowlist
		if (branch && !isAllowedBranch(branch)) {
			logger.warn(
				{ sandboxId, branch },
				'Credential denied: protected branch',
			)
			return undefined
		}

		// Check remote allowlist
		if (!isAllowedRemote({ sandboxId, remote })) {
			logger.warn(
				{ sandboxId, remote },
				'Credential denied: unapproved remote',
			)
			return undefined
		}

		// Find a matching token
		const token = [...tokens.values()][0]
		if (!token) {
			logger.warn({ sandboxId }, 'No tokens available')
			return undefined
		}

		const expiresAt = new Date(Date.now() + CREDENTIAL_TTL_MS).toISOString()

		logger.info(
			{ sandboxId, remote, branch, expiresAt },
			'Issuing scoped credential',
		)

		return {
			token: token.token,
			expiresAt,
		}
	}

	return {
		addToken,
		removeToken,
		listTokens,
		issueCredential,
		isAllowedBranch,
		isAllowedRemote,
	} as const
}

export const approveRemote = ({
	sandboxId,
	remote,
}: {
	readonly sandboxId: string
	readonly remote: string
}): void => {
	let remotes = approvedRemotes.get(sandboxId)
	if (!remotes) {
		remotes = new Set()
		approvedRemotes.set(sandboxId, remotes)
	}
	remotes.add(remote)
}

export const revokeRemote = ({
	sandboxId,
	remote,
}: {
	readonly sandboxId: string
	readonly remote: string
}): void => {
	approvedRemotes.get(sandboxId)?.delete(remote)
}
