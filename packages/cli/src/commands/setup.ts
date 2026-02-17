import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
	DEFAULT_CONFIG_DIR,
	DEFAULT_CONFIG_FILE,
	DEFAULT_GATEWAY_PORT,
	yologuardConfigSchema,
} from '@yologuard/shared'

const getConfigPath = (): string =>
	join(homedir(), DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE)

const readRawConfig = (): Record<string, unknown> => {
	const configPath = getConfigPath()
	if (!existsSync(configPath)) return {}
	return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
}

const writeRawConfig = (data: Record<string, unknown>): void => {
	const dir = join(homedir(), DEFAULT_CONFIG_DIR)
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
	const configPath = getConfigPath()
	writeFileSync(configPath, JSON.stringify(data, null, '\t') + '\n')
}

const NETWORK_POLICY_OPTIONS = ['none', 'node-web', 'python-ml', 'fullstack'] as const

export const setup = async () => {
	const rl = createInterface({ input: process.stdin, output: process.stdout })

	try {
		console.log('YoloGuard Setup')
		console.log('===============\n')

		const existing = readRawConfig()

		// Gateway port
		const currentPort = (existing.gateway as Record<string, unknown> | undefined)?.port
		const portStr = await rl.question(
			`Gateway port [${currentPort ?? DEFAULT_GATEWAY_PORT}]: `,
		)
		const port = portStr.trim() ? Number(portStr.trim()) : undefined

		// Default agent
		const currentAgent = (existing.sandbox as Record<string, unknown> | undefined)?.agent
		const agent = await rl.question(
			`Default agent [${currentAgent ?? 'claude'}]: `,
		)

		// Network policy
		console.log(`\nNetwork policy presets: ${NETWORK_POLICY_OPTIONS.join(', ')}`)
		const currentPolicy = (existing.sandbox as Record<string, unknown> | undefined)?.networkPolicy
		const policy = await rl.question(
			`Default network policy [${currentPolicy ?? 'none'}]: `,
		)

		// GitHub PAT
		const pat = await rl.question(
			'GitHub personal access token (optional, leave blank to skip): ',
		)

		// Build config
		const config: Record<string, unknown> = { ...existing }

		if (port !== undefined && !Number.isNaN(port)) {
			config.gateway = { ...(config.gateway as Record<string, unknown> ?? {}), port }
		}

		const sandboxUpdates: Record<string, unknown> = {}
		if (agent.trim()) sandboxUpdates.agent = agent.trim()
		if (policy.trim()) sandboxUpdates.networkPolicy = policy.trim()
		if (Object.keys(sandboxUpdates).length > 0) {
			config.sandbox = { ...(config.sandbox as Record<string, unknown> ?? {}), ...sandboxUpdates }
		}

		// Validate
		const result = yologuardConfigSchema.safeParse(config)
		if (!result.success) {
			console.error('\nInvalid configuration:')
			for (const issue of result.error.issues) {
				console.error(`  ${issue.path.join('.')}: ${issue.message}`)
			}
			process.exitCode = 1
			return
		}

		writeRawConfig(config)

		// Store GitHub PAT separately if provided
		if (pat.trim()) {
			const credDir = join(homedir(), DEFAULT_CONFIG_DIR, 'credentials')
			if (!existsSync(credDir)) mkdirSync(credDir, { recursive: true })
			writeFileSync(join(credDir, 'github-pat'), pat.trim(), { mode: 0o600 })
			console.log('\nGitHub PAT saved to ~/.yologuard/credentials/github-pat')
		}

		console.log(`\nConfiguration saved to ${getConfigPath()}`)
	} finally {
		rl.close()
	}
}
