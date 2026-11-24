import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Chaves {
  cpfCriptografia: Buffer
  cpfHmac: Buffer
  jwt: string
}

interface ChavesArquivo {
  cpfCriptografia: string
  cpfHmac: string
  jwt: string
}

function hexObrigatorio(valor: string | undefined, nome: string): Buffer | undefined {
  if (valor === undefined || valor.trim() === '') return undefined
  const texto = valor.trim()
  if (!/^[0-9a-fA-F]{64}$/.test(texto)) {
    throw new Error(`${nome} deve conter 64 caracteres hexadecimais (32 bytes).`)
  }
  return Buffer.from(texto, 'hex')
}

/**
 * Em desenvolvimento, chaves ausentes são geradas uma vez em data/ (fora do Git).
 * Em produção, o config exige que venham do ambiente.
 */
export function carregarChaves(ambiente: NodeJS.ProcessEnv, caminhoArquivo: string): Chaves {
  const doAmbiente = {
    cpfCriptografia: hexObrigatorio(ambiente['CPF_CRYPTO_KEY'], 'CPF_CRYPTO_KEY'),
    cpfHmac: hexObrigatorio(ambiente['CPF_HMAC_KEY'], 'CPF_HMAC_KEY'),
    jwt: ambiente['JWT_SECRET']?.trim() || undefined
  }

  let doArquivo: Partial<ChavesArquivo> = {}
  if (existsSync(caminhoArquivo)) {
    try {
      const conteudo: unknown = JSON.parse(readFileSync(caminhoArquivo, 'utf8'))
      if (typeof conteudo === 'object' && conteudo !== null) {
        doArquivo = conteudo as Partial<ChavesArquivo>
      }
    } catch {
      throw new Error('O arquivo local de chaves está inválido. Apague data/chaves-locais.json para recriá-lo.')
    }
  }

  const cpfCriptografia = doAmbiente.cpfCriptografia ??
    hexObrigatorio(doArquivo.cpfCriptografia, 'cpfCriptografia no arquivo local') ??
    randomBytes(32)
  const cpfHmac = doAmbiente.cpfHmac ??
    hexObrigatorio(doArquivo.cpfHmac, 'cpfHmac no arquivo local') ??
    randomBytes(32)
  const jwt = doAmbiente.jwt ?? doArquivo.jwt ?? randomBytes(48).toString('base64url')

  if (jwt.length < 16) throw new Error('A chave JWT deve ter ao menos 16 caracteres.')

  const precisaSalvar = doAmbiente.cpfCriptografia === undefined ||
    doAmbiente.cpfHmac === undefined || doAmbiente.jwt === undefined
  if (precisaSalvar && !existsSync(caminhoArquivo)) {
    mkdirSync(dirname(caminhoArquivo), { recursive: true })
    const registro: ChavesArquivo = {
      cpfCriptografia: cpfCriptografia.toString('hex'),
      cpfHmac: cpfHmac.toString('hex'),
      jwt
    }
    writeFileSync(caminhoArquivo, JSON.stringify(registro, null, 2), { encoding: 'utf8', mode: 0o600 })
    try {
      chmodSync(caminhoArquivo, 0o600)
    } catch {
      // Windows não aplica permissões POSIX; o arquivo permanece fora do Git.
    }
  }

  return { cpfCriptografia, cpfHmac, jwt }
}
