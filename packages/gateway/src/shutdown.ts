import type { Logger } from '@yologuard/shared'

type ShutdownHandler = () => Promise<void>

const handlers: ShutdownHandler[] = []
let registered = false

export const onShutdown = (handler: ShutdownHandler) => {
  handlers.push(handler)
}

export const registerShutdownHandlers = ({ logger }: { logger: Logger }) => {
  if (registered) return
  registered = true

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal')
    for (const handler of handlers) {
      try {
        await handler()
      } catch (err) {
        logger.error({ err }, 'Error during shutdown')
      }
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
