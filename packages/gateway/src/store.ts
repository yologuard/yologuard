import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SandboxState } from '@yologuard/shared'

export type SandboxRecord = {
	readonly id: string
	readonly repo: string
	readonly agent?: string
	readonly branch?: string
	readonly state: SandboxState
	readonly createdAt: string
	readonly containerId?: string
	readonly networkPolicy?: string
	readonly configPath?: string
	readonly remoteUser?: string
	readonly allowlist?: readonly string[]
}

type CreateSandboxParams = {
	readonly repo: string
	readonly agent?: string
	readonly branch?: string
	readonly networkPolicy?: string
}

export type SandboxStore = {
	readonly create: (params: CreateSandboxParams) => SandboxRecord
	readonly get: (id: string) => SandboxRecord | undefined
	readonly list: () => SandboxRecord[]
	readonly remove: (id: string) => boolean
	readonly update: (id: string, updates: Partial<SandboxRecord>) => SandboxRecord | undefined
}

const DEFAULT_STATE_DIR = join(homedir(), '.yologuard', 'state')
const STATE_FILENAME = 'sandboxes.json'

type CreateSandboxStoreParams = {
	readonly stateDir?: string
}

const loadState = ({ stateFile }: { readonly stateFile: string }): Map<string, SandboxRecord> => {
	try {
		const data = readFileSync(stateFile, 'utf-8')
		const records = JSON.parse(data) as SandboxRecord[]
		return new Map(records.map((r) => [r.id, r]))
	} catch {
		return new Map()
	}
}

const saveState = ({
	sandboxes,
	stateDir,
	stateFile,
}: {
	readonly sandboxes: Map<string, SandboxRecord>
	readonly stateDir: string
	readonly stateFile: string
}): void => {
	mkdirSync(stateDir, { recursive: true })
	const tmpFile = `${stateFile}.tmp`
	writeFileSync(tmpFile, JSON.stringify([...sandboxes.values()], null, '\t'))
	renameSync(tmpFile, stateFile)
}

export const createSandboxStore = ({
	stateDir = DEFAULT_STATE_DIR,
}: CreateSandboxStoreParams = {}): SandboxStore => {
	const stateFile = join(stateDir, STATE_FILENAME)
	const sandboxes = loadState({ stateFile })

	const persist = () => saveState({ sandboxes, stateDir, stateFile })

	const create = ({ repo, agent, branch, networkPolicy }: CreateSandboxParams): SandboxRecord => {
		const sandbox: SandboxRecord = {
			id: crypto.randomUUID(),
			repo,
			agent,
			branch,
			state: 'creating',
			createdAt: new Date().toISOString(),
			networkPolicy,
		}
		sandboxes.set(sandbox.id, sandbox)
		persist()
		return sandbox
	}

	const get = (id: string): SandboxRecord | undefined => sandboxes.get(id)

	const list = (): SandboxRecord[] => [...sandboxes.values()]

	const remove = (id: string): boolean => {
		const result = sandboxes.delete(id)
		if (result) persist()
		return result
	}

	const update = (id: string, updates: Partial<SandboxRecord>): SandboxRecord | undefined => {
		const existing = sandboxes.get(id)
		if (!existing) return undefined
		const updated = { ...existing, ...updates }
		sandboxes.set(id, updated)
		persist()
		return updated
	}

	return { create, get, list, remove, update } as const
}

// Default singleton for backward compatibility
export const sandboxStore = createSandboxStore()
