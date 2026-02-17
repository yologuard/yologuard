import { resolve } from 'node:path'
import { createSandbox } from '../gateway-client.js'
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

export const launch = async (args: readonly string[]) => {
	const parsed = parseLaunchArgs(args)

	if (!parsed) {
		console.error('Usage: yologuard launch [--agent <name>] [--detach] <path>')
		process.exitCode = 1
		return
	}

	try {
		const repo = resolve(parsed.repo)
		const sandbox = await createSandbox({
			repo,
			agent: parsed.agent,
		})

		console.log('Sandbox created:')
		console.log(`  ID:    ${sandbox.id}`)
		console.log(`  Repo:  ${sandbox.repo}`)
		console.log(`  Agent: ${sandbox.agent}`)
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
