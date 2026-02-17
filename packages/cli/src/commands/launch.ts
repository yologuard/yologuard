import { createSandbox } from '../gateway-client.js'

type LaunchArgs = {
	readonly repo: string
	readonly agent?: string
}

export const parseLaunchArgs = (args: readonly string[]): LaunchArgs | undefined => {
	let agent: string | undefined
	let repo: string | undefined

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === '--agent' && i + 1 < args.length) {
			agent = args[i + 1]
			i++
		} else if (!arg.startsWith('-')) {
			repo = arg
		}
	}

	if (!repo) return undefined

	return { repo, agent }
}

export const launch = async (args: readonly string[]) => {
	const parsed = parseLaunchArgs(args)

	if (!parsed) {
		console.error('Usage: yologuard launch [--agent <name>] <path>')
		process.exitCode = 1
		return
	}

	try {
		const sandbox = await createSandbox({
			repo: parsed.repo,
			agent: parsed.agent,
		})

		console.log('Sandbox created:')
		console.log(`  ID:    ${sandbox.id}`)
		console.log(`  Repo:  ${sandbox.repo}`)
		console.log(`  Agent: ${sandbox.agent}`)
		console.log(`  State: ${sandbox.state}`)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to launch sandbox: ${message}`)
		process.exitCode = 1
	}
}
