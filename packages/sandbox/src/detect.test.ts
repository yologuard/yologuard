import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	detectStack,
	generateDevcontainerConfig,
	hasExistingDevcontainer,
	resolveDevcontainerConfig,
} from './detect.js'

let tempDir: string

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), 'yologuard-detect-'))
})

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true })
})

describe('detectStack', () => {
	it('should detect node stack from package.json', async () => {
		await writeFile(join(tempDir, 'package.json'), '{}')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('node')
	})

	it('should detect python stack from requirements.txt', async () => {
		await writeFile(join(tempDir, 'requirements.txt'), '')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('python')
	})

	it('should detect python stack from pyproject.toml', async () => {
		await writeFile(join(tempDir, 'pyproject.toml'), '')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('python')
	})

	it('should detect go stack from go.mod', async () => {
		await writeFile(join(tempDir, 'go.mod'), '')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('go')
	})

	it('should detect rust stack from Cargo.toml', async () => {
		await writeFile(join(tempDir, 'Cargo.toml'), '')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('rust')
	})

	it('should return unknown when no markers found', async () => {
		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('unknown')
	})

	it('should prioritize node over python when both exist', async () => {
		await writeFile(join(tempDir, 'package.json'), '{}')
		await writeFile(join(tempDir, 'requirements.txt'), '')

		const result = await detectStack({ workspacePath: tempDir })

		expect(result).toBe('node')
	})
})

describe('generateDevcontainerConfig', () => {
	it('should generate config for node stack', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'node',
			sandboxId: 'test-123',
		})

		expect(config.name).toBe('yologuard-test-123')
		expect(config.image).toBe(
			'mcr.microsoft.com/devcontainers/javascript-node:22',
		)
		expect(config.remoteUser).toBe('node')
		expect(config.containerEnv.YOLOGUARD_SANDBOX_ID).toBe('test-123')
		expect(config.customizations.yologuard.sandboxId).toBe('test-123')
		expect(config.customizations.yologuard.managed).toBe(true)
	})

	it('should generate config for python stack', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'python',
			sandboxId: 'py-456',
		})

		expect(config.image).toBe(
			'mcr.microsoft.com/devcontainers/python:3.12',
		)
		expect(config.remoteUser).toBe('vscode')
	})

	it('should generate config for unknown stack with base image', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'unknown',
			sandboxId: 'unknown-789',
		})

		expect(config.image).toBe(
			'mcr.microsoft.com/devcontainers/base:debian',
		)
		expect(config.remoteUser).toBe('vscode')
	})

	it('should include host requirements when resource limits provided', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'node',
			sandboxId: 'test-limits',
			resourceLimits: { cpus: 2, memoryMb: 1024, diskMb: 5120 },
		})

		expect(config.hostRequirements).toEqual({
			cpus: 2,
			memory: '1024mb',
			storage: '5120mb',
		})
	})

	it('should omit host requirements when no resource limits', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'go',
			sandboxId: 'test-no-limits',
		})

		expect(config.hostRequirements).toBeUndefined()
	})

	it('should handle partial resource limits', () => {
		const config = generateDevcontainerConfig({
			workspacePath: tempDir,
			stack: 'rust',
			sandboxId: 'test-partial',
			resourceLimits: { cpus: 4 },
		})

		expect(config.hostRequirements).toEqual({ cpus: 4 })
	})
})

describe('hasExistingDevcontainer', () => {
	it('should return true when devcontainer.json exists', async () => {
		await mkdir(join(tempDir, '.devcontainer'), { recursive: true })
		await writeFile(
			join(tempDir, '.devcontainer', 'devcontainer.json'),
			'{}',
		)

		const result = await hasExistingDevcontainer({ workspacePath: tempDir })

		expect(result).toBe(true)
	})

	it('should return false when .devcontainer dir does not exist', async () => {
		const result = await hasExistingDevcontainer({ workspacePath: tempDir })

		expect(result).toBe(false)
	})

	it('should return false when .devcontainer exists but no json file', async () => {
		await mkdir(join(tempDir, '.devcontainer'), { recursive: true })
		await writeFile(
			join(tempDir, '.devcontainer', 'Dockerfile'),
			'FROM node:22',
		)

		const result = await hasExistingDevcontainer({ workspacePath: tempDir })

		expect(result).toBe(false)
	})
})

describe('resolveDevcontainerConfig', () => {
	it('should detect stack and generate config when no existing config', async () => {
		await writeFile(join(tempDir, 'go.mod'), 'module example.com/test')

		const result = await resolveDevcontainerConfig({
			workspacePath: tempDir,
			sandboxId: 'resolve-1',
		})

		expect(result.existing).toBe(false)
		expect(result.config.image).toBe(
			'mcr.microsoft.com/devcontainers/go:1.22',
		)
		expect(result.config.containerEnv.YOLOGUARD_SANDBOX_ID).toBe('resolve-1')
	})

	it('should mark existing=true when devcontainer.json found', async () => {
		await mkdir(join(tempDir, '.devcontainer'), { recursive: true })
		await writeFile(
			join(tempDir, '.devcontainer', 'devcontainer.json'),
			'{}',
		)
		await writeFile(join(tempDir, 'package.json'), '{}')

		const result = await resolveDevcontainerConfig({
			workspacePath: tempDir,
			sandboxId: 'resolve-2',
		})

		expect(result.existing).toBe(true)
		expect(result.config.image).toBe(
			'mcr.microsoft.com/devcontainers/javascript-node:22',
		)
	})

	it('should forward resource limits', async () => {
		const result = await resolveDevcontainerConfig({
			workspacePath: tempDir,
			sandboxId: 'resolve-3',
			resourceLimits: { memoryMb: 2048 },
		})

		expect(result.config.hostRequirements).toEqual({ memory: '2048mb' })
	})
})
