import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getSandbox } from '../gateway-client.js'

const execFileAsync = promisify(execFile)

export const logs = async (sandboxId?: string) => {
	if (!sandboxId) {
		console.error('Usage: yologuard logs <sandbox-id>')
		process.exitCode = 1
		return
	}

	const sandbox = await getSandbox(sandboxId) as { containerId?: string } | null
	if (!sandbox) {
		console.error(`Sandbox ${sandboxId} not found`)
		process.exitCode = 1
		return
	}

	if (!sandbox.containerId) {
		console.error(`Sandbox ${sandboxId} has no container`)
		process.exitCode = 1
		return
	}

	try {
		const { stdout } = await execFileAsync('docker', [
			'logs',
			'--tail',
			'100',
			sandbox.containerId,
		])
		console.log(stdout)
	} catch (err) {
		console.error(`Failed to get logs: ${err instanceof Error ? err.message : 'Unknown error'}`)
		process.exitCode = 1
	}
}
