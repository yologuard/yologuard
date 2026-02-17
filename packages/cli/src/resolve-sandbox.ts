import { createInterface } from 'node:readline'
import { ensureGateway } from './ensure-gateway.js'
import { listSandboxes } from './gateway-client.js'

type SandboxSummary = {
  readonly id: string
  readonly state: string
  readonly agent?: string
  readonly repo?: string
}

const pickSandbox = async (sandboxes: readonly SandboxSummary[]): Promise<string> => {
  const maxIdx = String(sandboxes.length).length

  for (let i = 0; i < sandboxes.length; i++) {
    const s = sandboxes[i]
    const num = String(i + 1).padStart(maxIdx, ' ')
    const short = s.id.slice(0, 8)
    const state = s.state.padEnd(8)
    const agent = (s.agent ?? '-').padEnd(8)
    const repo = s.repo ?? '-'
    process.stderr.write(`  ${num}) ${short}  ${state}  ${agent}  ${repo}\n`)
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const answer = await new Promise<string>((resolve) => {
    rl.question('\nSelect sandbox: ', resolve)
  })
  rl.close()

  const index = Number.parseInt(answer, 10) - 1
  if (index < 0 || index >= sandboxes.length) {
    throw new Error('Invalid selection')
  }
  return sandboxes[index].id
}

export const resolveSandboxId = async (provided?: string): Promise<string | undefined> => {
  if (provided) return provided

  await ensureGateway()
  const sandboxes = (await listSandboxes()) as SandboxSummary[]
  const active = sandboxes.filter((s) => s.state !== 'stopped')

  if (active.length === 0) {
    process.stderr.write('No active sandboxes.\n')
    return undefined
  }

  if (active.length === 1) {
    process.stderr.write(`Using sandbox ${active[0].id.slice(0, 8)}\n`)
    return active[0].id
  }

  return pickSandbox(active)
}
