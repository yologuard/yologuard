import { ensureGateway } from '../ensure-gateway.js'
import { listApprovals } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

const PAD = {
  id: 38,
  type: 16,
  reason: 30,
  created: 24,
} as const

const padRight = ({ text, width }: { readonly text: string; readonly width: number }): string =>
  text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length)

export const approvalsList = async (args: readonly string[]) => {
  const provided = args.filter((a) => !a.startsWith('-'))[0]

  try {
    const sandboxId = await resolveSandboxId(provided)
    if (!sandboxId) {
      process.exitCode = 1
      return
    }

    await ensureGateway()
    const approvals = await listApprovals(sandboxId)

    if (approvals.length === 0) {
      console.log('No pending approvals.')
      return
    }

    const header = [
      padRight({ text: 'ID', width: PAD.id }),
      padRight({ text: 'TYPE', width: PAD.type }),
      padRight({ text: 'REASON', width: PAD.reason }),
      padRight({ text: 'CREATED', width: PAD.created }),
    ].join('')

    console.log(header)
    console.log('-'.repeat(header.length))

    for (const approval of approvals) {
      console.log(
        [
          padRight({ text: approval.id, width: PAD.id }),
          padRight({ text: approval.type, width: PAD.type }),
          padRight({ text: approval.reason ?? '-', width: PAD.reason }),
          padRight({ text: approval.createdAt, width: PAD.created }),
        ].join(''),
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Failed to list approvals: ${message}`)
    process.exitCode = 1
  }
}
