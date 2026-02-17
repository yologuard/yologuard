import { getPresetAllowlist, mergePolicy } from './policy.js'
import { KNOWN_EXFILTRATION_DOMAINS } from '@yologuard/shared'

describe('getPresetAllowlist', () => {
  it('should return empty array for none preset', () => {
    const result = getPresetAllowlist('none')

    expect(result).toEqual([])
  })

  it('should include GitHub domains in node-web preset', () => {
    const result = getPresetAllowlist('node-web')

    expect(result).toContain('github.com')
    expect(result).toContain('api.github.com')
    expect(result).toContain('.githubusercontent.com')
    expect(result).toContain('codeload.github.com')
  })

  it('should include npm registry and Node.js domains in node-web preset', () => {
    const result = getPresetAllowlist('node-web')

    expect(result).toContain('registry.npmjs.org')
    expect(result).toContain('registry.yarnpkg.com')
    expect(result).toContain('nodejs.org')
  })

  it('should include CDN domains in node-web preset', () => {
    const result = getPresetAllowlist('node-web')

    expect(result).toContain('cdn.jsdelivr.net')
    expect(result).toContain('cdnjs.cloudflare.com')
    expect(result).toContain('unpkg.com')
    expect(result).toContain('esm.sh')
  })

  it('should include model provider domains in all non-none presets', () => {
    const presets = ['node-web', 'python-ml', 'fullstack'] as const
    for (const preset of presets) {
      const result = getPresetAllowlist(preset)
      expect(result).toContain('api.anthropic.com')
      expect(result).toContain('platform.claude.com')
      expect(result).toContain('claude.ai')
      expect(result).toContain('api.openai.com')
      expect(result).toContain('generativelanguage.googleapis.com')
      expect(result).toContain('openrouter.ai')
    }
  })

  it('should include PyPI and conda domains in python-ml preset', () => {
    const result = getPresetAllowlist('python-ml')

    expect(result).toContain('pypi.org')
    expect(result).toContain('files.pythonhosted.org')
    expect(result).toContain('python.org')
    expect(result).toContain('conda.anaconda.org')
    expect(result).toContain('repo.anaconda.com')
  })

  it('should include Hugging Face domains in python-ml preset', () => {
    const result = getPresetAllowlist('python-ml')

    expect(result).toContain('huggingface.co')
    expect(result).toContain('.hf.co')
  })

  it('should include GitHub domains in python-ml preset', () => {
    const result = getPresetAllowlist('python-ml')

    expect(result).toContain('github.com')
    expect(result).toContain('api.github.com')
  })

  it('should include all node-web and python-ml domains in fullstack preset', () => {
    const fullstack = getPresetAllowlist('fullstack')
    const nodeWeb = getPresetAllowlist('node-web')
    const pythonMl = getPresetAllowlist('python-ml')

    for (const domain of nodeWeb) {
      expect(fullstack).toContain(domain)
    }
    for (const domain of pythonMl) {
      expect(fullstack).toContain(domain)
    }
  })

  it('should include Go, Rust, Ruby, and Docker domains in fullstack preset', () => {
    const result = getPresetAllowlist('fullstack')

    // Go
    expect(result).toContain('proxy.golang.org')
    expect(result).toContain('sum.golang.org')
    expect(result).toContain('storage.googleapis.com')
    // Rust
    expect(result).toContain('crates.io')
    expect(result).toContain('index.crates.io')
    expect(result).toContain('static.crates.io')
    // Ruby
    expect(result).toContain('rubygems.org')
    expect(result).toContain('api.rubygems.org')
    // Docker
    expect(result).toContain('registry-1.docker.io')
    expect(result).toContain('auth.docker.io')
  })

  it('should not include any exfiltration domain in any preset', () => {
    const presets = ['node-web', 'python-ml', 'fullstack'] as const
    for (const preset of presets) {
      const allowlist = getPresetAllowlist(preset)
      for (const blocked of KNOWN_EXFILTRATION_DOMAINS) {
        expect(allowlist).not.toContain(blocked)
      }
    }
  })

  it('should return a new array each time (not a reference)', () => {
    const a = getPresetAllowlist('node-web')
    const b = getPresetAllowlist('node-web')

    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('mergePolicy', () => {
  it('should return preset domains when no additional domains given', () => {
    const result = mergePolicy({ preset: 'node-web' })

    expect(result).toEqual(getPresetAllowlist('node-web'))
  })

  it('should merge additional domains with preset', () => {
    const result = mergePolicy({
      preset: 'node-web',
      additionalDomains: ['custom.example.com'],
    })

    expect(result).toContain('registry.npmjs.org')
    expect(result).toContain('custom.example.com')
  })

  it('should deduplicate overlapping domains', () => {
    const result = mergePolicy({
      preset: 'node-web',
      additionalDomains: ['github.com', 'new-domain.com'],
    })

    const githubCount = result.filter((d) => d === 'github.com').length
    expect(githubCount).toBe(1)
    expect(result).toContain('new-domain.com')
  })

  it('should return empty array for none preset with no additions', () => {
    const result = mergePolicy({ preset: 'none' })

    expect(result).toEqual([])
  })

  it('should return only additional domains for none preset', () => {
    const result = mergePolicy({
      preset: 'none',
      additionalDomains: ['api.openai.com'],
    })

    expect(result).toEqual(['api.openai.com'])
  })
})
