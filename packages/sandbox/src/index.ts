export {
	detectStack,
	generateDevcontainerConfig,
	hasExistingDevcontainer,
	resolveDevcontainerConfig,
	STACK_TYPES,
	type StackType,
	type DevcontainerConfig,
} from './detect.js'

export { createSandboxManager } from './manager.js'

export {
	launchAgent,
	isAgentRunning,
	getAttachCommand,
	stopAgent,
	SUPPORTED_AGENTS,
	type AgentType,
} from './agent.js'

export {
	startHealthMonitor,
	stopHealthMonitor,
	reportActivity,
	isMonitoring,
	stopAllMonitors,
} from './health.js'

export {
	ensureBareClone,
	createWorktree,
	removeWorktree,
	pruneWorktrees,
	warmCache,
	hashRepoUrl,
} from './worktree.js'

export {
	configureSparseCheckout,
	isSparseCheckout,
} from './sparse.js'

export {
	prepareRepos,
	cleanupRepos,
} from './repo-manager.js'
