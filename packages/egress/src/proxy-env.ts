type GetProxyEnvVarsParams = {
  readonly sidecarIp: string
  readonly sidecarPort?: number
}

export const getProxyEnvVars = ({
  sidecarIp,
  sidecarPort = 3128,
}: GetProxyEnvVarsParams): Record<string, string> => ({
  HTTP_PROXY: `http://${sidecarIp}:${sidecarPort}`,
  HTTPS_PROXY: `http://${sidecarIp}:${sidecarPort}`,
  http_proxy: `http://${sidecarIp}:${sidecarPort}`,
  https_proxy: `http://${sidecarIp}:${sidecarPort}`,
  NO_PROXY: 'localhost,127.0.0.1',
  no_proxy: 'localhost,127.0.0.1',
})

type GenerateResolvConfParams = {
  readonly resolverIp: string
}

export const generateResolvConf = ({ resolverIp }: GenerateResolvConfParams): string =>
  `nameserver ${resolverIp}\n`
