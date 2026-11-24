import type { EnderecoConsultado, Feriado, LivroSugerido } from '@biblioteca/shared'
import { ErroDeDominio } from '../erros.js'
import type { ConsultaFeriados } from './reservas.js'
import { Validador } from './validacao.js'

export interface ConsultaLivros {
  buscar(termo: string, limite?: number): Promise<LivroSugerido[]>
}

interface ConsultaCep {
  buscar(cep: string): Promise<EnderecoConsultado>
}

/** Quatro usos de API: Google Books, ViaCEP, BrasilAPI e a própria API consumida pelo Electron. */
export class ServicoConsultas {
  constructor(
    private readonly googleBooks: ConsultaLivros,
    private readonly viaCep: ConsultaCep,
    private readonly brasilApi: ConsultaFeriados,
    private readonly openLibrary: ConsultaLivros
  ) {}

  async buscarLivros(termo: unknown, limite?: unknown): Promise<LivroSugerido[]> {
    const texto = Validador.texto(termo, 'q', { obrigatorio: true, min: 2, max: 120 })
    if (texto === undefined) throw ErroDeDominio.validacao('Informe o título do livro.', { q: 'Campo obrigatório.' })
    const quantidade = Validador.inteiro(limite, 'limite', { min: 1, max: 20 }) ?? 5

    // Tenta as duas fontes: o Google Books pode estar sem cota e o Open Library pode falhar
    // intermitentemente. A ordem privilegia a fonte sem cota diária.
    let ultimaFonteFalhou = false
    for (const fonte of [this.openLibrary, this.googleBooks]) {
      try {
        const itens = await fonte.buscar(texto, quantidade)
        ultimaFonteFalhou = false
        if (itens.length > 0) return itens
      } catch {
        ultimaFonteFalhou = true
      }
    }
    if (ultimaFonteFalhou) {
      throw new ErroDeDominio(
        503,
        'SERVICO_INDISPONIVEL',
        'As APIs de livros não responderam. Tente novamente em instantes ou cadastre o livro manualmente.'
      )
    }
    return []
  }

  async buscarCep(cep: unknown): Promise<EnderecoConsultado> {
    const numero = Validador.cep(cep)
    if (numero === undefined) throw ErroDeDominio.validacao('Informe o CEP.', { cep: 'Campo obrigatório.' })
    return this.viaCep.buscar(numero)
  }

  async buscarFeriados(ano: unknown): Promise<Feriado[]> {
    const numero = Validador.inteiro(ano, 'ano', { obrigatorio: true, min: 1900, max: 2100 })
    if (numero === undefined) throw ErroDeDominio.validacao('Informe o ano.', { ano: 'Campo obrigatório.' })
    return this.brasilApi.feriados(numero)
  }
}
