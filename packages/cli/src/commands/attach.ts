import { getAttachCommand } from '@yologuard/sandbox'
import { getSandbox } from '../gateway-client.js'

export const attach = async (sandboxId?: string) => {
	if (!sandboxId) {
		console.error('Usage: yologuard attach <sandbox-id>')
		process.exitCode = 1
		return
	}

	const sandbox = await getSandbox(sandboxId) as { repo: string } | null
	if (!sandbox) {
		console.error(`Sandbox ${sandboxId} not found`)
		process.exitCode = 1
		return
	}

	const command = getAttachCommand({ workspacePath: sandbox.repo })
	console.log(`Run this command to attach to the agent session:\n\n  ${command}\n`)
}
