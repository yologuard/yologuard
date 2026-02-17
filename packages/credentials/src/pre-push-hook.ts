import { PROTECTED_BRANCHES } from '@yologuard/shared'

type PrePushCheckParams = {
	readonly localRef: string
	readonly remoteRef: string
	readonly remote: string
}

type PrePushResult = {
	readonly allowed: boolean
	readonly reason?: string
}

export const checkPrePush = ({
	localRef,
	remoteRef,
	remote,
}: PrePushCheckParams): PrePushResult => {
	// Extract branch name from refs
	const remoteBranch = remoteRef.replace(/^refs\/heads\//, '')
	const localBranch = localRef.replace(/^refs\/heads\//, '')

	// Block pushes to protected branches
	if ((PROTECTED_BRANCHES as readonly string[]).includes(remoteBranch)) {
		return {
			allowed: false,
			reason: `Push to protected branch '${remoteBranch}' is blocked. Use 'yologuard-request git.push' to request permission.`,
		}
	}

	// Block force pushes (detected by + prefix in refspec)
	if (localRef.startsWith('+')) {
		return {
			allowed: false,
			reason: 'Force push is blocked inside the sandbox.',
		}
	}

	// Block refspec tricks (pushing to a different branch name)
	if (localBranch && remoteBranch && localBranch !== remoteBranch) {
		// Allow if remote branch starts with yologuard/
		if (!remoteBranch.startsWith('yologuard/')) {
			return {
				allowed: false,
				reason: `Pushing ${localBranch} to ${remoteBranch} is not allowed. Push to a yologuard/* branch instead.`,
			}
		}
	}

	return { allowed: true }
}

export const generatePrePushScript = (): string => `#!/usr/bin/env bash
# YoloGuard pre-push hook — defense-in-depth
# This hook is installed automatically by the YoloGuard security feature.
# All pushes must go through the gateway approval system.

remote="$1"
url="$2"

while read local_ref local_sha remote_ref remote_sha; do
    # Check against protected branches
    remote_branch="\${remote_ref#refs/heads/}"
    case "$remote_branch" in
        main|master|production)
            echo "yologuard: push to protected branch '$remote_branch' is blocked." >&2
            echo "yologuard: use 'yologuard-request git.push' to request permission." >&2
            exit 1
            ;;
    esac
done

exit 0
`
