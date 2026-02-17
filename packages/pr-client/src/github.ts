import type { Logger } from '@yologuard/shared'

type GitHubPRParams = {
	readonly owner: string
	readonly repo: string
	readonly title: string
	readonly body?: string
	readonly head: string
	readonly base: string
	readonly draft?: boolean
}

type GitHubPR = {
	readonly number: number
	readonly url: string
	readonly htmlUrl: string
	readonly state: string
	readonly title: string
	readonly head: string
	readonly base: string
	readonly createdAt: string
}

type GitHubClientParams = {
	readonly logger: Logger
	readonly token: string
	readonly baseUrl?: string
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

type GitHubClient = {
	readonly createPR: (params: GitHubPRParams) => Promise<GitHubPR>
	readonly getPR: (params: {
		readonly owner: string
		readonly repo: string
		readonly number: number
	}) => Promise<GitHubPR>
	readonly listPRs: (params: {
		readonly owner: string
		readonly repo: string
		readonly state?: 'open' | 'closed' | 'all'
		readonly head?: string
	}) => Promise<readonly GitHubPR[]>
	readonly addLabels: (params: {
		readonly owner: string
		readonly repo: string
		readonly number: number
		readonly labels: readonly string[]
	}) => Promise<void>
	readonly addComment: (params: {
		readonly owner: string
		readonly repo: string
		readonly number: number
		readonly body: string
	}) => Promise<{ readonly id: number }>
}

const mapPR = (data: Record<string, unknown>): GitHubPR => ({
	number: data.number as number,
	url: data.url as string,
	htmlUrl: (data.html_url as string) ?? '',
	state: data.state as string,
	title: data.title as string,
	head: ((data.head as Record<string, unknown>)?.ref as string) ?? '',
	base: ((data.base as Record<string, unknown>)?.ref as string) ?? '',
	createdAt: (data.created_at as string) ?? '',
})

export const createGitHubClient = ({
	logger,
	token,
	baseUrl = 'https://api.github.com',
	fetchImpl = globalThis.fetch,
}: GitHubClientParams & { readonly fetchImpl?: FetchFn }): GitHubClient => {
	const request = async (
		method: string,
		path: string,
		body?: unknown,
	): Promise<unknown> => {
		const url = `${baseUrl}${path}`
		logger.debug({ method, url }, 'GitHub API request')

		const response = await fetchImpl(url, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: body ? JSON.stringify(body) : undefined,
		})

		if (!response.ok) {
			const text = await response.text()
			logger.error(
				{ status: response.status, body: text, url },
				'GitHub API error',
			)
			throw new Error(
				`GitHub API ${method} ${path}: ${response.status} ${text}`,
			)
		}

		return response.json()
	}

	const createPR = async (params: GitHubPRParams): Promise<GitHubPR> => {
		const data = (await request(
			'POST',
			`/repos/${params.owner}/${params.repo}/pulls`,
			{
				title: params.title,
				body: params.body ?? '',
				head: params.head,
				base: params.base,
				draft: params.draft ?? false,
			},
		)) as Record<string, unknown>

		logger.info(
			{
				owner: params.owner,
				repo: params.repo,
				number: data.number,
			},
			'PR created',
		)

		return mapPR(data)
	}

	const getPR = async ({
		owner,
		repo,
		number,
	}: {
		readonly owner: string
		readonly repo: string
		readonly number: number
	}): Promise<GitHubPR> => {
		const data = (await request(
			'GET',
			`/repos/${owner}/${repo}/pulls/${number}`,
		)) as Record<string, unknown>
		return mapPR(data)
	}

	const listPRs = async ({
		owner,
		repo,
		state = 'open',
		head,
	}: {
		readonly owner: string
		readonly repo: string
		readonly state?: 'open' | 'closed' | 'all'
		readonly head?: string
	}): Promise<readonly GitHubPR[]> => {
		const params = new URLSearchParams({ state })
		if (head) params.set('head', head)

		const data = (await request(
			'GET',
			`/repos/${owner}/${repo}/pulls?${params}`,
		)) as Record<string, unknown>[]
		return data.map(mapPR)
	}

	const addLabels = async ({
		owner,
		repo,
		number,
		labels,
	}: {
		readonly owner: string
		readonly repo: string
		readonly number: number
		readonly labels: readonly string[]
	}): Promise<void> => {
		await request(
			'POST',
			`/repos/${owner}/${repo}/issues/${number}/labels`,
			{ labels },
		)
	}

	const addComment = async ({
		owner,
		repo,
		number,
		body,
	}: {
		readonly owner: string
		readonly repo: string
		readonly number: number
		readonly body: string
	}): Promise<{ readonly id: number }> => {
		const data = (await request(
			'POST',
			`/repos/${owner}/${repo}/issues/${number}/comments`,
			{ body },
		)) as Record<string, unknown>
		return { id: data.id as number }
	}

	return { createPR, getPR, listPRs, addLabels, addComment } as const
}
