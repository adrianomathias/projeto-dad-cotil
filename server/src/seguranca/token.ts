import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Perfil, UsuarioLogado } from '@biblioteca/shared'

export interface ConteudoToken {
  sub: number
  nome: string
  email: string
  perfil: Perfil
  leitorId: number | null
  iat: number
  exp: number
}

function base64Url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url')
}

function assinar(parte: string, segredo: string): string {
  return createHmac('sha256', segredo).update(parte).digest('base64url')
}

/** Token JWT HS256 com validade curta. Nenhum dado sigiloso no conteúdo. */
export class ServicoToken {
  constructor(private readonly segredo: string, private readonly validadeSegundos = 8 * 60 * 60) {
    if (segredo.length < 16) throw new Error('JWT_SECRET deve ter ao menos 16 caracteres.')
  }

  emitir(usuario: UsuarioLogado): string {
    const agora = Math.floor(Date.now() / 1000)
    const conteudo: ConteudoToken = {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      leitorId: usuario.leitorId,
      iat: agora,
      exp: agora + this.validadeSegundos
    }
    const cabecalho = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const corpo = base64Url(JSON.stringify(conteudo))
    const parte = `${cabecalho}.${corpo}`
    return `${parte}.${assinar(parte, this.segredo)}`
  }

  verificar(token: string): ConteudoToken {
    const partes = token.split('.')
    if (partes.length !== 3) throw new Error('Token inválido.')
    const [cabecalho, corpo, assinatura] = partes as [string, string, string]
    const esperada = assinar(`${cabecalho}.${corpo}`, this.segredo)
    const recebidaBuffer = Buffer.from(assinatura)
    const esperadaBuffer = Buffer.from(esperada)
    if (recebidaBuffer.length !== esperadaBuffer.length || !timingSafeEqual(recebidaBuffer, esperadaBuffer)) {
      throw new Error('Token inválido.')
    }

    let conteudo: unknown
    try {
      conteudo = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    } catch {
      throw new Error('Token inválido.')
    }
    if (typeof conteudo !== 'object' || conteudo === null) throw new Error('Token inválido.')
    const dados = conteudo as Partial<ConteudoToken>
    if (typeof dados.sub !== 'number' || typeof dados.perfil !== 'string' ||
        typeof dados.exp !== 'number' || !['ADMIN', 'LEITOR'].includes(dados.perfil)) {
      throw new Error('Token inválido.')
    }
    if (dados.exp <= Math.floor(Date.now() / 1000)) throw new Error('Sessão expirada.')
    return {
      sub: dados.sub,
      nome: typeof dados.nome === 'string' ? dados.nome : '',
      email: typeof dados.email === 'string' ? dados.email : '',
      perfil: dados.perfil,
      leitorId: typeof dados.leitorId === 'number' ? dados.leitorId : null,
      iat: typeof dados.iat === 'number' ? dados.iat : 0,
      exp: dados.exp
    }
  }
}
