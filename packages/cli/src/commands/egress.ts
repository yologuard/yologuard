import { ensureGateway } from '../ensure-gateway.js'
import { addEgressDomains, getEgress, removeEgressDomains, setEgress } from '../gateway-client.js'
import { resolveSandboxId } from '../resolve-sandbox.js'

const USAGE = `Usage: yologuard egress [sandbox-id]                          Show egress config
       yologuard egress add [sandbox-id] <domain> [domain...]  Add domains
       yologuard egress remove [sandbox-id] <domain> [...]     Remove domains
       yologuard egress set [sandbox-id] --preset <preset>     Switch preset
       yologuard egress set [sandbox-id] <domain> [domain...]  Replace allowlist`

const SUBCOMMANDS = new Set(['add', 'remove', 'set'])

const getFlagValue = ({
  args,
  flag,
}: {
  readonly args: readonly string[]
  readonly flag: string
}): string | undefined => {
  const idx = args.indexOf(flag)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

const printEgress = ({
  preset,
  allowlist,
}: {
  readonly preset: string
  readonly allowlist: readonly string[]
}) => {
  console.log(`Preset: ${preset}`)
  if (allowlist.length === 0) {
    console.log('Allowlist: (empty)')
  } else {
    console.log(`Allowlist (${allowlist.length}):`)
    for (const domain of allowlist) {
      console.log(`  ${domain}`)
    }
  }
}

const stripFlagValues = (args: readonly string[]): string[] => {
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-') && !args[i].includes('=') && i + 1 < args.length) {
      i++ // skip the flag's value
    } else if (!args[i].startsWith('-')) {
      result.push(args[i])
    }
  }
  return result
}

export const egress = async (args: readonly string[]) => {
  const positional = stripFlagValues(args)
  const subcommand = positional[0]

  // Detect whether first positional is a known subcommand or a sandbox ID
  const isSubcommand = subcommand && SUBCOMMANDS.has(subcommand)

  try {
    await ensureGateway()

    if (isSubcommand) {
      switch (subcommand) {
        case 'add': {
          const sandboxId = await resolveSandboxId(positional[1])
          if (!sandboxId) {
            process.exitCode = 1
            return
          }
          // Domains: everything after the sandbox ID position
          const idIndex = positional.indexOf(sandboxId, 1)
          const domains = positional.slice(idIndex >= 0 ? idIndex + 1 : 2)
          if (domains.length === 0) {
            console.error('Usage: yologuard egress add [sandbox-id] <domain> [domain...]')
            process.exitCode = 1
            return
          }
          const result = await addEgressDomains({ sandboxId, domains })
          printEgress(result)
          break
        }
        case 'remove': {
          const sandboxId = await resolveSandboxId(positional[1])
          if (!sandboxId) {
            process.exitCode = 1
            return
          }
          const idIndex = positional.indexOf(sandboxId, 1)
          const domains = positional.slice(idIndex >= 0 ? idIndex + 1 : 2)
          if (domains.length === 0) {
            console.error('Usage: yologuard egress remove [sandbox-id] <domain> [domain...]')
            process.exitCode = 1
            return
          }
          const result = await removeEgressDomains({ sandboxId, domains })
          printEgress(result)
          break
        }
        case 'set': {
          const sandboxId = await resolveSandboxId(positional[1])
          if (!sandboxId) {
            process.exitCode = 1
            return
          }
          const preset = getFlagValue({ args, flag: '--preset' })
          const idIndex = positional.indexOf(sandboxId, 1)
          if (preset) {
            const additionalDomains = positional.slice(idIndex >= 0 ? idIndex + 1 : 2)
            const result = await setEgress({
              sandboxId,
              preset,
              additionalDomains: additionalDomains.length > 0 ? additionalDomains : undefined,
            })
            printEgress(result)
          } else {
            const domains = positional.slice(idIndex >= 0 ? idIndex + 1 : 2)
            if (domains.length === 0) {
              console.error(
                'Usage: yologuard egress set [sandbox-id] --preset <preset> | <domain> [domain...]',
              )
              process.exitCode = 1
              return
            }
            const result = await setEgress({ sandboxId, allowlist: domains })
            printEgress(result)
          }
          break
        }
      }
    } else {
      // Show mode: first positional is sandbox ID (or none)
      const sandboxId = await resolveSandboxId(subcommand)
      if (!sandboxId) {
        process.exitCode = 1
        return
      }
      const result = await getEgress(sandboxId)
      printEgress(result)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Failed: ${message}`)
    process.exitCode = 1
  }
}
