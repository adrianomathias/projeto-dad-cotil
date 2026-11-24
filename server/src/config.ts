import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export interface Configuracao {
  porta: number
  origemCors?: string
  ambiente: string
  caminhoBanco: string
  caminhoChaves: string
  adminEmail: string
  adminSenha: string
  senhaInicialLeitor?: string
  googleBooksApiKey?: string
  smtpHost?: string
  smtpPorta: number
  smtpUsuario?: string
  smtpSenha?: string
  whatsappToken?: string
  modoSimuladoEmail: boolean
  validarCpfExterno: boolean
  executarAgendador: boolean
}

const raiz = fileURLToPath(new URL('../../', import.meta.url))

function inteiroAmbiente(
  ambiente: NodeJS.ProcessEnv,
  nome: string,
  padrao: number,
  minimo: number,
  maximo: number
): number {
  const valor = ambiente[nome]
  if (valor === undefined || valor === '') return padrao
  if (!/^\d+$/.test(valor)) throw new Error(`${nome} deve ser um número inteiro.`)
  const numero = Number(valor)
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${nome} deve estar entre ${minimo} e ${maximo}.`)
  }
  return numero
}

function textoOpcional(ambiente: NodeJS.ProcessEnv, nome: string): string | undefined {
  const valor = ambiente[nome]?.trim()
  return valor === undefined || valor === '' ? undefined : valor
}

export function lerConfiguracao(
  ambiente: NodeJS.ProcessEnv = process.env,
  diretorioRaiz: string = raiz
): Configuracao {
  const valorPorta = ambiente['PORT'] ?? '3000'
  const porta = Number(valorPorta)

  if (!/^\d+$/.test(valorPorta) || !Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.')
  }

  const origemCors = ambiente['CORS_ORIGIN']?.trim()
  if (origemCors === '') {
    throw new Error('CORS_ORIGIN deve ser uma origem HTTP ou HTTPS, sem caminho.')
  }
  // "null" é a origem opaca usada pelo renderer do Electron empacotado (file://).
  if (origemCors !== undefined && origemCors !== 'null') {
    let origem: URL
    try {
      origem = new URL(origemCors)
    } catch {
      throw new Error('CORS_ORIGIN deve ser uma origem HTTP ou HTTPS, sem caminho.')
    }
    if (!['http:', 'https:'].includes(origem.protocol) || origem.origin !== origemCors) {
      throw new Error('CORS_ORIGIN deve ser uma origem HTTP ou HTTPS, sem caminho.')
    }
  }

  const ambienteExecucao = ambiente['NODE_ENV'] ?? 'development'
  const producao = ambienteExecucao === 'production'
  const adminEmail = ambiente['ADMIN_EMAIL']?.trim() || 'admin@biblioteca.local'
  const adminSenha = ambiente['ADMIN_SENHA'] ?? (producao ? '' : 'Admin@123')
  if (producao && adminSenha.length < 12) {
    throw new Error('ADMIN_SENHA é obrigatória e deve ter ao menos 12 caracteres em produção.')
  }
  const senhaInicialLeitor = ambiente['LEITOR_SENHA_INICIAL'] ?? (producao ? '' : 'Leitor@123')
  if (producao && senhaInicialLeitor !== '' && senhaInicialLeitor.length < 12) {
    throw new Error('LEITOR_SENHA_INICIAL deve ter ao menos 12 caracteres em produção.')
  }
  if (producao && (textoOpcional(ambiente, 'CPF_CRYPTO_KEY') === undefined ||
      textoOpcional(ambiente, 'CPF_HMAC_KEY') === undefined ||
      textoOpcional(ambiente, 'JWT_SECRET') === undefined)) {
    throw new Error('CPF_CRYPTO_KEY, CPF_HMAC_KEY e JWT_SECRET são obrigatórios em produção.')
  }

  return {
    porta,
    origemCors: textoOpcional(ambiente, 'CORS_ORIGIN'),
    ambiente: ambienteExecucao,
    caminhoBanco: resolve(diretorioRaiz, ambiente['DATABASE_PATH'] ?? 'data/biblioteca.sqlite'),
    caminhoChaves: resolve(diretorioRaiz, ambiente['CHAVES_PATH'] ?? 'data/chaves-locais.json'),
    adminEmail,
    adminSenha,
    senhaInicialLeitor: senhaInicialLeitor === '' ? undefined : senhaInicialLeitor,
    googleBooksApiKey: textoOpcional(ambiente, 'GOOGLE_BOOKS_API_KEY'),
    smtpHost: textoOpcional(ambiente, 'SMTP_HOST'),
    smtpPorta: inteiroAmbiente(ambiente, 'SMTP_PORT', 587, 1, 65535),
    smtpUsuario: textoOpcional(ambiente, 'SMTP_USER'),
    smtpSenha: textoOpcional(ambiente, 'SMTP_PASSWORD'),
    whatsappToken: textoOpcional(ambiente, 'WHATSAPP_TOKEN'),
    modoSimuladoEmail: ambiente['MODO_SIMULADO_EMAIL'] === '1' || textoOpcional(ambiente, 'SMTP_HOST') === undefined,
    // Em produção a checagem externa é obrigatória; a variável só ajuda em testes locais.
    validarCpfExterno: producao || ambiente['VALIDAR_CPF_EXTERNO'] !== '0',
    executarAgendador: ambiente['EXECUTAR_AGENDADOR'] !== '0'
  }
}

export function carregarConfiguracao(
  caminhoEnv = fileURLToPath(new URL('../../.env', import.meta.url))
): Configuracao {
  try {
    // Caminho fixo na raiz do monorepo, tanto em src quanto em dist.
    // Variáveis já definidas pelo processo têm prioridade sobre o arquivo.
    loadEnvFile(caminhoEnv)
  } catch (erro: unknown) {
    if (!(erro instanceof Error && 'code' in erro && erro.code === 'ENOENT')) {
      throw new Error('Não foi possível carregar o arquivo .env.', { cause: erro })
    }
  }

  return lerConfiguracao()
}

export function caminhoDaRaiz(): string {
  return dirname(raiz)
}
