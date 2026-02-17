import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type PackageJson = { version: string }

const findRootPackageJson = (): PackageJson => {
	// Walk up from shared package to monorepo root
	try {
		return require('../../../package.json') as PackageJson
	} catch {
		return { version: '0.0.0-unknown' }
	}
}

export const YOLOGUARD_VERSION: string = findRootPackageJson().version
