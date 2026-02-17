const PRESETS = {
	none: [] as readonly string[],
	'node-web': [
		'registry.npmjs.org',
		'github.com',
		'api.github.com',
		'nodejs.org',
	],
	'python-ml': [
		'pypi.org',
		'files.pythonhosted.org',
		'huggingface.co',
		'github.com',
	],
	fullstack: [
		'registry.npmjs.org',
		'github.com',
		'api.github.com',
		'nodejs.org',
		'pypi.org',
		'files.pythonhosted.org',
		'cdn.jsdelivr.net',
		'cdnjs.cloudflare.com',
		'unpkg.com',
		'esm.sh',
	],
} as const satisfies Record<string, readonly string[]>

export type PolicyPreset = keyof typeof PRESETS

export const getPresetAllowlist = (preset: PolicyPreset): string[] => [
	...PRESETS[preset],
]

type MergePolicyParams = {
	readonly preset: PolicyPreset
	readonly additionalDomains?: readonly string[]
}

export const mergePolicy = ({
	preset,
	additionalDomains = [],
}: MergePolicyParams): string[] => [
	...new Set([...PRESETS[preset], ...additionalDomains]),
]
