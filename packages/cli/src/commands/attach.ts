import { execSync } from 'node:child_process'
import { getAttachCommand, getShellCommand } from '@yologuard/sandbox'
import { getSandbox } from '../gateway-client.js'

type SandboxInfo = {
	readonly repo: string
	readonly agent?: string
	readonly state: string
	readonly configPath?: string
	readonly containerId?: string
	readonly remoteUser?: string
}

const POLL_INTERVAL_MS = 2_000
const MAX_WAIT_MS = 300_000

const waitForReady = async (sandboxId: string): Promise<SandboxInfo> => {
	const start = Date.now()
	while (Date.now() - start < MAX_WAIT_MS) {
		const sandbox = await getSandbox(sandboxId) as SandboxInfo | null
		if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`)
		if (sandbox.state !== 'creating') return sandbox
		process.stderr.write(`Waiting for sandbox to be ready (${sandbox.state})...\n`)
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
	}
	throw new Error('Timed out waiting for sandbox to be ready')
}

export const attach = async (sandboxId?: string) => {
	if (!sandboxId) {
		console.error('Usage: yologuard attach <sandbox-id>')
		process.exitCode = 1
		return
	}

	try {
		let sandbox = await getSandbox(sandboxId) as SandboxInfo | null
		if (!sandbox) {
			console.error(`Sandbox ${sandboxId} not found`)
			process.exitCode = 1
			return
		}

		if (sandbox.state === 'creating') {
			sandbox = await waitForReady(sandboxId)
		}

		if (sandbox.state === 'stopped') {
			console.error('Sandbox is stopped')
			process.exitCode = 1
			return
		}

		const connectParams = {
			workspacePath: sandbox.repo,
			configPath: sandbox.configPath,
			containerId: sandbox.containerId,
			remoteUser: sandbox.remoteUser,
		}

		// No agent — drop into shell directly
		if (!sandbox.agent) {
			execSync(getShellCommand(connectParams), { stdio: 'inherit' })
			return
		}

		// Agent mode — retry attach to tmux (session may still be starting)
		const command = getAttachCommand(connectParams)
		const maxRetries = 3
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				execSync(command, { stdio: 'inherit' })
				return
			} catch {
				if (attempt === maxRetries) {
					process.stderr.write('Agent session not available, dropping to shell...\n')
					execSync(getShellCommand(connectParams), { stdio: 'inherit' })
					return
				}
				process.stderr.write(`Waiting for agent session (attempt ${attempt}/${maxRetries})...\n`)
				await new Promise((r) => setTimeout(r, 3_000))
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to attach: ${message}`)
		process.exitCode = 1
	}
}
