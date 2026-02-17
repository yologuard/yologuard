import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ResourceLimits } from '@yologuard/shared'

export const STACK_TYPES = ['node', 'python', 'go', 'rust', 'unknown'] as const
export type StackType = (typeof STACK_TYPES)[number]

const STACK_MARKERS = [
	{ file: 'package.json', stack: 'node' },
	{ file: 'pyproject.toml', stack: 'python' },
	{ file: 'requirements.txt', stack: 'python' },
	{ file: 'go.mod', stack: 'go' },
	{ file: 'Cargo.toml', stack: 'rust' },
] as const satisfies readonly { file: string; stack: StackType }[]

const STACK_IMAGES = {
	node: 'mcr.microsoft.com/devcontainers/javascript-node:22',
	python: 'mcr.microsoft.com/devcontainers/python:3.12',
	go: 'mcr.microsoft.com/devcontainers/go:1.22',
	rust: 'mcr.microsoft.com/devcontainers/rust:1',
	unknown: 'mcr.microsoft.com/devcontainers/base:debian',
} as const satisfies Record<StackType, string>

const STACK_USERS = {
	node: 'node',
	python: 'vscode',
	go: 'vscode',
	rust: 'vscode',
	unknown: 'vscode',
} as const satisfies Record<StackType, string>

const fileExists = async (path: string): Promise<boolean> => {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

export const detectStack = async ({
	workspacePath,
}: {
	readonly workspacePath: string
}): Promise<StackType> => {
	for (const { file, stack } of STACK_MARKERS) {
		if (await fileExists(join(workspacePath, file))) {
			return stack
		}
	}
	return 'unknown'
}

export type DevcontainerConfig = {
	readonly name: string
	readonly image: string
	readonly containerEnv: Record<string, string>
	readonly remoteUser: string
	readonly customizations: {
		readonly yologuard: {
			readonly sandboxId: string
			readonly managed: true
		}
	}
	readonly hostRequirements?: {
		readonly cpus?: number
		readonly memory?: string
		readonly storage?: string
	}
}

export const generateDevcontainerConfig = ({
	stack,
	sandboxId,
	resourceLimits,
}: {
	readonly workspacePath: string
	readonly stack: StackType
	readonly sandboxId: string
	readonly resourceLimits?: ResourceLimits
}): DevcontainerConfig => {
	const config: DevcontainerConfig = {
		name: `yologuard-${sandboxId}`,
		image: STACK_IMAGES[stack],
		containerEnv: {
			YOLOGUARD_SANDBOX_ID: sandboxId,
		},
		remoteUser: STACK_USERS[stack],
		customizations: {
			yologuard: {
				sandboxId,
				managed: true,
			},
		},
		...(resourceLimits && {
			hostRequirements: {
				...(resourceLimits.cpus && { cpus: resourceLimits.cpus }),
				...(resourceLimits.memoryMb && {
					memory: `${resourceLimits.memoryMb}mb`,
				}),
				...(resourceLimits.diskMb && {
					storage: `${resourceLimits.diskMb}mb`,
				}),
			},
		}),
	}
	return config
}

export const hasExistingDevcontainer = async ({
	workspacePath,
}: {
	readonly workspacePath: string
}): Promise<boolean> => {
	const devcontainerDir = join(workspacePath, '.devcontainer')
	try {
		const entries = await readdir(devcontainerDir)
		return entries.includes('devcontainer.json')
	} catch {
		return false
	}
}

export const resolveDevcontainerConfig = async ({
	workspacePath,
	sandboxId,
	resourceLimits,
}: {
	readonly workspacePath: string
	readonly sandboxId: string
	readonly resourceLimits?: ResourceLimits
}): Promise<{ readonly config: DevcontainerConfig; readonly existing: boolean }> => {
	const existing = await hasExistingDevcontainer({ workspacePath })
	if (existing) {
		// When an existing devcontainer.json is found, we still generate
		// our config but mark it so the caller knows to merge/override
		const stack = await detectStack({ workspacePath })
		return {
			config: generateDevcontainerConfig({
				workspacePath,
				stack,
				sandboxId,
				resourceLimits,
			}),
			existing: true,
		}
	}

	const stack = await detectStack({ workspacePath })
	return {
		config: generateDevcontainerConfig({
			workspacePath,
			stack,
			sandboxId,
			resourceLimits,
		}),
		existing: false,
	}
}
