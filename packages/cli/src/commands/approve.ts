import { ensureGateway } from '../ensure-gateway.js'
import { approveRequest } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

const parseFlag = ({
  args,
  flag,
}: {
  readonly args: readonly string[]
  readonly flag: string
}): string | undefined => {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

const hasFlag = ({
  args,
  flag,
}: {
  readonly args: readonly string[]
  readonly flag: string
}): boolean => args.includes(flag)

export const approve = async (args: readonly string[]) => {
  const positional = args.filter((a) => !a.startsWith('-'))
  const requestId = positional[1] ?? positional[0]
  const providedSandboxId = positional.length >= 2 ? positional[0] : undefined

  try {
    const sandboxId = await resolveSandboxId(providedSandboxId)
    if (!sandboxId) {
      process.exitCode = 1
      return
    }

    if (!requestId) {
      console.error(
        'Usage: yologuard approve [sandbox-id] <request-id> [--scope once|session|ttl] [--ttl <ms>] [--deny] [--reason <text>]',
      )
      process.exitCode = 1
      return
    }

    const scope = parseFlag({ args, flag: '--scope' }) ?? 'once'
    const ttlStr = parseFlag({ args, flag: '--ttl' })
    const ttlMs = ttlStr ? Number(ttlStr) : undefined
    const deny = hasFlag({ args, flag: '--deny' })
    const reason = parseFlag({ args, flag: '--reason' })

    await ensureGateway()
    const decision = await approveRequest({
      sandboxId,
      requestId,
      approved: !deny,
      scope,
      ttlMs,
      reason,
    })

    const verb = decision.approved ? 'Approved' : 'Denied'
    console.log(`${verb} request ${decision.requestId} (scope: ${decision.scope})`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Failed to approve request: ${message}`)
    process.exitCode = 1
  }
}
