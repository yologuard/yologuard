import type { Logger } from '@yologuard/shared'
import { DEFAULT_IDLE_TIMEOUT_MS } from '@yologuard/shared'

const HEALTH_CHECK_INTERVAL_MS = 10_000 as const

type ContainerInspector = {
  readonly inspect: () => Promise<{
    readonly State: {
      readonly Running: boolean
      readonly OOMKilled: boolean
      readonly Status: string
    }
  }>
}

type HealthMonitorCallbacks = {
  readonly onTimeout: (sandboxId: string) => void | Promise<void>
  readonly onUnhealthy: (params: {
    readonly sandboxId: string
    readonly reason: string
  }) => void | Promise<void>
}

type StartHealthMonitorParams = {
  readonly sandboxId: string
  readonly container: ContainerInspector
  readonly idleTimeoutMs?: number
  readonly logger: Logger
} & HealthMonitorCallbacks

type MonitorState = {
  readonly interval: ReturnType<typeof setInterval>
  lastActivityAt: number
  readonly idleTimeoutMs: number
}

const monitors = new Map<string, MonitorState>()

export const startHealthMonitor = ({
  sandboxId,
  container,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  logger,
  onTimeout,
  onUnhealthy,
}: StartHealthMonitorParams): void => {
  // Stop existing monitor if any
  stopHealthMonitor(sandboxId)

  const state: MonitorState = {
    lastActivityAt: Date.now(),
    idleTimeoutMs,
    interval: setInterval(async () => {
      try {
        const info = await container.inspect()

        if (info.State.OOMKilled) {
          logger.warn({ sandboxId }, 'Container OOM killed')
          await onUnhealthy({ sandboxId, reason: 'OOM killed' })
          stopHealthMonitor(sandboxId)
          return
        }

        if (!info.State.Running) {
          logger.warn({ sandboxId, status: info.State.Status }, 'Container not running')
          await onUnhealthy({
            sandboxId,
            reason: `Container status: ${info.State.Status}`,
          })
          stopHealthMonitor(sandboxId)
          return
        }

        // Check idle timeout
        const monitor = monitors.get(sandboxId)
        if (monitor) {
          const idleDuration = Date.now() - monitor.lastActivityAt
          if (idleDuration >= monitor.idleTimeoutMs) {
            logger.info({ sandboxId, idleDuration }, 'Sandbox idle timeout reached')
            await onTimeout(sandboxId)
            stopHealthMonitor(sandboxId)
            return
          }
        }
      } catch (err) {
        logger.error({ sandboxId, err }, 'Health check failed')
      }
    }, HEALTH_CHECK_INTERVAL_MS),
  }

  monitors.set(sandboxId, state)
  logger.info({ sandboxId, idleTimeoutMs }, 'Health monitor started')
}

export const stopHealthMonitor = (sandboxId: string): void => {
  const monitor = monitors.get(sandboxId)
  if (monitor) {
    clearInterval(monitor.interval)
    monitors.delete(sandboxId)
  }
}

export const reportActivity = (sandboxId: string): void => {
  const monitor = monitors.get(sandboxId)
  if (monitor) {
    monitor.lastActivityAt = Date.now()
  }
}

export const isMonitoring = (sandboxId: string): boolean => monitors.has(sandboxId)

export const stopAllMonitors = (): void => {
  for (const [id] of monitors) {
    stopHealthMonitor(id)
  }
}
