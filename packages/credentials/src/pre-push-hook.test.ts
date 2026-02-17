import { checkPrePush, generatePrePushScript } from './pre-push-hook.js'

describe('checkPrePush', () => {
	it('allows push to non-protected branch', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/feature',
			remoteRef: 'refs/heads/feature',
			remote: 'origin',
		})
		expect(result.allowed).toBe(true)
	})

	it('blocks push to main', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/main',
			remoteRef: 'refs/heads/main',
			remote: 'origin',
		})
		expect(result.allowed).toBe(false)
		expect(result.reason).toContain('main')
	})

	it('blocks push to master', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/master',
			remoteRef: 'refs/heads/master',
			remote: 'origin',
		})
		expect(result.allowed).toBe(false)
	})

	it('blocks push to production', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/production',
			remoteRef: 'refs/heads/production',
			remote: 'origin',
		})
		expect(result.allowed).toBe(false)
	})

	it('blocks force push', () => {
		const result = checkPrePush({
			localRef: '+refs/heads/feature',
			remoteRef: 'refs/heads/feature',
			remote: 'origin',
		})
		expect(result.allowed).toBe(false)
		expect(result.reason).toContain('Force push')
	})

	it('blocks refspec tricks (pushing to different branch)', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/exploit',
			remoteRef: 'refs/heads/main-backdoor',
			remote: 'origin',
		})
		expect(result.allowed).toBe(false)
		expect(result.reason).toContain('not allowed')
	})

	it('allows pushing to yologuard/* branches even with different name', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/feature',
			remoteRef: 'refs/heads/yologuard/feature',
			remote: 'origin',
		})
		expect(result.allowed).toBe(true)
	})

	it('allows same-branch push to non-protected branch', () => {
		const result = checkPrePush({
			localRef: 'refs/heads/develop',
			remoteRef: 'refs/heads/develop',
			remote: 'origin',
		})
		expect(result.allowed).toBe(true)
	})
})

describe('generatePrePushScript', () => {
	it('generates a bash script', () => {
		const script = generatePrePushScript()
		expect(script).toContain('#!/usr/bin/env bash')
		expect(script).toContain('yologuard')
	})

	it('includes protected branch checks', () => {
		const script = generatePrePushScript()
		expect(script).toContain('main|master|production')
	})

	it('exits with 1 on protected branch', () => {
		const script = generatePrePushScript()
		expect(script).toContain('exit 1')
	})

	it('exits with 0 on success', () => {
		const script = generatePrePushScript()
		expect(script).toContain('exit 0')
	})
})
