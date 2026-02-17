import { createGitHubClient } from './github.js'

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
})

const mockPR = {
  number: 42,
  url: 'https://api.github.com/repos/org/repo/pulls/42',
  html_url: 'https://github.com/org/repo/pull/42',
  state: 'open',
  title: 'Fix bug',
  head: { ref: 'yologuard/fix-bug' },
  base: { ref: 'main' },
  created_at: '2026-01-01T00:00:00Z',
}

const createMockFetch = (responses: Array<{ status: number; body: unknown }>) => {
  let callIndex = 0
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[0]
    callIndex++
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as Response
  })
}

describe('createGitHubClient', () => {
  describe('createPR', () => {
    it('creates a pull request', async () => {
      const fetchImpl = createMockFetch([{ status: 201, body: mockPR }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      const pr = await client.createPR({
        owner: 'org',
        repo: 'repo',
        title: 'Fix bug',
        head: 'yologuard/fix-bug',
        base: 'main',
      })

      expect(pr.number).toBe(42)
      expect(pr.htmlUrl).toBe('https://github.com/org/repo/pull/42')
      expect(pr.state).toBe('open')
      expect(pr.head).toBe('yologuard/fix-bug')
      expect(pr.base).toBe('main')

      expect(fetchImpl).toHaveBeenCalledOnce()
      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe('https://api.github.com/repos/org/repo/pulls')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        title: 'Fix bug',
        body: '',
        head: 'yologuard/fix-bug',
        base: 'main',
        draft: false,
      })
    })

    it('sends authorization header', async () => {
      const fetchImpl = createMockFetch([{ status: 201, body: mockPR }])
      createGitHubClient({
        logger: createLogger(),
        token: 'ghp_secret',
        fetchImpl,
      }).createPR({
        owner: 'o',
        repo: 'r',
        title: 't',
        head: 'h',
        base: 'b',
      })

      await vi.waitFor(() => {
        expect(fetchImpl).toHaveBeenCalledOnce()
      })
      const [, init] = fetchImpl.mock.calls[0]
      expect(init.headers.Authorization).toBe('Bearer ghp_secret')
    })

    it('throws on API error', async () => {
      const fetchImpl = createMockFetch([{ status: 422, body: { message: 'Validation Failed' } }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      await expect(
        client.createPR({
          owner: 'org',
          repo: 'repo',
          title: 'Bad PR',
          head: 'h',
          base: 'b',
        }),
      ).rejects.toThrow('GitHub API POST')
    })

    it('uses custom base URL', async () => {
      const fetchImpl = createMockFetch([{ status: 201, body: mockPR }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        baseUrl: 'https://ghe.company.com/api/v3',
        fetchImpl,
      })

      await client.createPR({
        owner: 'o',
        repo: 'r',
        title: 't',
        head: 'h',
        base: 'b',
      })

      const [url] = fetchImpl.mock.calls[0]
      expect(url).toContain('ghe.company.com')
    })
  })

  describe('getPR', () => {
    it('fetches a pull request', async () => {
      const fetchImpl = createMockFetch([{ status: 200, body: mockPR }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      const pr = await client.getPR({
        owner: 'org',
        repo: 'repo',
        number: 42,
      })

      expect(pr.number).toBe(42)
      expect(pr.title).toBe('Fix bug')
    })
  })

  describe('listPRs', () => {
    it('lists pull requests', async () => {
      const fetchImpl = createMockFetch([{ status: 200, body: [mockPR] }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      const prs = await client.listPRs({
        owner: 'org',
        repo: 'repo',
      })

      expect(prs).toHaveLength(1)
      expect(prs[0].number).toBe(42)
    })

    it('passes state and head filters', async () => {
      const fetchImpl = createMockFetch([{ status: 200, body: [] }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      await client.listPRs({
        owner: 'org',
        repo: 'repo',
        state: 'closed',
        head: 'org:yologuard/fix',
      })

      const [url] = fetchImpl.mock.calls[0]
      expect(url).toContain('state=closed')
      expect(url).toContain('head=org')
    })
  })

  describe('addLabels', () => {
    it('adds labels to a PR', async () => {
      const fetchImpl = createMockFetch([{ status: 200, body: [] }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      await client.addLabels({
        owner: 'org',
        repo: 'repo',
        number: 42,
        labels: ['yologuard', 'automated'],
      })

      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toContain('/issues/42/labels')
      expect(JSON.parse(init.body as string)).toEqual({
        labels: ['yologuard', 'automated'],
      })
    })
  })

  describe('addComment', () => {
    it('adds a comment to a PR', async () => {
      const fetchImpl = createMockFetch([{ status: 201, body: { id: 999 } }])
      const client = createGitHubClient({
        logger: createLogger(),
        token: 'ghp_test',
        fetchImpl,
      })

      const result = await client.addComment({
        owner: 'org',
        repo: 'repo',
        number: 42,
        body: 'Created by YoloGuard',
      })

      expect(result.id).toBe(999)
      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toContain('/issues/42/comments')
      expect(JSON.parse(init.body as string).body).toBe('Created by YoloGuard')
    })
  })
})
