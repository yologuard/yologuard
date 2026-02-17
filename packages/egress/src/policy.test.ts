import { getPresetAllowlist, mergePolicy } from './policy.js'
import type { PolicyPreset } from './policy.js'

describe('getPresetAllowlist', () => {
	it('should return empty array for none preset', () => {
		// Given: the "none" preset
		// When: getting the allowlist
		const result = getPresetAllowlist('none')

		// Then: it returns an empty array
		expect(result).toEqual([])
	})

	it('should return npm and github domains for node-web preset', () => {
		// Given: the "node-web" preset
		// When: getting the allowlist
		const result = getPresetAllowlist('node-web')

		// Then: it includes essential Node.js domains
		expect(result).toContain('registry.npmjs.org')
		expect(result).toContain('github.com')
		expect(result).toContain('api.github.com')
		expect(result).toContain('nodejs.org')
	})

	it('should return python-related domains for python-ml preset', () => {
		// Given: the "python-ml" preset
		// When: getting the allowlist
		const result = getPresetAllowlist('python-ml')

		// Then: it includes PyPI and HuggingFace
		expect(result).toContain('pypi.org')
		expect(result).toContain('files.pythonhosted.org')
		expect(result).toContain('huggingface.co')
	})

	it('should return a broad set of domains for fullstack preset', () => {
		// Given: the "fullstack" preset
		// When: getting the allowlist
		const result = getPresetAllowlist('fullstack')

		// Then: it includes both Node and Python domains plus CDNs
		expect(result).toContain('registry.npmjs.org')
		expect(result).toContain('pypi.org')
		expect(result).toContain('cdn.jsdelivr.net')
		expect(result).toContain('unpkg.com')
	})

	it('should return a new array each time (not a reference)', () => {
		// Given: two calls for the same preset
		const a = getPresetAllowlist('node-web')
		const b = getPresetAllowlist('node-web')

		// Then: they are equal but not the same reference
		expect(a).toEqual(b)
		expect(a).not.toBe(b)
	})
})

describe('mergePolicy', () => {
	it('should return preset domains when no additional domains given', () => {
		// Given: a preset with no extra domains
		// When: merging the policy
		const result = mergePolicy({ preset: 'node-web' })

		// Then: it returns the preset allowlist
		expect(result).toEqual(getPresetAllowlist('node-web'))
	})

	it('should merge additional domains with preset', () => {
		// Given: additional domains
		// When: merging with a preset
		const result = mergePolicy({
			preset: 'node-web',
			additionalDomains: ['custom.example.com'],
		})

		// Then: the result includes both preset and additional domains
		expect(result).toContain('registry.npmjs.org')
		expect(result).toContain('custom.example.com')
	})

	it('should deduplicate overlapping domains', () => {
		// Given: additional domains that overlap with the preset
		const result = mergePolicy({
			preset: 'node-web',
			additionalDomains: ['github.com', 'new-domain.com'],
		})

		// Then: duplicates are removed
		const githubCount = result.filter((d) => d === 'github.com').length
		expect(githubCount).toBe(1)
		expect(result).toContain('new-domain.com')
	})

	it('should return empty array for none preset with no additions', () => {
		// Given: the "none" preset with no extras
		const result = mergePolicy({ preset: 'none' })

		// Then: it returns empty
		expect(result).toEqual([])
	})

	it('should return only additional domains for none preset', () => {
		// Given: "none" preset with additions
		const result = mergePolicy({
			preset: 'none',
			additionalDomains: ['api.openai.com'],
		})

		// Then: only the additions are included
		expect(result).toEqual(['api.openai.com'])
	})
})
