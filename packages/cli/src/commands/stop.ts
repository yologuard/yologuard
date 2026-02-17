import { deleteSandbox } from '../gateway-client.js'

export const stop = async (sandboxId: string | undefined) => {
	if (!sandboxId) {
		console.error('Usage: yologuard stop <sandbox-id>')
		process.exitCode = 1
		return
	}

	try {
		const result = await deleteSandbox(sandboxId)
		console.log(result.message)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to stop sandbox: ${message}`)
		process.exitCode = 1
	}
}
