import type { ErrorRequestHandler } from 'express'

interface ErroDeEntrada {
  status: number
  codigo: string
  mensagem: string
}

/** Erro esperado de regra de negócio, validação ou acesso. */
export class ErroDeDominio extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes?: Record<string, string>

  constructor(status: number, codigo: string, mensagem: string, detalhes?: Record<string, string>) {
    super(mensagem)
    this.name = 'ErroDeDominio'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }

  static validacao(mensagem: string, detalhes?: Record<string, string>): ErroDeDominio {
    return new ErroDeDominio(400, 'DADOS_INVALIDOS', mensagem, detalhes)
  }

  static naoEncontrado(mensagem: string): ErroDeDominio {
    return new ErroDeDominio(404, 'NAO_ENCONTRADO', mensagem)
  }

  static conflito(mensagem: string, detalhes?: Record<string, string>): ErroDeDominio {
    return new ErroDeDominio(409, 'CONFLITO', mensagem, detalhes)
  }

  static naoAutorizado(mensagem = 'Você não tem permissão para esta operação.'): ErroDeDominio {
    return new ErroDeDominio(403, 'SEM_PERMISSAO', mensagem)
  }
}

const errosDeEntrada: Readonly<Record<string, ErroDeEntrada>> = {
  'entity.parse.failed': {
    status: 400, codigo: 'JSON_INVALIDO', mensagem: 'O corpo deve conter JSON válido.'
  },
  'entity.too.large': {
    status: 413, codigo: 'CORPO_MUITO_GRANDE', mensagem: 'O corpo excede o limite de 100 KB.'
  },
  'charset.unsupported': {
    status: 415, codigo: 'CODIFICACAO_NAO_SUPORTADA', mensagem: 'Codificação do corpo não suportada.'
  },
  'encoding.unsupported': {
    status: 415, codigo: 'CODIFICACAO_NAO_SUPORTADA', mensagem: 'Codificação do corpo não suportada.'
  },
  'request.aborted': {
    status: 400, codigo: 'REQUISICAO_INTERROMPIDA', mensagem: 'A requisição foi interrompida.'
  },
  'request.size.invalid': {
    status: 400, codigo: 'TAMANHO_INVALIDO', mensagem: 'O tamanho do corpo é inválido.'
  }
}

export const tratarErros: ErrorRequestHandler = (erro: unknown, _requisicao, resposta, proximo) => {
  if (resposta.headersSent) {
    proximo(erro)
    return
  }

  if (erro instanceof ErroDeDominio) {
    resposta.status(erro.status).json({
      erro: {
        codigo: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes === undefined ? {} : { detalhes: erro.detalhes })
      }
    })
    return
  }

  if (typeof erro === 'object' && erro !== null && 'type' in erro && typeof erro.type === 'string') {
    const entrada = Object.hasOwn(errosDeEntrada, erro.type) ? errosDeEntrada[erro.type] : undefined
    if (entrada !== undefined && 'status' in erro && erro.status === entrada.status) {
      resposta.status(entrada.status).json({
        erro: { codigo: entrada.codigo, mensagem: entrada.mensagem }
      })
      return
    }
  }

  // O parser tambem pode produzir 400 sem type, por exemplo em gzip corrompido.
  if (erro instanceof Error && 'status' in erro && erro.status === 400) {
    resposta.status(400).json({
      erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Não foi possível interpretar o corpo da requisição.' }
    })
    return
  }

  // Nao registrar corpo, credenciais ou mensagens de dependencias que possam conter dados pessoais.
  console.error('Erro interno no servidor.', erro instanceof Error ? erro.name : 'Erro desconhecido')
  resposta.status(500).json({
    erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.' }
  })
}
