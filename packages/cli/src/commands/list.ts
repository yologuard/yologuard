import { listSandboxes } from '../gateway-client.js'

const PAD = {
	id: 38,
	state: 10,
	agent: 10,
	repo: 30,
} as const

const padRight = ({ text, width }: { readonly text: string; readonly width: number }): string =>
	text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length)

export const list = async () => {
	try {
		const sandboxes = await listSandboxes()

		if (sandboxes.length === 0) {
			console.log('No active sandboxes.')
			return
		}

		const header = [
			padRight({ text: 'ID', width: PAD.id }),
			padRight({ text: 'STATE', width: PAD.state }),
			padRight({ text: 'AGENT', width: PAD.agent }),
			padRight({ text: 'REPO', width: PAD.repo }),
		].join('')

		console.log(header)
		console.log('-'.repeat(header.length))

		for (const sandbox of sandboxes) {
			console.log([
				padRight({ text: sandbox.id, width: PAD.id }),
				padRight({ text: sandbox.state, width: PAD.state }),
				padRight({ text: sandbox.agent, width: PAD.agent }),
				padRight({ text: sandbox.repo, width: PAD.repo }),
			].join(''))
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		console.error(`Failed to list sandboxes: ${message}`)
		process.exitCode = 1
	}
}
