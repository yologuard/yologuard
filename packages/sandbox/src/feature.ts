import { existsSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const findSecurityFeaturePath = (): string | undefined => {
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'features', 'security', 'devcontainer-feature.json')
    if (existsSync(candidate)) return join(dir, 'features', 'security')
    dir = resolve(dir, '..')
  }
  return undefined
}

export const copySecurityFeature = async ({
  targetDir,
}: {
  readonly targetDir: string
}): Promise<string> => {
  const featurePath = findSecurityFeaturePath()
  if (!featurePath) {
    throw new Error('Security feature not found — cannot locate features/security/')
  }
  const dest = join(targetDir, 'security')
  await cp(featurePath, dest, { recursive: true })
  return dest
}
