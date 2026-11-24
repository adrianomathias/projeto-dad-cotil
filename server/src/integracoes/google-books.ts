import type { LivroSugerido } from '@biblioteca/shared'
import { ClienteHttp } from './cliente-http.js'

const LIMITE_MAXIMO = 40
const TAMANHO_DESCRICAO = 300

const entidadesHtml: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

function descricaoCurta(valor: unknown): string | null {
  const bruta = texto(valor)
  if (bruta === null) return null

  const semTags = bruta
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entidade) => entidadesHtml[entidade] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (semTags === '') return null
  return semTags.length > TAMANHO_DESCRICAO
    ? `${semTags.slice(0, TAMANHO_DESCRICAO - 3)}...`
    : semTags
}

function anoPublicacao(valor: unknown): number | null {
  const textoAno = texto(valor)
  if (textoAno === null) return null
  const encontrado = /^(\d{4})/.exec(textoAno)
  return encontrado === null ? null : Number(encontrado[1])
}

function capaHttps(valor: unknown): string | null {
  const url = texto(valor)
  if (url === null || !/^https?:\/\//i.test(url)) return null
  return url.replace(/^http:/i, 'https:')
}

function isbn(valor: unknown, tipo: 'ISBN_13' | 'ISBN_10'): string | null {
  if (!Array.isArray(valor)) return null

  for (const item of valor) {
    if (typeof item !== 'object' || item === null || !('type' in item) || !('identifier' in item)) {
      continue
    }
    if (item.type === tipo) {
      const identificador = texto(item.identifier)
      if (identificador !== null) return identificador
    }
  }
  return null
}

function autores(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const nomes: string[] = []
  for (const item of valor) {
    const nome = texto(item)
    if (nome !== null) nomes.push(nome)
  }
  return nomes
}

function categorias(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const nomes: string[] = []
  for (const item of valor) {
    const nome = texto(item)
    if (nome === null) continue
    for (const parte of nome.split('/')) {
      const categoria = texto(parte)
      if (categoria !== null && categoria.length <= 80 && !nomes.includes(categoria)) nomes.push(categoria)
    }
  }
  return nomes
}

function mapearVolume(item: unknown): LivroSugerido | null {
  if (typeof item !== 'object' || item === null || !('volumeInfo' in item)) return null

  const info: unknown = item.volumeInfo
  if (typeof info !== 'object' || info === null) return null

  const titulo = texto('title' in info ? info.title : undefined)
  if (titulo === null) return null

  const identificadores = 'industryIdentifiers' in info ? info.industryIdentifiers : undefined
  const links = 'imageLinks' in info ? info.imageLinks : undefined
  const thumbnail =
    typeof links === 'object' && links !== null && 'thumbnail' in links ? links.thumbnail : undefined

  return {
    titulo,
    subtitulo: texto('subtitle' in info ? info.subtitle : undefined),
    autores: autores('authors' in info ? info.authors : undefined),
    editora: texto('publisher' in info ? info.publisher : undefined),
    isbn10: isbn(identificadores, 'ISBN_10'),
    isbn13: isbn(identificadores, 'ISBN_13'),
    anoPublicacao: anoPublicacao('publishedDate' in info ? info.publishedDate : undefined),
    descricaoCurta: descricaoCurta('description' in info ? info.description : undefined),
    capaUrl: capaHttps(thumbnail),
    categorias: categorias('categories' in info ? info.categories : undefined),
    fonte: 'google-books'
  }
}

export class ServicoGoogleBooks {
  private readonly cliente: ClienteHttp
  private readonly apiKey: string

  constructor(cliente: ClienteHttp = new ClienteHttp(), apiKey = '') {
    this.cliente = cliente
    this.apiKey = apiKey
  }

  async buscar(termo: string, limite = 5): Promise<LivroSugerido[]> {
    const consulta = termo.trim()
    if (consulta === '') {
      throw new Error('Informe um termo para buscar livros.')
    }

    const base = Number.isFinite(limite) ? Math.trunc(limite) : 5
    const quantidade = Math.min(Math.max(base, 1), LIMITE_MAXIMO)
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', consulta)
    url.searchParams.set('maxResults', String(quantidade))
    url.searchParams.set('langRestrict', 'pt')
    if (this.apiKey.trim() !== '') {
      url.searchParams.set('key', this.apiKey.trim())
    }

    let resposta: unknown
    try {
      resposta = await this.cliente.getJson<unknown>(url.toString())
    } catch {
      throw new Error('Não foi possível consultar sugestões de livros no momento.')
    }

    if (typeof resposta !== 'object' || resposta === null || !('items' in resposta)) {
      return []
    }

    const itens: unknown[] = Array.isArray(resposta.items) ? resposta.items : []
    const sugestoes: LivroSugerido[] = []
    for (const item of itens) {
      const sugestao = mapearVolume(item)
      if (sugestao !== null) sugestoes.push(sugestao)
    }
    return sugestoes
  }
}
