import { getProxyEnvVars, generateResolvConf } from './proxy-env.js'

describe('getProxyEnvVars', () => {
	it('should return HTTP_PROXY and HTTPS_PROXY pointing to sidecar', () => {
		// Given: a sidecar IP and port
		const vars = getProxyEnvVars({ sidecarIp: '172.18.0.2', sidecarPort: 3128 })

		// Then: proxy env vars point to the sidecar
		expect(vars.HTTP_PROXY).toBe('http://172.18.0.2:3128')
		expect(vars.HTTPS_PROXY).toBe('http://172.18.0.2:3128')
	})

	it('should set NO_PROXY to localhost', () => {
		// Given: any sidecar params
		const vars = getProxyEnvVars({ sidecarIp: '172.18.0.2' })

		// Then: NO_PROXY excludes localhost
		expect(vars.NO_PROXY).toBe('localhost,127.0.0.1')
	})

	it('should use default port 3128 when not specified', () => {
		// Given: no explicit port
		const vars = getProxyEnvVars({ sidecarIp: '10.0.0.5' })

		// Then: it uses port 3128
		expect(vars.HTTP_PROXY).toBe('http://10.0.0.5:3128')
		expect(vars.HTTPS_PROXY).toBe('http://10.0.0.5:3128')
	})

	it('should use custom port when specified', () => {
		// Given: a custom port
		const vars = getProxyEnvVars({ sidecarIp: '10.0.0.5', sidecarPort: 8080 })

		// Then: it uses the custom port
		expect(vars.HTTP_PROXY).toBe('http://10.0.0.5:8080')
	})
})

describe('generateResolvConf', () => {
	it('should generate nameserver entry for resolver IP', () => {
		// Given: a resolver IP
		const conf = generateResolvConf({ resolverIp: '172.18.0.3' })

		// Then: it generates the correct resolv.conf content
		expect(conf).toBe('nameserver 172.18.0.3\n')
	})
})
