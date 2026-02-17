#!/usr/bin/env node

import { YOLOGUARD_VERSION } from '@yologuard/shared'

const HELP_TEXT = `
yologuard v${YOLOGUARD_VERSION}

Usage: yologuard <command> [options]

Commands:
  start              Start the gateway server
  doctor             Validate environment (Docker, config, Node.js)
  launch [path]      Create a sandbox and launch an agent
  list               List active sandboxes
  attach <sandbox>   Attach to agent's tmux session
  logs <sandbox>     Show sandbox container logs
  stop <sandbox-id>  Stop and destroy a sandbox
  warm               Pre-fetch repos into local cache
  audit <sandbox>    Show audit log for a sandbox
  approvals <id>     List pending approvals for a sandbox
  approve <id> <req> Approve or deny a pending request
  revoke <id> <appr> Revoke a previously granted approval

Options:
  --version          Show version
  --help             Show this help message

Examples:
  yologuard start
  yologuard doctor
  yologuard launch --agent claude .
  yologuard list
  yologuard stop <sandbox-id>
`.trim()

const parseCommand = (args: readonly string[]): { command: string; rest: readonly string[] } => {
	const positional = args.filter((a) => !a.startsWith('-'))
	const command = positional[0] ?? ''
	const rest = args.slice(1)
	return { command, rest }
}

const hasFlag = ({ args, flag }: { readonly args: readonly string[]; readonly flag: string }): boolean =>
	args.includes(flag)

const main = async () => {
	const args = process.argv.slice(2)

	if (hasFlag({ args, flag: '--version' }) || hasFlag({ args, flag: '-v' })) {
		console.log(YOLOGUARD_VERSION)
		return
	}

	if (hasFlag({ args, flag: '--help' }) || hasFlag({ args, flag: '-h' }) || args.length === 0) {
		console.log(HELP_TEXT)
		return
	}

	const { command, rest } = parseCommand(args)

	switch (command) {
		case 'start': {
			const { start } = await import('./commands/start.js')
			await start()
			break
		}
		case 'doctor': {
			const { doctor } = await import('./commands/doctor.js')
			await doctor()
			break
		}
		case 'launch': {
			const { launch } = await import('./commands/launch.js')
			await launch(rest)
			break
		}
		case 'list':
		case 'ls': {
			const { list } = await import('./commands/list.js')
			await list()
			break
		}
		case 'attach': {
			const { attach } = await import('./commands/attach.js')
			await attach(rest[0])
			break
		}
		case 'logs': {
			const { logs } = await import('./commands/logs.js')
			await logs(rest[0])
			break
		}
		case 'stop':
		case 'destroy': {
			const { stop } = await import('./commands/stop.js')
			await stop(rest[0])
			break
		}
		case 'warm': {
			const { warm } = await import('./commands/warm.js')
			await warm()
			break
		}
		case 'audit': {
			const { audit } = await import('./commands/audit.js')
			await audit(rest)
			break
		}
		case 'approvals': {
			const { approvalsList } = await import('./commands/approvals-list.js')
			await approvalsList(rest)
			break
		}
		case 'approve': {
			const { approve } = await import('./commands/approve.js')
			await approve(rest)
			break
		}
		case 'revoke': {
			const { revoke } = await import('./commands/revoke.js')
			await revoke(rest)
			break
		}
		default: {
			console.error(`Unknown command: ${command}`)
			console.error('Run "yologuard --help" for usage.')
			process.exitCode = 1
		}
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : 'Unexpected error')
	process.exitCode = 1
})
