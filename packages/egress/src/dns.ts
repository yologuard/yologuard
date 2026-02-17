type GenerateDnsmasqConfigParams = {
	readonly allowlist: readonly string[]
}

export const generateDnsmasqConfig = ({
	allowlist,
}: GenerateDnsmasqConfigParams): string => {
	const lines: string[] = []

	for (const domain of allowlist) {
		lines.push(`server=/${domain}/8.8.8.8`)
	}

	// Default: return NXDOMAIN for all other queries
	lines.push('address=/#/')
	lines.push('')

	return lines.join('\n')
}
