import type { SandboxState } from '@yologuard/shared'

type SandboxRecord = {
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
}

type CreateSandboxParams = {
	readonly repo: string
	readonly agent?: string
	readonly branch?: string
	readonly networkPolicy?: string
}

const sandboxes = new Map<string, SandboxRecord>()

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
	return sandbox
}

const get = (id: string): SandboxRecord | undefined => sandboxes.get(id)

const list = (): SandboxRecord[] => [...sandboxes.values()]

const remove = (id: string): boolean => sandboxes.delete(id)

const update = (id: string, updates: Partial<SandboxRecord>): SandboxRecord | undefined => {
	const existing = sandboxes.get(id)
	if (!existing) return undefined
	const updated = { ...existing, ...updates }
	sandboxes.set(id, updated)
	return updated
}

export const sandboxStore = { create, get, list, remove, update } as const
