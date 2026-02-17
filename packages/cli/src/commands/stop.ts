import { ensureGateway } from '../ensure-gateway.js'
import { deleteSandbox } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

export const stop = async (sandboxId?: string) => {
  try {
    const resolved = await resolveSandboxId(sandboxId)
    if (!resolved) {
      process.exitCode = 1
      return
    }

    await ensureGateway()
    const result = await deleteSandbox(resolved)
    console.log(result.message)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Failed to stop sandbox: ${message}`)
    process.exitCode = 1
  }
}
