import { ErroDeDominio } from '../erros.js'
import { somenteDigitos } from '../seguranca/cpf.js'
import { ClienteHttp } from './cliente-http.js'

export interface ResultadoConsultaCpf {
  existe: boolean
  situacao: string | null
  fonte: 'brasilapi' | 'receitaws'
}

export interface ConsultaCpfExterno {
  consultar(cpf: string): Promise<ResultadoConsultaCpf>
}

interface RespostaBrasilApi {
  cpf?: string
  nome?: string
  situacao?: string
}

interface RespostaReceita {
  status?: string
  message?: string
}

/**
 * Confirma a existência do CPF em fontes públicas. A validação dos dígitos
 * continua local; esta consulta apenas evita cadastro com número fictício.
 */
export class ServicoConsultaCpf implements ConsultaCpfExterno {
  constructor(private readonly cliente: ClienteHttp = new ClienteHttp()) {}

  async consultar(cpf: string): Promise<ResultadoConsultaCpf> {
    const digitos = somenteDigitos(cpf)
    if (digitos.length !== 11) {
      throw ErroDeDominio.validacao('Informe um CPF com 11 dígitos.', { cpf: 'Digite os 11 números.' })
    }

    try {
      const resposta = await this.cliente.getResposta<RespostaBrasilApi>(
        `https://brasilapi.com.br/api/cpf/v1/${digitos}`
      )
      if (resposta.status === 200 && resposta.dados !== null) {
        const dados = resposta.dados
        const cpfRetornado = typeof dados.cpf === 'string' ? somenteDigitos(dados.cpf) : ''
        if (cpfRetornado === digitos || typeof dados.nome === 'string') {
          return {
            existe: true,
            situacao: typeof dados.situacao === 'string' ? dados.situacao : null,
            fonte: 'brasilapi'
          }
        }
      }
      if (resposta.status === 404) return { existe: false, situacao: null, fonte: 'brasilapi' }
    } catch {
      // A segunda fonte é tentada abaixo quando a primeira não responde.
    }

    try {
      const resposta = await this.cliente.getResposta<RespostaReceita>(
        `https://www.receitaws.com.br/v1/cpf/${digitos}`
      )
      if (resposta.status === 200 && resposta.dados !== null) {
        if (resposta.dados.status === 'OK') {
          return { existe: true, situacao: null, fonte: 'receitaws' }
        }
        if (resposta.dados.status === 'ERROR') {
          const mensagem = typeof resposta.dados.message === 'string' ? resposta.dados.message.toLowerCase() : ''
          const indisponivel = /muit|limite|aguarde|tente novamente|indispon|bloque|erro interno|sobrecarga/.test(mensagem)
          if (indisponivel) {
            throw new ErroDeDominio(
              503,
              'CPF_INDISPONIVEL',
              'Não foi possível confirmar este CPF agora. Tente novamente em instantes.'
            )
          }
          return { existe: false, situacao: null, fonte: 'receitaws' }
        }
      }
    } catch {
      // Erro unificado abaixo, sem expor a URL consultada.
    }

    throw new ErroDeDominio(
      503,
      'CPF_INDISPONIVEL',
      'Não foi possível confirmar este CPF agora. Tente novamente em instantes.'
    )
  }
}
