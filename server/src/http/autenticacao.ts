import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Perfil, SituacaoRegistro, UsuarioLogado } from '@biblioteca/shared'
import { ErroDeDominio } from '../erros.js'
import type { CarteiraServicos } from '../servicos/carteira.js'
import { normalizarSituacao } from '../servicos/situacao.js'

/** Envolve handlers síncronos/assíncronos e encaminha falhas ao middleware de erros. */
export function assync(
  handler: (requisicao: Request, resposta: Response) => Promise<unknown> | unknown
): RequestHandler {
  return (requisicao, resposta, proximo) => {
    Promise.resolve(handler(requisicao, resposta)).catch(proximo)
  }
}

export function autenticar(servicos: CarteiraServicos): RequestHandler {
  return (requisicao: Request, _resposta: Response, proximo: NextFunction) => {
    const cabecalho = requisicao.header('authorization') ?? ''
    const [esquema, token] = cabecalho.split(' ')
    if (esquema?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
      proximo(new ErroDeDominio(401, 'NAO_AUTENTICADO', 'Faça login para continuar.'))
      return
    }
    try {
      const conteudo = servicos.token.verificar(token)
      if (!servicos.pessoas.usuarioEstaAtivo(conteudo.sub)) {
        proximo(new ErroDeDominio(401, 'NAO_AUTENTICADO', 'Esta conta foi desativada. Procure a biblioteca.'))
        return
      }
      const usuario: UsuarioLogado = {
        id: conteudo.sub,
        nome: conteudo.nome,
        email: conteudo.email,
        perfil: conteudo.perfil,
        leitorId: conteudo.leitorId,
        somenteLeitura: servicos.pessoas.usuarioSomenteLeitura(conteudo.sub)
      }
      if (usuario.somenteLeitura && !['GET', 'HEAD', 'OPTIONS'].includes(requisicao.method.toUpperCase())) {
        proximo(new ErroDeDominio(403, 'SEM_PERMISSAO', 'Esta conta é somente para visualização.'))
        return
      }
      requisicao.usuario = usuario
      proximo()
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error && erro.message === 'Sessão expirada.'
        ? 'Sua sessão expirou. Faça login novamente.'
        : 'Credencial inválida. Faça login novamente.'
      proximo(new ErroDeDominio(401, 'NAO_AUTENTICADO', mensagem))
    }
  }
}

export function permitir(...perfis: Perfil[]): RequestHandler {
  return (requisicao: Request, _resposta: Response, proximo: NextFunction) => {
    const usuario = requisicao.usuario
    if (usuario === undefined) {
      proximo(new ErroDeDominio(401, 'NAO_AUTENTICADO', 'Faça login para continuar.'))
      return
    }
    if (!perfis.includes(usuario.perfil)) {
      proximo(ErroDeDominio.naoAutorizado())
      return
    }
    proximo()
  }
}

export function usuarioAtual(requisicao: Request): UsuarioLogado {
  if (requisicao.usuario === undefined) {
    throw new ErroDeDominio(401, 'NAO_AUTENTICADO', 'Faça login para continuar.')
  }
  return requisicao.usuario
}

/** Leitores só podem operar sobre o próprio vínculo de leitor. */
export function garantirLeitor(requisicao: Request, leitorId: number): void {
  const usuario = usuarioAtual(requisicao)
  if (usuario.perfil === 'LEITOR' && usuario.leitorId !== leitorId) {
    throw ErroDeDominio.naoAutorizado('Você só pode acessar seus próprios dados.')
  }
}

export function idDaRota(requisicao: Request, nome: string): number {
  const valor = requisicao.params[nome]
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw ErroDeDominio.validacao('Informe um código numérico válido.', { [nome]: 'Somente números.' })
  }
  return Number(valor)
}

export function textoDaConsulta(requisicao: Request, nome: string): string | undefined {
  const valor = requisicao.query[nome]
  if (valor === undefined) return undefined
  if (typeof valor !== 'string') throw ErroDeDominio.validacao('Parâmetro inválido.', { [nome]: 'Use um único valor.' })
  return valor === '' ? undefined : valor
}

export function numeroDaConsulta(requisicao: Request, nome: string, padrao?: number): number | undefined {
  const texto = textoDaConsulta(requisicao, nome)
  if (texto === undefined) return padrao
  if (!/^\d+$/.test(texto)) throw ErroDeDominio.validacao('Número inválido.', { [nome]: 'Use somente números.' })
  return Number(texto)
}

/** `situacao=todos|ativos|inativos`; omitido significa mostrar tudo, inclusive inativo. */
export function situacaoDaConsulta(requisicao: Request): SituacaoRegistro {
  const situacao = textoDaConsulta(requisicao, 'situacao')
  if (situacao !== undefined) return normalizarSituacao(situacao)
  // Compatibilidade com o parâmetro antigo usado por relatórios e links salvos.
  if (booleanoDaConsulta(requisicao, 'inativos') === true) return 'inativos'
  return 'todos'
}

export function booleanoDaConsulta(requisicao: Request, nome: string): boolean | undefined {
  const texto = textoDaConsulta(requisicao, nome)
  if (texto === undefined) return undefined
  if (texto === 'true' || texto === '1') return true
  if (texto === 'false' || texto === '0') return false
  throw ErroDeDominio.validacao('Opção inválida.', { [nome]: 'Use true ou false.' })
}

export function corpo(requisicao: Request): Record<string, unknown> {
  if (typeof requisicao.body !== 'object' || requisicao.body === null || Array.isArray(requisicao.body)) {
    throw ErroDeDominio.validacao('O corpo deve ser um objeto JSON.')
  }
  return requisicao.body as Record<string, unknown>
}
