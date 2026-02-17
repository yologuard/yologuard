import { createServer, type Server } from 'node:net'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Logger } from '@yologuard/shared'
import { SOCKET_PATH } from '@yologuard/shared'

type SocketRequest = {
  readonly type: string
  readonly sandboxId: string
  readonly payload: Record<string, unknown>
}

type SocketResponse = {
  readonly type: string
  readonly success: boolean
  readonly data?: Record<string, unknown>
  readonly error?: string
}

type SocketHandler = (request: SocketRequest) => Promise<SocketResponse> | SocketResponse

type CreateSocketServerParams = {
  readonly socketPath?: string
  readonly logger: Logger
  readonly onRequest: SocketHandler
}

type SocketServer = {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export const createSocketServer = ({
  socketPath = SOCKET_PATH,
  logger,
  onRequest,
}: CreateSocketServerParams): SocketServer => {
  let server: Server | null = null

  const start = async (): Promise<void> => {
    // Ensure parent directory exists
    const dir = dirname(socketPath)
    mkdirSync(dir, { recursive: true })

    // Clean up stale socket
    if (existsSync(socketPath)) {
      unlinkSync(socketPath)
    }

    return new Promise((resolve, reject) => {
      server = createServer((connection) => {
        let buffer = ''

        connection.on('data', (chunk) => {
          buffer += chunk.toString()

          // Process complete JSON messages (newline-delimited)
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue

            try {
              const request = JSON.parse(line) as SocketRequest
              logger.debug(
                { type: request.type, sandboxId: request.sandboxId },
                'Socket request received',
              )

              Promise.resolve(onRequest(request))
                .then((response) => {
                  connection.write(JSON.stringify(response) + '\n')
                })
                .catch((err) => {
                  const errorResponse: SocketResponse = {
                    type: 'error',
                    success: false,
                    error: err instanceof Error ? err.message : 'Unknown error',
                  }
                  connection.write(JSON.stringify(errorResponse) + '\n')
                })
            } catch {
              const errorResponse: SocketResponse = {
                type: 'error',
                success: false,
                error: 'Invalid JSON',
              }
              connection.write(JSON.stringify(errorResponse) + '\n')
            }
          }
        })

        connection.on('error', (err) => {
          logger.error({ err }, 'Socket connection error')
        })
      })

      server.on('error', reject)

      server.listen(socketPath, () => {
        logger.info({ socketPath }, 'Unix socket server listening')
        resolve()
      })
    })
  }

  const stop = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }

      server.close(() => {
        // Clean up socket file
        if (existsSync(socketPath)) {
          try {
            unlinkSync(socketPath)
          } catch {
            // Ignore cleanup errors
          }
        }
        logger.info('Unix socket server stopped')
        resolve()
      })
    })
  }

  return { start, stop }
}
