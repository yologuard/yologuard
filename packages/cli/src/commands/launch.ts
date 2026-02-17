import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createSandbox, getHealth } from '../gateway-client.js'
import { attach } from './attach.js'

type LaunchArgs = {
	readonly repo: string
	readonly agent?: string
	readonly detach: boolean
}

export const parseLaunchArgs = (args: readonly string[]): LaunchArgs | undefined => {
	let agent: string | undefined
	let repo: string | undefined
	let detach = false

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === '--agent' && i + 1 < args.length) {
			agent = args[i + 1]
			i++
		} else if (arg === '--detach' || arg === '-d') {
			detach = true
		} else if (!arg.startsWith('-')) {
			repo = arg
		}
	}

	if (!repo) return undefined

	return { repo, agent, detach }
}

const isGatewayRunning = async (): Promise<boolean> => {
	try {
		await getHealth()
		return true
	} catch {
		return false
	}
}

const startGateway = async (): Promise<void> => {
	process.stderr.write('Starting gateway...\n')
	const child = spawn(process.execPath, [process.argv[1], 'start'], {
		detached: true,
		stdio: 'ignore',
	})
	child.unref()

	// Wait for gateway to be ready
	const maxWait = 10_000
	const start = Date.now()
	while (Date.now() - start < maxWait) {
		await new Promise((r) => setTimeout(r, 500))
		if (await isGatewayRunning()) return
	}
	throw new Error('Gateway failed to start within 10s')
}

const ensureGateway = async (): Promise<void> => {
	if (await isGatewayRunning()) return
	await startGateway()
}

export const launch = async (args: readonly string[]) => {
	const parsed = parseLaunchArgs(args)

	if (!parsed) {
		console.error('Usage: yologuard launch [--agent <name>] [--detach] <path>')
		process.exitCode = 1
		return
	}

	try {
		await ensureGateway()

		const repo = resolve(parsed.repo)
		const sandbox = await createSandbox({
			repo,
			agent: parsed.agent,
		})

		console.log('Sandbox created:')
		console.log(`  ID:    ${sandbox.id}`)
		console.log(`  Repo:  ${sandbox.repo}`)
		if (sandbox.agent) console.log(`  Agent: ${sandbox.agent}`)
		console.log(`  State: ${sandbox.state}`)

		if (parsed.detach) {
			console.log(`\nTo attach: yologuard attach ${sandbox.id}`)
			return
		}

		console.log('\nAttaching to sandbox...')
		await attach(sandbox.id)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to launch sandbox: ${message}`)
		process.exitCode = 1
	}
}
