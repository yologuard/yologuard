import { loadConfig } from '@yologuard/shared'
import { getHealth } from '../gateway-client.js'

const findPidOnPort = async ({ port }: { readonly port: number }): Promise<number | undefined> => {
	const { execFile } = await import('node:child_process')
	const { promisify } = await import('node:util')
	const execFileAsync = promisify(execFile)

	try {
		// -sTCP:LISTEN ensures we only find the listening process, not clients
		const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
		const pid = Number.parseInt(stdout.trim().split('\n')[0], 10)
		return Number.isNaN(pid) ? undefined : pid
	} catch {
		return undefined
	}
}

export const gatewayStart = async () => {
	const { start } = await import('./start.js')
	await start()
}

export const gatewayStop = async () => {
	const config = loadConfig()
	const port = config.gateway.port

	// Check if gateway is actually responding
	try {
		await getHealth()
	} catch {
		console.error(`Gateway is not running on port ${port}`)
		process.exitCode = 1
		return
	}

	const pid = await findPidOnPort({ port })
	if (!pid) {
		console.error(`Could not find process on port ${port}`)
		process.exitCode = 1
		return
	}

	try {
		process.kill(pid, 'SIGTERM')
		console.log(`Gateway stopped (pid ${pid})`)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to stop gateway: ${message}`)
		process.exitCode = 1
	}
}

export const gateway = async (args: readonly string[]) => {
	const subcommand = args.filter((a) => !a.startsWith('-'))[0]

	switch (subcommand) {
		case 'start':
			await gatewayStart()
			break
		case 'stop':
			await gatewayStop()
			break
		default:
			console.error('Usage: yologuard gateway <start|stop>')
			process.exitCode = 1
	}
}
