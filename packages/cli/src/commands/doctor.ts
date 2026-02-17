import { execSync } from 'node:child_process'
import { loadConfig } from '@yologuard/shared'

type CheckResult = {
	readonly label: string
	readonly ok: boolean
	readonly detail?: string
}

const checkDocker = (): CheckResult => {
	try {
		const output = execSync('docker version --format "{{.Server.Version}}"', {
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'pipe'],
		}).toString().trim()
		return { label: 'Docker', ok: true, detail: `v${output}` }
	} catch {
		return { label: 'Docker', ok: false, detail: 'not found or not running' }
	}
}

const checkNodeVersion = (): CheckResult => {
	const major = parseInt(process.versions.node.split('.')[0], 10)
	const ok = major >= 22
	return {
		label: 'Node.js',
		ok,
		detail: ok ? `v${process.versions.node}` : `v${process.versions.node} (requires >=22)`,
	}
}

const checkConfig = (): CheckResult => {
	try {
		loadConfig()
		return { label: 'Config', ok: true, detail: 'valid' }
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error'
		return { label: 'Config', ok: false, detail: message }
	}
}

const formatResult = (result: CheckResult): string => {
	const icon = result.ok ? '\u2714' : '\u2718'
	const detail = result.detail ? ` (${result.detail})` : ''
	return `  ${icon} ${result.label}${detail}`
}

export const doctor = async () => {
	console.log('YoloGuard Doctor\n')

	const results = [
		checkNodeVersion(),
		checkDocker(),
		checkConfig(),
	]

	for (const result of results) {
		console.log(formatResult(result))
	}

	const allOk = results.every((r) => r.ok)
	console.log(allOk ? '\nAll checks passed.' : '\nSome checks failed.')

	process.exitCode = allOk ? 0 : 1
}
