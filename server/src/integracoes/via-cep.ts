import type { EnderecoConsultado } from '@biblioteca/shared'
import { ClienteHttp } from './cliente-http.js'

interface RespostaViaCep {
  erro?: unknown
  logradouro?: unknown
  bairro?: unknown
  localidade?: unknown
  uf?: unknown
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

export class ServicoViaCep {
  private readonly cliente: ClienteHttp

  constructor(cliente: ClienteHttp = new ClienteHttp()) {
    this.cliente = cliente
  }

  async buscar(cep: string): Promise<EnderecoConsultado> {
    const somenteDigitos = typeof cep === 'string' ? cep.replace(/\D/g, '') : ''
    if (!/^\d{8}$/.test(somenteDigitos)) {
      throw new Error('Informe um CEP válido com 8 dígitos.')
    }

    let resposta: RespostaViaCep
    try {
      resposta = await this.cliente.getJson<RespostaViaCep>(
        `https://viacep.com.br/ws/${somenteDigitos}/json/`
      )
    } catch {
      throw new Error('Não foi possível consultar o CEP no momento. Tente novamente mais tarde.')
    }

    if (typeof resposta !== 'object' || resposta === null) {
      throw new Error('A consulta de CEP retornou uma resposta inválida.')
    }

    if (resposta.erro === true) {
      throw new Error('CEP não encontrado.')
    }

    const logradouro = texto(resposta.logradouro)
    const cidade = texto(resposta.localidade)
    const uf = texto(resposta.uf)
    if (logradouro === null || cidade === null || uf === null) {
      throw new Error('O CEP foi encontrado, mas os dados do endereço estão incompletos.')
    }

    return {
      cep: somenteDigitos,
      logradouro,
      bairro: texto(resposta.bairro),
      cidade,
      uf
    }
  }
}
