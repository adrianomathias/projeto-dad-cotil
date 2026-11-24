import type { LivroSugerido } from '@biblioteca/shared'
import { ClienteHttp } from './cliente-http.js'

const LIMITE_MAXIMO = 40
const MAXIMO_CATEGORIAS = 8

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

function nomes(valor: unknown, limite = 10): string[] {
  if (!Array.isArray(valor)) return []
  const resultado: string[] = []
  for (const item of valor) {
    const nome = texto(item)
    if (nome === null || resultado.includes(nome)) continue
    resultado.push(nome)
    if (resultado.length >= limite) break
  }
  return resultado
}

function isbn(valor: unknown, tamanho: 10 | 13): string | null {
  if (!Array.isArray(valor)) return null
  const candidatos = valor
    .map((item) => texto(item))
    .filter((item): item is string => item !== null)
    .map((item) => item.replace(/[^0-9Xx]/g, '').toUpperCase())
    .filter((item) => item.length === tamanho)
  if (candidatos.length === 0) return null
  if (tamanho === 13) {
    return candidatos.find((item) => item.startsWith('978') || item.startsWith('979')) ?? candidatos[0]
  }
  return candidatos[0]
}

function ano(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1000 || valor > 2100) return null
  return valor
}

function capa(coverI: unknown): string | null {
  if (typeof coverI !== 'number' || !Number.isInteger(coverI) || coverI <= 0) return null
  return `https://covers.openlibrary.org/b/id/${coverI}-M.jpg`
}

function mapearDocumento(item: unknown): LivroSugerido | null {
  if (typeof item !== 'object' || item === null) return null

  const titulo = texto('title' in item ? item.title : undefined)
  if (titulo === null) return null

  const isbns = 'isbn' in item ? item.isbn : undefined

  return {
    titulo,
    subtitulo: texto('subtitle' in item ? item.subtitle : undefined),
    autores: nomes('author_name' in item ? item.author_name : undefined),
    editora: nomes('publisher' in item ? item.publisher : undefined, 1)[0] ?? null,
    isbn10: isbn(isbns, 10),
    isbn13: isbn(isbns, 13),
    anoPublicacao: ano('first_publish_year' in item ? item.first_publish_year : undefined),
    descricaoCurta: null,
    capaUrl: capa('cover_i' in item ? item.cover_i : undefined),
    categorias: nomes('subject' in item ? item.subject : undefined, MAXIMO_CATEGORIAS),
    fonte: 'open-library'
  }
}

/** Segunda fonte de metadados, usada quando o Google Books falha ou não retorna resultados. */
export class ServicoOpenLibrary {
  private readonly cliente: ClienteHttp

  constructor(cliente: ClienteHttp = new ClienteHttp()) {
    this.cliente = cliente
  }

  async buscar(termo: string, limite = 5): Promise<LivroSugerido[]> {
    const consulta = termo.trim()
    if (consulta === '') throw new Error('Informe um termo para buscar livros.')

    const base = Number.isFinite(limite) ? Math.trunc(limite) : 5
    const quantidade = Math.min(Math.max(base, 1), LIMITE_MAXIMO)
    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.set('q', consulta)
    url.searchParams.set('limit', String(quantidade))
    url.searchParams.set('fields', 'key,title,subtitle,author_name,first_publish_year,publisher,isbn,cover_i,subject')

    const resposta = await this.cliente.getJson<{ docs?: unknown }>(url.toString())
    const documentos = resposta.docs
    if (!Array.isArray(documentos)) return []

    const sugestoes: LivroSugerido[] = []
    for (const documento of documentos) {
      const sugestao = mapearDocumento(documento)
      if (sugestao !== null) sugestoes.push(sugestao)
    }
    return sugestoes
  }
}
