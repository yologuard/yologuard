type ParsedRemote = {
	readonly owner: string
	readonly repo: string
}

const GITHUB_URL_REGEX =
	/(?:https?:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?/

const GITHUB_SHORT_REGEX = /^([^/]+)\/([^/.]+)$/

export const parseGitRemote = (remote: string): ParsedRemote | undefined => {
	const urlMatch = remote.match(GITHUB_URL_REGEX)
	if (urlMatch) {
		return { owner: urlMatch[1], repo: urlMatch[2] }
	}

	const shortMatch = remote.match(GITHUB_SHORT_REGEX)
	if (shortMatch) {
		return { owner: shortMatch[1], repo: shortMatch[2] }
	}

	return undefined
}
