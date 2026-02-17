import {
  parseCredentialInput,
  formatCredentialOutput,
  createCredentialHelper,
} from './credential-helper.js'

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
})

describe('parseCredentialInput', () => {
  it('parses standard credential input', () => {
    const input = 'protocol=https\nhost=github.com\npath=org/repo.git'
    const result = parseCredentialInput(input)
    expect(result).toEqual({
      protocol: 'https',
      host: 'github.com',
      path: 'org/repo.git',
      username: undefined,
    })
  })

  it('parses input with username', () => {
    const input = 'protocol=https\nhost=github.com\nusername=x-access-token'
    const result = parseCredentialInput(input)
    expect(result.username).toBe('x-access-token')
  })

  it('handles empty input', () => {
    const result = parseCredentialInput('')
    expect(result.protocol).toBe('')
    expect(result.host).toBe('')
  })

  it('handles input with trailing newlines', () => {
    const input = 'protocol=https\nhost=github.com\n\n'
    const result = parseCredentialInput(input)
    expect(result.protocol).toBe('https')
    expect(result.host).toBe('github.com')
  })
})

describe('formatCredentialOutput', () => {
  it('formats credential response', () => {
    const output = formatCredentialOutput({
      username: 'x-access-token',
      password: 'ghp_token123',
    })
    expect(output).toBe('username=x-access-token\npassword=ghp_token123\n')
  })
})

describe('createCredentialHelper', () => {
  it('returns credential on successful get', () => {
    const logger = createLogger()
    const helper = createCredentialHelper({
      logger,
      sandboxId: 'sb-1',
      credentialProvider: () => ({ token: 'ghp_provided' }),
    })

    const result = helper.get('protocol=https\nhost=github.com\npath=org/repo.git')
    expect(result).toBe('username=x-access-token\npassword=ghp_provided\n')
  })

  it('returns undefined when provider denies', () => {
    const logger = createLogger()
    const helper = createCredentialHelper({
      logger,
      sandboxId: 'sb-1',
      credentialProvider: () => undefined,
    })

    const result = helper.get('protocol=https\nhost=github.com\npath=org/repo.git')
    expect(result).toBeUndefined()
  })

  it('passes correct remote to provider', () => {
    const logger = createLogger()
    const provider = vi.fn().mockReturnValue({ token: 'tok' })
    const helper = createCredentialHelper({
      logger,
      sandboxId: 'sb-42',
      credentialProvider: provider,
    })

    helper.get('protocol=https\nhost=github.com\npath=org/repo.git')
    expect(provider).toHaveBeenCalledWith({
      remote: 'https://github.com/org/repo.git',
      sandboxId: 'sb-42',
    })
  })

  it('store is a no-op', () => {
    const logger = createLogger()
    const helper = createCredentialHelper({
      logger,
      sandboxId: 'sb-1',
      credentialProvider: () => undefined,
    })
    // Should not throw
    helper.store('protocol=https\nhost=github.com')
  })

  it('erase is a no-op', () => {
    const logger = createLogger()
    const helper = createCredentialHelper({
      logger,
      sandboxId: 'sb-1',
      credentialProvider: () => undefined,
    })
    // Should not throw
    helper.erase('protocol=https\nhost=github.com')
  })
})
