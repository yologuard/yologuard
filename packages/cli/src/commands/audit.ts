import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG_DIR, DEFAULT_AUDIT_DIR } from '@yologuard/shared'
import type { AuditEntryType } from '@yologuard/shared'
import { createAuditStore } from '@yologuard/audit'

const getAuditDir = () => join(homedir(), DEFAULT_CONFIG_DIR, DEFAULT_AUDIT_DIR)

const getFlagValue = ({ args, flag }: {
	readonly args: readonly string[]
	readonly flag: string
}): string | undefined => {
	const eqFlag = args.find((a) => a.startsWith(`${flag}=`))
	if (eqFlag) return eqFlag.split('=')[1]
	const idx = args.indexOf(flag)
	if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
	return undefined
}

const formatEntry = (entry: { readonly timestamp: string; readonly type: string; readonly data: Record<string, unknown> }) => {
	const ts = entry.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z')
	const summary = Object.entries(entry.data)
		.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
		.join(' ')
	return `[${ts}] ${entry.type} — ${summary}`
}

export const audit = async (args: readonly string[]) => {
	const sandboxId = args.find((a) => !a.startsWith('-'))
	const jsonOutput = args.includes('--json')
	const typeFilter = getFlagValue({ args, flag: '--type' }) as AuditEntryType | undefined

	if (!sandboxId) {
		console.error('Usage: yologuard audit <sandbox-id> [--json] [--type <type>]')
		console.error('\nEntry types: approval_decision, git_operation, network_request, command, sandbox_lifecycle')
		process.exitCode = 1
		return
	}

	const auditDir = getAuditDir()
	const dbPath = join(auditDir, `${sandboxId}.db`)

	if (!existsSync(dbPath)) {
		console.error(`No audit log found for sandbox: ${sandboxId}`)
		process.exitCode = 1
		return
	}

	const store = createAuditStore({ sandboxId, auditDir })

	try {
		const entries = store.queryEntries(typeFilter ? { type: typeFilter } : {})

		if (entries.length === 0) {
			console.log('No audit entries found.')
			return
		}

		if (jsonOutput) {
			console.log(JSON.stringify(entries, null, 2))
		} else {
			for (const entry of entries) {
				console.log(formatEntry(entry))
			}
		}
	} finally {
		store.close()
	}
}
