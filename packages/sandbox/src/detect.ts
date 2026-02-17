import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ResourceLimits } from '@yologuard/shared'
import type { AgentType } from './agent.js'

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

const AGENT_INSTALL_COMMANDS = {
	claude: 'npm install -g @anthropic-ai/claude-code',
	codex: 'npm install -g @openai/codex',
	opencode: 'npm install -g opencode',
} as const satisfies Record<AgentType, string>

export type DevcontainerConfig = {
	readonly name: string
	readonly build: { readonly dockerfile: string }
	readonly containerEnv: Record<string, string>
	readonly runArgs: readonly string[]
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

export type GeneratedDevcontainer = {
	readonly config: DevcontainerConfig
	readonly dockerfile: string
}

export const generateDevcontainerConfig = ({
	stack,
	sandboxId,
	agent = 'claude',
	resourceLimits,
}: {
	readonly workspacePath: string
	readonly stack: StackType
	readonly sandboxId: string
	readonly agent?: AgentType
	readonly resourceLimits?: ResourceLimits
}): GeneratedDevcontainer => {
	const image = STACK_IMAGES[stack]
	const installCmd = AGENT_INSTALL_COMMANDS[agent]

	const dockerfile = [
		`FROM ${image}`,
		'RUN apt-get update && apt-get install -y tmux locales && rm -rf /var/lib/apt/lists/* && sed -i "/en_US.UTF-8/s/^# //" /etc/locale.gen && locale-gen',
		'ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 TERM=xterm-256color',
		`RUN ${installCmd}`,
	].join('\n')

	const config: DevcontainerConfig = {
		name: `yologuard-${sandboxId}`,
		build: { dockerfile: 'Dockerfile' },
		containerEnv: {
			YOLOGUARD_SANDBOX_ID: sandboxId,
		},
		runArgs: [
			'--network', 'none',
			'--label', 'yologuard=true',
			'--label', `yologuard.sandbox-id=${sandboxId}`,
		],
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
	return { config, dockerfile }
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
	agent,
	resourceLimits,
}: {
	readonly workspacePath: string
	readonly sandboxId: string
	readonly agent?: AgentType
	readonly resourceLimits?: ResourceLimits
}): Promise<{ readonly config: DevcontainerConfig; readonly dockerfile: string; readonly existing: boolean }> => {
	const existing = await hasExistingDevcontainer({ workspacePath })
	const stack = await detectStack({ workspacePath })
	const { config, dockerfile } = generateDevcontainerConfig({
		workspacePath,
		stack,
		sandboxId,
		agent,
		resourceLimits,
	})
	return { config, dockerfile, existing }
}
