import pino from 'pino'
import { YOLOGUARD_VERSION } from './constants.js'

type CreateLoggerParams = {
  readonly name?: string
  readonly level?: string
}

export const createLogger = ({ name = 'yologuard', level }: CreateLoggerParams = {}) =>
  pino({
    name,
    level: level ?? process.env.LOG_LEVEL ?? 'info',
    base: { version: YOLOGUARD_VERSION },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  })

export type Logger = pino.Logger
