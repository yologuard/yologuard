import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  yologuardConfigSchema,
  loadConfig,
} from '@yologuard/shared'

const getConfigPath = (): string => join(homedir(), DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE)

const readRawConfig = (): Record<string, unknown> => {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return {}
  return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
}

const writeRawConfig = (data: Record<string, unknown>): void => {
  const configPath = getConfigPath()
  const dir = join(homedir(), DEFAULT_CONFIG_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(data, null, '\t') + '\n')
}

const getNestedValue = ({
  obj,
  path,
}: {
  readonly obj: Record<string, unknown>
  readonly path: string
}): unknown => {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

const setNestedValue = ({
  obj,
  path,
  value,
}: {
  readonly obj: Record<string, unknown>
  readonly path: string
  readonly value: unknown
}): Record<string, unknown> => {
  const keys = path.split('.')
  const result = { ...obj }
  let current: Record<string, unknown> = result

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const existing = current[key]
    if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      current[key] = { ...(existing as Record<string, unknown>) }
    } else {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[keys[keys.length - 1]] = value
  return result
}

const deleteNestedValue = ({
  obj,
  path,
}: {
  readonly obj: Record<string, unknown>
  readonly path: string
}): Record<string, unknown> => {
  const keys = path.split('.')
  const result = { ...obj }
  let current: Record<string, unknown> = result

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const existing = current[key]
    if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      current[key] = { ...(existing as Record<string, unknown>) }
    } else {
      return result
    }
    current = current[key] as Record<string, unknown>
  }

  delete current[keys[keys.length - 1]]
  return result
}

const parseValue = (raw: string): unknown => {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  const num = Number(raw)
  if (!Number.isNaN(num) && raw.trim() !== '') return num
  // Try JSON array/object
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw)
    } catch {
      // fall through to string
    }
  }
  return raw
}

const configGet = (path: string) => {
  const resolved = loadConfig()
  const value = getNestedValue({ obj: resolved as unknown as Record<string, unknown>, path })

  if (value === undefined) {
    console.error(`No config value at "${path}"`)
    process.exitCode = 1
    return
  }

  if (typeof value === 'object' && value !== null) {
    console.log(JSON.stringify(value, null, 2))
  } else {
    console.log(String(value))
  }
}

const configSet = ({ path, rawValue }: { readonly path: string; readonly rawValue: string }) => {
  const raw = readRawConfig()
  const value = parseValue(rawValue)
  const updated = setNestedValue({ obj: raw, path, value })

  // Validate before writing
  const result = yologuardConfigSchema.safeParse(updated)
  if (!result.success) {
    console.error('Invalid config value:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exitCode = 1
    return
  }

  writeRawConfig(updated)
  console.log(`Set ${path} = ${JSON.stringify(value)}`)
}

const configUnset = (path: string) => {
  const raw = readRawConfig()
  const updated = deleteNestedValue({ obj: raw, path })

  // Validate after removal
  const result = yologuardConfigSchema.safeParse(updated)
  if (!result.success) {
    console.error('Invalid config after unset:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exitCode = 1
    return
  }

  writeRawConfig(updated)
  console.log(`Removed ${path}`)
}

export const config = async (args: readonly string[]) => {
  const subcommand = args[0]

  switch (subcommand) {
    case 'get': {
      const path = args[1]
      if (!path) {
        console.error('Usage: yologuard config get <key>')
        process.exitCode = 1
        return
      }
      configGet(path)
      break
    }
    case 'set': {
      const path = args[1]
      const rawValue = args[2]
      if (!path || rawValue === undefined) {
        console.error('Usage: yologuard config set <key> <value>')
        process.exitCode = 1
        return
      }
      configSet({ path, rawValue })
      break
    }
    case 'unset': {
      const path = args[1]
      if (!path) {
        console.error('Usage: yologuard config unset <key>')
        process.exitCode = 1
        return
      }
      configUnset(path)
      break
    }
    default: {
      console.error('Usage: yologuard config <get|set|unset> <key> [value]')
      process.exitCode = 1
    }
  }
}
