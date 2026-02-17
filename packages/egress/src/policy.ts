// GitHub — git clone, API, raw content, LFS
const GITHUB_DOMAINS = [
	'github.com',
	'api.github.com',
	'.githubusercontent.com',
	'codeload.github.com',
	'github-cloud.s3.amazonaws.com',
] as const

// npm + Yarn registries
const NODE_DOMAINS = [
	'registry.npmjs.org',
	'registry.yarnpkg.com',
	'nodejs.org',
] as const

// Frontend CDNs
const CDN_DOMAINS = [
	'cdn.jsdelivr.net',
	'cdnjs.cloudflare.com',
	'unpkg.com',
	'esm.sh',
] as const

// PyPI — pip install
const PYTHON_DOMAINS = [
	'pypi.org',
	'files.pythonhosted.org',
	'python.org',
] as const

// Conda — conda install
const CONDA_DOMAINS = [
	'conda.anaconda.org',
	'repo.anaconda.com',
] as const

// Hugging Face — model downloads (.hf.co covers cdn-lfs regional endpoints)
const HUGGINGFACE_DOMAINS = [
	'huggingface.co',
	'.hf.co',
] as const

// Go modules — go get
const GO_DOMAINS = [
	'proxy.golang.org',
	'sum.golang.org',
	'storage.googleapis.com',
] as const

// Rust — cargo install
const RUST_DOMAINS = [
	'crates.io',
	'index.crates.io',
	'static.crates.io',
	'static.rust-lang.org',
] as const

// Ruby — gem install
const RUBY_DOMAINS = [
	'rubygems.org',
	'api.rubygems.org',
] as const

// Docker Hub — container pulls
const DOCKER_DOMAINS = [
	'registry-1.docker.io',
	'auth.docker.io',
	'production.cloudflare.docker.com',
] as const

// AI model provider APIs — agents need these to function
const MODEL_PROVIDER_DOMAINS = [
	'api.anthropic.com',
	'platform.claude.com',
	'claude.ai',
	'api.openai.com',
	'generativelanguage.googleapis.com',
	'openrouter.ai',
] as const

const PRESETS = {
	none: [] as readonly string[],
	'node-web': [
		...GITHUB_DOMAINS,
		...NODE_DOMAINS,
		...CDN_DOMAINS,
		...MODEL_PROVIDER_DOMAINS,
	],
	'python-ml': [
		...GITHUB_DOMAINS,
		...PYTHON_DOMAINS,
		...CONDA_DOMAINS,
		...HUGGINGFACE_DOMAINS,
		...MODEL_PROVIDER_DOMAINS,
	],
	fullstack: [
		...GITHUB_DOMAINS,
		...NODE_DOMAINS,
		...CDN_DOMAINS,
		...PYTHON_DOMAINS,
		...CONDA_DOMAINS,
		...HUGGINGFACE_DOMAINS,
		...GO_DOMAINS,
		...RUST_DOMAINS,
		...RUBY_DOMAINS,
		...DOCKER_DOMAINS,
		...MODEL_PROVIDER_DOMAINS,
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
