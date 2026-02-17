import type { Logger } from '@yologuard/shared'

// Git credential helper protocol:
// Git sends: protocol=https\nhost=github.com\npath=org/repo.git\n\n
// We respond: username=x-access-token\npassword=<token>\n\n

type CredentialRequest = {
  readonly protocol: string
  readonly host: string
  readonly path?: string
  readonly username?: string
}

type CredentialResponse = {
  readonly username: string
  readonly password: string
}

type CredentialProvider = (params: {
  readonly remote: string
  readonly sandboxId: string
}) => { token: string } | undefined

type CreateCredentialHelperParams = {
  readonly logger: Logger
  readonly sandboxId: string
  readonly credentialProvider: CredentialProvider
}

export const parseCredentialInput = (input: string): CredentialRequest => {
  const fields: Record<string, string> = {}
  for (const line of input.split('\n')) {
    const eqIndex = line.indexOf('=')
    if (eqIndex > 0) {
      fields[line.slice(0, eqIndex)] = line.slice(eqIndex + 1)
    }
  }
  return {
    protocol: fields.protocol ?? '',
    host: fields.host ?? '',
    path: fields.path,
    username: fields.username,
  }
}

export const formatCredentialOutput = (response: CredentialResponse): string =>
  `username=${response.username}\npassword=${response.password}\n`

export const createCredentialHelper = ({
  logger,
  sandboxId,
  credentialProvider,
}: CreateCredentialHelperParams) => {
  const get = (input: string): string | undefined => {
    const request = parseCredentialInput(input)
    const remote = `${request.protocol}://${request.host}/${request.path ?? ''}`

    logger.debug({ remote, sandboxId }, 'Credential helper: get')

    const credential = credentialProvider({ remote, sandboxId })
    if (!credential) {
      logger.warn({ remote, sandboxId }, 'Credential denied')
      return undefined
    }

    return formatCredentialOutput({
      username: 'x-access-token',
      password: credential.token,
    })
  }

  const store = (_input: string): void => {
    // No-op: we don't store credentials from git
  }

  const erase = (_input: string): void => {
    // No-op: credential lifecycle managed by gateway
  }

  return { get, store, erase } as const
}
