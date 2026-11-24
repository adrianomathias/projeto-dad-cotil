import type { Feriado } from '@biblioteca/shared'
import { ClienteHttp } from './cliente-http.js'

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

export class ServicoBrasilApi {
  private readonly cliente: ClienteHttp

  constructor(cliente: ClienteHttp = new ClienteHttp()) {
    this.cliente = cliente
  }

  async feriados(ano: number): Promise<Feriado[]> {
    if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) {
      throw new Error('Informe um ano entre 1900 e 2100.')
    }

    let resposta: unknown
    try {
      resposta = await this.cliente.getJson<unknown>(
        `https://brasilapi.com.br/api/feriados/v1/${ano}`
      )
    } catch {
      throw new Error('Não foi possível consultar os feriados no momento. Tente novamente mais tarde.')
    }

    if (!Array.isArray(resposta)) {
      throw new Error('A consulta de feriados retornou uma resposta inválida.')
    }

    const itens: unknown[] = resposta
    const feriados: Feriado[] = []
    for (const item of itens) {
      if (typeof item !== 'object' || item === null || !('date' in item) || !('name' in item)) {
        continue
      }
      const data = texto(item.date)
      const nome = texto(item.name)
      if (data !== null && nome !== null) {
        feriados.push({ data, nome })
      }
    }
    return feriados
  }
}
