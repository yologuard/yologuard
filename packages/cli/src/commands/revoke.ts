import { revokeApproval } from '../gateway-client.js'

export const revoke = async (args: readonly string[]) => {
	const positional = args.filter((a) => !a.startsWith('-'))
	const sandboxId = positional[0]
	const approvalId = positional[1]

	if (!sandboxId || !approvalId) {
		console.error('Usage: yologuard revoke <sandbox-id> <approval-id>')
		process.exitCode = 1
		return
	}

	try {
		const result = await revokeApproval({ sandboxId, approvalId })
		console.log(result.message)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to revoke approval: ${message}`)
		process.exitCode = 1
	}
}
