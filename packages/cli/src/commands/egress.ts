import { addEgressDomains, getEgress, removeEgressDomains, setEgress } from '../gateway-client.js'

const USAGE = `Usage: yologuard egress <sandbox-id>                           Show egress config
       yologuard egress add <sandbox-id> <domain> [domain...]  Add domains
       yologuard egress remove <sandbox-id> <domain> [...]     Remove domains
       yologuard egress set <sandbox-id> --preset <preset>     Switch preset
       yologuard egress set <sandbox-id> <domain> [domain...]  Replace allowlist`

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

	if (!subcommand) {
		console.error(USAGE)
		process.exitCode = 1
		return
	}

	try {
		switch (subcommand) {
			case 'add': {
				const sandboxId = positional[1]
				const domains = positional.slice(2)
				if (!sandboxId || domains.length === 0) {
					console.error('Usage: yologuard egress add <sandbox-id> <domain> [domain...]')
					process.exitCode = 1
					return
				}
				const result = await addEgressDomains({ sandboxId, domains })
				printEgress(result)
				break
			}
			case 'remove': {
				const sandboxId = positional[1]
				const domains = positional.slice(2)
				if (!sandboxId || domains.length === 0) {
					console.error('Usage: yologuard egress remove <sandbox-id> <domain> [domain...]')
					process.exitCode = 1
					return
				}
				const result = await removeEgressDomains({ sandboxId, domains })
				printEgress(result)
				break
			}
			case 'set': {
				const sandboxId = positional[1]
				if (!sandboxId) {
					console.error(
						'Usage: yologuard egress set <sandbox-id> --preset <preset> | <domain> [domain...]',
					)
					process.exitCode = 1
					return
				}
				const preset = getFlagValue({ args, flag: '--preset' })
				if (preset) {
					const additionalDomains = positional.slice(2)
					const result = await setEgress({
						sandboxId,
						preset,
						additionalDomains: additionalDomains.length > 0 ? additionalDomains : undefined,
					})
					printEgress(result)
				} else {
					const domains = positional.slice(2)
					if (domains.length === 0) {
						console.error(
							'Usage: yologuard egress set <sandbox-id> --preset <preset> | <domain> [domain...]',
						)
						process.exitCode = 1
						return
					}
					const result = await setEgress({ sandboxId, allowlist: domains })
					printEgress(result)
				}
				break
			}
			default: {
				// Default: treat first positional as sandboxId for "show"
				const result = await getEgress(subcommand)
				printEgress(result)
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed: ${message}`)
		process.exitCode = 1
	}
}
