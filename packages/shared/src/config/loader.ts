import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import JSON5 from 'json5'
import { yologuardConfigSchema, type YologuardConfig } from './schema.js'
import { DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE } from '../constants.js'

type LoadConfigParams = {
	readonly globalPath?: string
	readonly workspacePath?: string
	readonly overrides?: Record<string, unknown>
}

const readJsonFile = (filePath: string): Record<string, unknown> | undefined => {
	if (!existsSync(filePath)) return undefined
	const raw = readFileSync(filePath, 'utf-8')
	return JSON5.parse(raw) as Record<string, unknown>
}

const getGlobalConfigPath = (): string =>
	join(homedir(), DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE)

const deepMerge = (
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> => {
	const result = { ...target }
	for (const key of Object.keys(source)) {
		const sourceVal = source[key]
		const targetVal = target[key]
		if (
			sourceVal !== null &&
			typeof sourceVal === 'object' &&
			!Array.isArray(sourceVal) &&
			targetVal !== null &&
			typeof targetVal === 'object' &&
			!Array.isArray(targetVal)
		) {
			result[key] = deepMerge(
				targetVal as Record<string, unknown>,
				sourceVal as Record<string, unknown>,
			)
		} else {
			result[key] = sourceVal
		}
	}
	return result
}

export const loadConfig = ({
	globalPath,
	workspacePath,
	overrides,
}: LoadConfigParams = {}): YologuardConfig => {
	const globalConfigPath = globalPath ?? getGlobalConfigPath()

	// Resolution order: defaults → global → workspace → overrides (CLI flags / env vars)
	let merged: Record<string, unknown> = {}

	const globalConfig = readJsonFile(globalConfigPath)
	if (globalConfig) {
		merged = deepMerge(merged, globalConfig)
	}

	if (workspacePath) {
		const workspaceConfig = readJsonFile(workspacePath)
		if (workspaceConfig) {
			merged = deepMerge(merged, workspaceConfig)
		}
	}

	if (overrides) {
		merged = deepMerge(merged, overrides)
	}

	return yologuardConfigSchema.parse(merged)
}

export const getConfigDir = (): string => join(homedir(), DEFAULT_CONFIG_DIR)
