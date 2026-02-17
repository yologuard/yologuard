import { redactSecrets } from './redact.js'

describe('redactSecrets', () => {
  it('redacts Bearer tokens', () => {
    const input =
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw'
    const result = redactSecrets(input)
    expect(result).not.toContain('eyJhbGci')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts GitHub personal access tokens', () => {
    const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
    const result = redactSecrets(input)
    expect(result).not.toContain('ghp_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts GitHub OAuth tokens', () => {
    const input = 'token: gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
    const result = redactSecrets(input)
    expect(result).not.toContain('gho_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts GitHub fine-grained PATs', () => {
    const pat = `github_pat_${'A'.repeat(82)}`
    const input = `token: ${pat}`
    const result = redactSecrets(input)
    expect(result).not.toContain('github_pat_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts OpenAI/Anthropic API keys', () => {
    const key = `sk-${'a'.repeat(48)}`
    const input = `api_key: ${key}`
    const result = redactSecrets(input)
    expect(result).not.toContain('sk-')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts AWS access keys', () => {
    const input = 'aws_access_key_id: AKIAIOSFODNN7EXAMPLE'
    const result = redactSecrets(input)
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts high-entropy base64 strings', () => {
    const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrs=='
    const input = `secret: ${b64}`
    const result = redactSecrets(input)
    expect(result).not.toContain(b64)
    expect(result).toContain('[REDACTED]')
  })

  it('leaves short strings unchanged', () => {
    const input = 'hello world, nothing secret here'
    expect(redactSecrets(input)).toBe(input)
  })

  it('redacts multiple secrets in the same string', () => {
    const input = [
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    ].join(' and ')
    const result = redactSecrets(input)
    expect(result).not.toContain('eyJhbGci')
    expect(result).not.toContain('ghp_')
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('preserves surrounding text', () => {
    const input = 'before ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij after'
    const result = redactSecrets(input)
    expect(result).toMatch(/^before .+ after$/)
  })
})
