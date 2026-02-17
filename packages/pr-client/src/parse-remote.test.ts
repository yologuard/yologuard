import { parseGitRemote } from './parse-remote.js'

describe('parseGitRemote', () => {
  it('parses HTTPS URL', () => {
    const result = parseGitRemote('https://github.com/org/repo')
    expect(result).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('parses HTTPS URL with .git', () => {
    const result = parseGitRemote('https://github.com/org/repo.git')
    expect(result).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('parses SSH URL', () => {
    const result = parseGitRemote('git@github.com:org/repo.git')
    expect(result).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('parses SSH URL without .git', () => {
    const result = parseGitRemote('git@github.com:org/repo')
    expect(result).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('parses short form owner/repo', () => {
    const result = parseGitRemote('org/repo')
    expect(result).toEqual({ owner: 'org', repo: 'repo' })
  })

  it('returns undefined for invalid input', () => {
    expect(parseGitRemote('not-a-remote')).toBeUndefined()
    expect(parseGitRemote('')).toBeUndefined()
  })

  it('parses HTTP URL', () => {
    const result = parseGitRemote('http://github.com/owner/project')
    expect(result).toEqual({ owner: 'owner', repo: 'project' })
  })
})
