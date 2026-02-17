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
  stop <sandbox-id>  Stop and destroy a sandbox

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
		case 'stop':
		case 'destroy': {
			const { stop } = await import('./commands/stop.js')
			await stop(rest[0])
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
