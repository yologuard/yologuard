import { ensureGateway } from '../ensure-gateway.js'
import { revokeApproval } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

export const revoke = async (args: readonly string[]) => {
  const positional = args.filter((a) => !a.startsWith('-'))
  const approvalId = positional[1] ?? positional[0]
  const providedSandboxId = positional.length >= 2 ? positional[0] : undefined

  try {
    const sandboxId = await resolveSandboxId(providedSandboxId)
    if (!sandboxId) {
      process.exitCode = 1
      return
    }

    if (!approvalId) {
      console.error('Usage: yologuard revoke [sandbox-id] <approval-id>')
      process.exitCode = 1
      return
    }

    await ensureGateway()
    const result = await revokeApproval({ sandboxId, approvalId })
    console.log(result.message)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Failed to revoke approval: ${message}`)
    process.exitCode = 1
  }
}
