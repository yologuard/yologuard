import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureGateway } from '../ensure-gateway.js'
import { getSandbox } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

const execFileAsync = promisify(execFile)

export const logs = async (sandboxId?: string) => {
  try {
    const resolved = await resolveSandboxId(sandboxId)
    if (!resolved) {
      process.exitCode = 1
      return
    }

    await ensureGateway()
    const sandbox = (await getSandbox(resolved)) as { containerId?: string } | null
    if (!sandbox) {
      console.error(`Sandbox ${resolved} not found`)
      process.exitCode = 1
      return
    }

    if (!sandbox.containerId) {
      console.error(`Sandbox ${resolved} has no container`)
      process.exitCode = 1
      return
    }

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
