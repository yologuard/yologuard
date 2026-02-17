export {
  detectStack,
  generateDevcontainerConfig,
  hasExistingDevcontainer,
  resolveDevcontainerConfig,
  STACK_TYPES,
  type StackType,
  type DevcontainerConfig,
} from './detect.js'

export {
  createSandboxManager,
  DEVCONTAINER_JS,
  devcontainerCommand,
} from './manager.js'

export {
  launchAgent,
  isAgentRunning,
  getAttachCommand,
  getShellCommand,
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
  findSecurityFeaturePath,
  copySecurityFeature,
} from './feature.js'

export {
  prepareRepos,
  cleanupRepos,
} from './repo-manager.js'
