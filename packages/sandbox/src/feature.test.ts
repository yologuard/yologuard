import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findSecurityFeaturePath, copySecurityFeature } from './feature.js'

describe('findSecurityFeaturePath', () => {
  it('should find the security feature directory', () => {
    const result = findSecurityFeaturePath()

    expect(result).toBeDefined()
    expect(result).toContain('features/security')
  })
})

describe('copySecurityFeature', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'yologuard-feature-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should copy feature files to target directory', async () => {
    const dest = await copySecurityFeature({ targetDir: tempDir })

    expect(dest).toBe(join(tempDir, 'security'))
    const files = await readdir(dest)
    expect(files).toContain('install.sh')
    expect(files).toContain('devcontainer-feature.json')
  })
})
