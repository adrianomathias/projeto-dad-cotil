import type { Autor, Categoria, Editora, Exemplar, Livro, LivroImportado, SituacaoRegistro } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { FabricanteRepositorios, type ParametroSql } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'
import { mapearAutor, mapearCategoria, mapearEditora, mapearExemplar, hojeIso } from './mapeamento.js'
import { Validador } from './validacao.js'
import { condicaoSituacao, normalizarSituacao } from './situacao.js'

interface FiltroLivros {
  q?: string
  situacao?: SituacaoRegistro
  autorId?: number
  editoraId?: number
  categoriaId?: number
  disponivel?: boolean
  pagina?: number
  porPagina?: number
}

interface DadosLivro {
  titulo?: unknown
  subtitulo?: unknown
  isbn10?: unknown
  isbn13?: unknown
  editoraId?: unknown
  anoPublicacao?: unknown
  descricaoCurta?: unknown
  capaUrl?: unknown
  idioma?: unknown
  autoresIds?: unknown
  categoriasIds?: unknown
  quantidadeExemplares?: unknown
}

interface DadosExemplar {
  livroId?: unknown
  codigoTombamento?: unknown
  estadoConservacao?: unknown
  status?: unknown
  localizacao?: unknown
  adquiridoEm?: unknown
}

interface DadosImportacaoLivro {
  titulo?: unknown
  subtitulo?: unknown
  autores?: unknown
  editora?: unknown
  isbn10?: unknown
  isbn13?: unknown
  anoPublicacao?: unknown
  descricaoCurta?: unknown
  capaUrl?: unknown
  idioma?: unknown
  categorias?: unknown
  fonte?: unknown
}

type TabelaAuxiliar = 'autores' | 'editoras' | 'categorias'

export class ServicoCatalogo {
  constructor(private readonly db: Banco, private readonly repos: FabricanteRepositorios) {}

  listarAutores(q?: string, situacao: SituacaoRegistro = 'todos'): Autor[] {
    const termo = Validador.texto(q, 'q', { max: 120 })
    const condicoes: string[] = []
    const parametros: ParametroSql[] = []
    const condicao = condicaoSituacao(normalizarSituacao(situacao), 'deleted_at IS NULL', 'deleted_at IS NOT NULL')
    if (condicao !== undefined) condicoes.push(condicao)
    if (termo !== undefined) {
      condicoes.push('nome LIKE ?')
      parametros.push(`%${termo}%`)
    }
    const where = condicoes.length === 0 ? undefined : condicoes.join(' AND ')
    return this.repos.autores.listar({ where, parametros }).map(mapearAutor)
  }

  autorPorId(id: number): Autor {
    const linha = this.repos.autores.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Autor não encontrado.')
    return mapearAutor(linha)
  }

  criarAutor(dados: { nome?: unknown }): Autor {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 120 })
    const id = this.repos.autores.criar({ nome, criadoEm: hojeIso() })
    return this.autorPorId(id)
  }

  atualizarAutor(id: number, dados: { nome?: unknown }): Autor {
    this.autorPorId(id)
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 120 })
    this.repos.autores.atualizar(id, { nome })
    return this.autorPorId(id)
  }

  inativarAutor(id: number): void {
    const autor = this.autorPorId(id)
    if (autor.deletedAt !== null) throw ErroDeDominio.conflito('Este autor já está inativo.')
    const emUso = this.db.prepare('SELECT COUNT(*) AS total FROM livro_autores WHERE autor_id = ?').get(id) as { total: number }
    if (emUso.total > 0) throw ErroDeDominio.conflito('Este autor está ligado a livros do acervo. Não é possível inativá-lo.')
    this.repos.autores.inativar(id)
  }

  listarEditoras(q?: string, situacao: SituacaoRegistro = 'todos'): Editora[] {
    const termo = Validador.texto(q, 'q', { max: 120 })
    const condicoes: string[] = []
    const parametros: ParametroSql[] = []
    const condicao = condicaoSituacao(normalizarSituacao(situacao), 'deleted_at IS NULL', 'deleted_at IS NOT NULL')
    if (condicao !== undefined) condicoes.push(condicao)
    if (termo !== undefined) {
      condicoes.push('nome LIKE ?')
      parametros.push(`%${termo}%`)
    }
    const where = condicoes.length === 0 ? undefined : condicoes.join(' AND ')
    return this.repos.editoras.listar({ where, parametros }).map(mapearEditora)
  }

  editoraPorId(id: number): Editora {
    const linha = this.repos.editoras.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Editora não encontrada.')
    return mapearEditora(linha)
  }

  criarEditora(dados: { nome?: unknown }): Editora {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 120 })
    const id = this.repos.editoras.criar({ nome, criadoEm: hojeIso() })
    return this.editoraPorId(id)
  }

  atualizarEditora(id: number, dados: { nome?: unknown }): Editora {
    this.editoraPorId(id)
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 120 })
    this.repos.editoras.atualizar(id, { nome })
    return this.editoraPorId(id)
  }

  inativarEditora(id: number): void {
    const editora = this.editoraPorId(id)
    if (editora.deletedAt !== null) throw ErroDeDominio.conflito('Esta editora já está inativa.')
    const emUso = this.db.prepare('SELECT COUNT(*) AS total FROM livros WHERE editora_id = ? AND deleted_at IS NULL').get(id) as { total: number }
    if (emUso.total > 0) throw ErroDeDominio.conflito('Esta editora possui livros no acervo. Não é possível inativá-la.')
    this.repos.editoras.inativar(id)
  }

  listarCategorias(q?: string, situacao: SituacaoRegistro = 'todos'): Categoria[] {
    const termo = Validador.texto(q, 'q', { max: 120 })
    const condicoes: string[] = []
    const parametros: ParametroSql[] = []
    const condicao = condicaoSituacao(normalizarSituacao(situacao), 'deleted_at IS NULL', 'deleted_at IS NOT NULL')
    if (condicao !== undefined) condicoes.push(condicao)
    if (termo !== undefined) {
      condicoes.push('nome LIKE ?')
      parametros.push(`%${termo}%`)
    }
    const where = condicoes.length === 0 ? undefined : condicoes.join(' AND ')
    return this.repos.categorias.listar({ where, parametros }).map(mapearCategoria)
  }

  categoriaPorId(id: number): Categoria {
    const linha = this.repos.categorias.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Categoria não encontrada.')
    return mapearCategoria(linha)
  }

  criarCategoria(dados: { nome?: unknown }): Categoria {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 80 })
    const id = this.repos.categorias.criar({ nome, criadoEm: hojeIso() })
    return this.categoriaPorId(id)
  }

  atualizarCategoria(id: number, dados: { nome?: unknown }): Categoria {
    this.categoriaPorId(id)
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 2, max: 80 })
    this.repos.categorias.atualizar(id, { nome })
    return this.categoriaPorId(id)
  }

  inativarCategoria(id: number): void {
    const categoria = this.categoriaPorId(id)
    if (categoria.deletedAt !== null) throw ErroDeDominio.conflito('Esta categoria já está inativa.')
    this.repos.categorias.inativar(id)
  }

  listarLivros(filtros: FiltroLivros = {}): { itens: Livro[]; total: number } {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(normalizarSituacao(filtros.situacao), 'l.deleted_at IS NULL', 'l.deleted_at IS NOT NULL')
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    const q = Validador.texto(filtros.q, 'q', { max: 120 })
    if (q !== undefined) {
      condicoes.push('(l.titulo LIKE ? OR l.isbn10 LIKE ? OR l.isbn13 LIKE ? OR EXISTS (SELECT 1 FROM livro_autores la JOIN autores a ON a.id = la.autor_id WHERE la.livro_id = l.id AND a.nome LIKE ?))')
      const termo = `%${q}%`
      parametros.push(termo, termo, termo, termo)
    }
    if (filtros.autorId !== undefined) {
      condicoes.push('EXISTS (SELECT 1 FROM livro_autores la WHERE la.livro_id = l.id AND la.autor_id = ?)')
      parametros.push(filtros.autorId)
    }
    if (filtros.editoraId !== undefined) {
      condicoes.push('l.editora_id = ?')
      parametros.push(filtros.editoraId)
    }
    if (filtros.categoriaId !== undefined) {
      condicoes.push('EXISTS (SELECT 1 FROM livro_categorias lc WHERE lc.livro_id = l.id AND lc.categoria_id = ?)')
      parametros.push(filtros.categoriaId)
    }
    if (filtros.disponivel === true) {
      condicoes.push('EXISTS (SELECT 1 FROM exemplares e WHERE e.livro_id = l.id AND e.status = ? AND e.deleted_at IS NULL)')
      parametros.push('disponivel')
    }
    if (filtros.disponivel === false) {
      condicoes.push('NOT EXISTS (SELECT 1 FROM exemplares e WHERE e.livro_id = l.id AND e.status = ? AND e.deleted_at IS NULL)')
      parametros.push('disponivel')
    }

    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM livros l${where}`).get(...parametros) as { total: number }).total
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 100)
    const pagina = Math.max(filtros.pagina ?? 1, 1)
    const linhas = this.db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM exemplares e WHERE e.livro_id = l.id AND e.deleted_at IS NULL AND e.status <> 'inativo') AS total_exemplares,
        (SELECT COUNT(*) FROM exemplares e WHERE e.livro_id = l.id AND e.status = 'disponivel' AND e.deleted_at IS NULL) AS disponiveis
      FROM livros l${where}
      ORDER BY l.titulo ASC LIMIT ? OFFSET ?
    `).all(...parametros, porPagina, (pagina - 1) * porPagina) as Array<Record<string, unknown>>

    return {
      itens: linhas.map((linha) => this.completarLivro(linha)),
      total
    }
  }

  livroPorId(id: number): Livro {
    const linha = this.db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM exemplares e WHERE e.livro_id = l.id AND e.deleted_at IS NULL AND e.status <> 'inativo') AS total_exemplares,
        (SELECT COUNT(*) FROM exemplares e WHERE e.livro_id = l.id AND e.status = 'disponivel' AND e.deleted_at IS NULL) AS disponiveis
      FROM livros l WHERE l.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Livro não encontrado.')
    return this.completarLivro(linha)
  }

  private completarLivro(linha: Record<string, unknown>): Livro {
    const id = Number(linha.id)
    const autores = (this.db.prepare(`
      SELECT a.* FROM autores a JOIN livro_autores la ON la.autor_id = a.id
      WHERE la.livro_id = ? AND a.deleted_at IS NULL ORDER BY la.ordem, a.nome
    `).all(id) as Array<Record<string, unknown>>).map(mapearAutor)
    const categorias = (this.db.prepare(`
      SELECT c.* FROM categorias c JOIN livro_categorias lc ON lc.categoria_id = c.id
      WHERE lc.livro_id = ? AND c.deleted_at IS NULL ORDER BY c.nome
    `).all(id) as Array<Record<string, unknown>>).map(mapearCategoria)
    return {
      id,
      titulo: String(linha.titulo),
      subtitulo: typeof linha.subtitulo === 'string' ? linha.subtitulo : null,
      isbn10: typeof linha.isbn10 === 'string' ? linha.isbn10 : null,
      isbn13: typeof linha.isbn13 === 'string' ? linha.isbn13 : null,
      editoraId: linha.editora_id === null || linha.editora_id === undefined ? null : Number(linha.editora_id),
      anoPublicacao: linha.ano_publicacao === null || linha.ano_publicacao === undefined ? null : Number(linha.ano_publicacao),
      descricaoCurta: typeof linha.descricao_curta === 'string' ? linha.descricao_curta : null,
      capaUrl: typeof linha.capa_url === 'string' ? linha.capa_url : null,
      idioma: typeof linha.idioma === 'string' ? linha.idioma : 'pt-BR',
      autores,
      categorias,
      totalExemplares: Number(linha.total_exemplares ?? 0),
      exemplaresDisponiveis: Number(linha.disponiveis ?? 0),
      deletedAt: typeof linha.deleted_at === 'string' ? linha.deleted_at : null
    }
  }

  /** Exemplares criados junto com o livro recebem tombamento automático e único. */
  private criarExemplaresAutomaticos(livroId: number, quantidade: number, agora: string): void {
    let sequencia = 1
    for (let criados = 0; criados < quantidade; criados += 1) {
      let codigo = this.gerarTombamento(livroId, sequencia)
      while (this.db.prepare('SELECT 1 FROM exemplares WHERE codigo_tombamento = ?').get(codigo) !== undefined) {
        sequencia += 1
        codigo = this.gerarTombamento(livroId, sequencia)
      }
      this.repos.exemplares.criar({
        livroId,
        codigoTombamento: codigo,
        estadoConservacao: 'novo',
        status: 'disponivel',
        criadoEm: agora,
        atualizadoEm: agora
      })
      sequencia += 1
    }
  }

  private gerarTombamento(livroId: number, sequencia: number): string {
    return `TOM-${String(livroId).padStart(4, '0')}-${String(sequencia).padStart(3, '0')}`
  }

  /** Ajusta o total de exemplares sem apagar histórico: redução inativa apenas cópias livres. */
  private ajustarQuantidadeExemplares(livroId: number, quantidade: number, agora: string): void {
    const atual = (this.db.prepare(`
      SELECT COUNT(*) AS total FROM exemplares
      WHERE livro_id = ? AND deleted_at IS NULL AND status <> 'inativo'
    `).get(livroId) as { total: number }).total

    if (quantidade > atual) {
      this.criarExemplaresAutomaticos(livroId, quantidade - atual, agora)
      return
    }
    if (quantidade === atual) return

    const remover = atual - quantidade
    const livres = this.db.prepare(`
      SELECT id FROM exemplares
      WHERE livro_id = ? AND deleted_at IS NULL AND status = 'disponivel'
      ORDER BY id ASC LIMIT ?
    `).all(livroId, remover) as Array<{ id: number }>
    if (livres.length < remover) {
      throw ErroDeDominio.conflito(
        'Não há exemplares livres suficientes para reduzir a quantidade. ' +
        'Inative os exemplares em uso antes de diminuir.'
      )
    }
    for (const exemplar of livres) this.inativarExemplar(exemplar.id)
  }

  criarLivro(dados: DadosLivro): Livro {
    const titulo = Validador.texto(dados.titulo, 'titulo', { obrigatorio: true, min: 2, max: 200 })
    const isbn10 = Validador.isbn(dados.isbn10, 'isbn10')
    const isbn13 = Validador.isbn(dados.isbn13, 'isbn13')
    const editoraId = this.validarFk(dados.editoraId, 'editoraId', 'editoras')
    const anoPublicacao = Validador.inteiro(dados.anoPublicacao, 'anoPublicacao', { min: 0, max: 2100 })
    const capaUrl = Validador.texto(dados.capaUrl, 'capaUrl', { max: 500 })
    if (capaUrl !== undefined && !capaUrl.startsWith('https://')) {
      throw ErroDeDominio.validacao('A capa deve usar um endereço HTTPS.', { capaUrl: 'Use https:// no início.' })
    }
    const quantidadeExemplares = Validador.inteiro(
      dados.quantidadeExemplares, 'quantidadeExemplares', { min: 0, max: 100 }
    ) ?? 0
    const agora = hojeIso()
    const transacao = this.db.transaction(() => {
      const id = this.repos.livros.criar({
        titulo,
        subtitulo: Validador.texto(dados.subtitulo, 'subtitulo', { max: 200 }),
        isbn10,
        isbn13,
        editoraId,
        anoPublicacao,
        descricaoCurta: Validador.texto(dados.descricaoCurta, 'descricaoCurta', { max: 2000 }),
        capaUrl,
        idioma: Validador.texto(dados.idioma, 'idioma', { max: 20 }) ?? 'pt-BR',
        criadoEm: agora,
        atualizadoEm: agora
      })
      this.vincular(id, 'livro_autores', 'autor_id', 'autores', this.listaIds(dados.autoresIds, 'autoresIds'))
      this.vincular(id, 'livro_categorias', 'categoria_id', 'categorias', this.listaIds(dados.categoriasIds, 'categoriasIds'))
      this.criarExemplaresAutomaticos(id, quantidadeExemplares, agora)
      return id
    })
    return this.livroPorId(transacao())
  }

  /**
   * Importa metadados vindos de uma API externa para o catálogo local.
   * Autores, editora e categorias são criados quando ainda não existem; ISBN evita duplicatas.
   */
  importarLivro(dados: DadosImportacaoLivro): LivroImportado {
    const titulo = Validador.texto(dados.titulo, 'titulo', { obrigatorio: true, min: 2, max: 200 }) as string
    const isbn10 = Validador.isbn(dados.isbn10, 'isbn10')
    const isbn13 = Validador.isbn(dados.isbn13, 'isbn13')
    const existente = this.buscarLivroImportado(titulo, isbn10, isbn13)
    if (existente !== undefined) {
      return { livro: this.livroPorId(existente), jaExistia: true, autoresCriados: 0, categoriasCriadas: 0, editoraCriada: false }
    }

    const nomesAutores = this.listaNomesImportados(dados.autores, 'autores', 120, 10)
    const nomesCategorias = this.listaNomesImportados(dados.categorias, 'categorias', 80, 8)
    const nomeEditora = Validador.texto(dados.editora, 'editora', { max: 120 })

    const transacao = this.db.transaction(() => {
      const editora = nomeEditora === undefined || nomeEditora === ''
        ? undefined
        : this.garantirRegistro('editoras', nomeEditora)
      const autores = nomesAutores.map((nome) => this.garantirRegistro('autores', nome))
      const categorias = nomesCategorias.map((nome) => this.garantirRegistro('categorias', nome))
      const livro = this.criarLivro({
        titulo,
        subtitulo: dados.subtitulo,
        isbn10,
        isbn13,
        editoraId: editora?.id,
        anoPublicacao: dados.anoPublicacao,
        descricaoCurta: dados.descricaoCurta,
        capaUrl: dados.capaUrl,
        idioma: dados.idioma ?? 'pt-BR',
        autoresIds: autores.map((autor) => autor.id),
        categoriasIds: categorias.map((categoria) => categoria.id),
        quantidadeExemplares: 0
      })
      return {
        livro,
        jaExistia: false,
        autoresCriados: autores.filter((autor) => autor.criado).length,
        categoriasCriadas: categorias.filter((categoria) => categoria.criado).length,
        editoraCriada: editora?.criado === true
      }
    })
    return transacao()
  }

  atualizarLivro(id: number, dados: Partial<DadosLivro>): Livro {
    this.livroPorId(id)
    const alteracoes: Record<string, unknown> = { atualizadoEm: hojeIso() }
    if (dados.titulo !== undefined) alteracoes.titulo = Validador.texto(dados.titulo, 'titulo', { obrigatorio: true, min: 2, max: 200 })
    if (dados.subtitulo !== undefined) alteracoes.subtitulo = Validador.texto(dados.subtitulo, 'subtitulo', { max: 200 })
    if (dados.isbn10 !== undefined) alteracoes.isbn10 = Validador.isbn(dados.isbn10, 'isbn10')
    if (dados.isbn13 !== undefined) alteracoes.isbn13 = Validador.isbn(dados.isbn13, 'isbn13')
    if (dados.editoraId !== undefined) alteracoes.editoraId = this.validarFk(dados.editoraId, 'editoraId', 'editoras')
    if (dados.anoPublicacao !== undefined) alteracoes.anoPublicacao = Validador.inteiro(dados.anoPublicacao, 'anoPublicacao', { min: 0, max: 2100 })
    if (dados.descricaoCurta !== undefined) alteracoes.descricaoCurta = Validador.texto(dados.descricaoCurta, 'descricaoCurta', { max: 2000 })
    if (dados.idioma !== undefined) alteracoes.idioma = Validador.texto(dados.idioma, 'idioma', { max: 20 })
    if (dados.capaUrl !== undefined) {
      const url = Validador.texto(dados.capaUrl, 'capaUrl', { max: 500 })
      if (url !== undefined && !url.startsWith('https://')) throw ErroDeDominio.validacao('A capa deve usar HTTPS.', { capaUrl: 'Use https://.' })
      alteracoes.capaUrl = url
    }

    const autores = dados.autoresIds === undefined ? undefined : this.listaIds(dados.autoresIds, 'autoresIds')
    const categorias = dados.categoriasIds === undefined ? undefined : this.listaIds(dados.categoriasIds, 'categoriasIds')
    const quantidadeExemplares = dados.quantidadeExemplares === undefined
      ? undefined
      : Validador.inteiro(dados.quantidadeExemplares, 'quantidadeExemplares', { min: 0, max: 100 })
    const transacao = this.db.transaction(() => {
      this.repos.livros.atualizar(id, alteracoes)
      if (autores !== undefined) {
        this.db.prepare('DELETE FROM livro_autores WHERE livro_id = ?').run(id)
        this.vincular(id, 'livro_autores', 'autor_id', 'autores', autores)
      }
      if (categorias !== undefined) {
        this.db.prepare('DELETE FROM livro_categorias WHERE livro_id = ?').run(id)
        this.vincular(id, 'livro_categorias', 'categoria_id', 'categorias', categorias)
      }
      if (quantidadeExemplares !== undefined) {
        this.ajustarQuantidadeExemplares(id, quantidadeExemplares, String(alteracoes.atualizadoEm))
      }
    })
    transacao()
    return this.livroPorId(id)
  }

  inativarLivro(id: number): void {
    if (this.livroPorId(id).deletedAt !== null) throw ErroDeDominio.conflito('Este livro já está inativo.')
    const emUso = this.db.prepare(`
      SELECT COUNT(*) AS total FROM exemplares e
      JOIN emprestimos emp ON emp.exemplar_id = e.id AND emp.status = 'aberto'
      WHERE e.livro_id = ?
    `).get(id) as { total: number }
    if (emUso.total > 0) throw ErroDeDominio.conflito('Há exemplares emprestados deste livro.')
    this.repos.livros.inativar(id)
  }

  private buscarLivroImportado(titulo: string, isbn10: string | undefined, isbn13: string | undefined): number | undefined {
    const condicoes: string[] = []
    const parametros: ParametroSql[] = []
    if (isbn10 !== undefined) {
      condicoes.push('isbn10 = ?')
      parametros.push(isbn10)
    }
    if (isbn13 !== undefined) {
      condicoes.push('isbn13 = ?')
      parametros.push(isbn13)
    }
    if (condicoes.length > 0) {
      const linha = this.db.prepare(`
        SELECT id FROM livros
        WHERE deleted_at IS NULL AND (${condicoes.join(' OR ')}) LIMIT 1
      `).get(...parametros) as { id: number } | undefined
      if (linha !== undefined) return Number(linha.id)
    }

    const porTitulo = this.db.prepare(`
      SELECT id FROM livros
      WHERE deleted_at IS NULL AND lower(trim(titulo)) = lower(trim(?)) LIMIT 1
    `).get(titulo) as { id: number } | undefined
    return porTitulo === undefined ? undefined : Number(porTitulo.id)
  }

  private listaNomesImportados(valor: unknown, campo: string, tamanhoMaximo: number, limite: number): string[] {
    if (valor === undefined || valor === null) return []
    if (!Array.isArray(valor)) {
      throw ErroDeDominio.validacao('Lista inválida.', { [campo]: 'Envie uma lista de nomes.' })
    }
    const nomes: string[] = []
    const vistos = new Set<string>()
    for (const item of valor) {
      const nome = Validador.texto(item, campo, { max: tamanhoMaximo })
      if (nome === undefined || nome.length < 2) continue
      const chave = nome.toLocaleLowerCase('pt-BR')
      if (vistos.has(chave)) continue
      vistos.add(chave)
      nomes.push(nome)
      if (nomes.length >= limite) break
    }
    return nomes
  }

  private garantirRegistro(tabela: TabelaAuxiliar, nome: string): { id: number; criado: boolean } {
    const existente = this.db.prepare(`
      SELECT id FROM ${tabela}
      WHERE deleted_at IS NULL AND lower(trim(nome)) = lower(trim(?)) LIMIT 1
    `).get(nome) as { id: number } | undefined
    if (existente !== undefined) return { id: Number(existente.id), criado: false }
    const id = this.repos[tabela].criar({ nome, criadoEm: hojeIso() })
    return { id, criado: true }
  }

  private listaIds(valor: unknown, campo: string): number[] {
    if (valor === undefined || valor === null) return []
    if (!Array.isArray(valor)) throw ErroDeDominio.validacao('Lista inválida.', { [campo]: 'Envie uma lista de ids.' })
    return [...new Set(valor.map((item) => {
      const id = Validador.inteiro(item, campo, { min: 1 })
      if (id === undefined) throw ErroDeDominio.validacao('Id inválido.', { [campo]: 'Informe ids válidos.' })
      return id
    }))]
  }

  private validarFk(valor: unknown, campo: string, tabela: string): number | null {
    const id = Validador.inteiro(valor, campo, { min: 1 })
    if (id === undefined) return null
    const linha = this.db.prepare(`SELECT id FROM ${tabela} WHERE id = ? AND deleted_at IS NULL`).get(id)
    if (linha === undefined) throw ErroDeDominio.validacao('Registro relacionado não encontrado.', { [campo]: 'Escolha um item válido.' })
    return id
  }

  private vincular(livroId: number, tabela: string, colunaFk: string, tabelaFk: string, ids: number[]): void {
    for (const id of ids) {
      const existe = this.db.prepare(`SELECT id FROM ${tabelaFk} WHERE id = ? AND deleted_at IS NULL`).get(id)
      if (existe === undefined) throw ErroDeDominio.validacao('Registro relacionado não encontrado.', { [colunaFk]: `Id ${id} não existe.` })
      if (tabela === 'livro_autores') {
        this.db.prepare(`INSERT INTO ${tabela} (livro_id, ${colunaFk}, ordem) VALUES (?, ?, ?)`).run(livroId, id, 1)
      } else {
        this.db.prepare(`INSERT INTO ${tabela} (livro_id, ${colunaFk}) VALUES (?, ?)`).run(livroId, id)
      }
    }
  }

  listarExemplares(q?: string, livroId?: number, situacao: SituacaoRegistro = 'todos'): Exemplar[] {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(situacao),
      "e.deleted_at IS NULL AND e.status <> 'inativo'",
      "(e.deleted_at IS NOT NULL OR e.status = 'inativo')"
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    const termo = Validador.texto(q, 'q', { max: 120 })
    if (termo !== undefined) {
      condicoes.push('(e.codigo_tombamento LIKE ? OR l.titulo LIKE ?)')
      parametros.push(`%${termo}%`, `%${termo}%`)
    }
    if (livroId !== undefined) {
      condicoes.push('e.livro_id = ?')
      parametros.push(livroId)
    }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const linhas = this.db.prepare(`
      SELECT e.*, l.titulo AS titulo_livro FROM exemplares e
      JOIN livros l ON l.id = e.livro_id${where}
      ORDER BY e.codigo_tombamento
    `).all(...parametros) as Array<Record<string, unknown>>
    return linhas.map(mapearExemplar)
  }

  exemplarPorId(id: number): Exemplar {
    const linha = this.db.prepare(`
      SELECT e.*, l.titulo AS titulo_livro FROM exemplares e
      JOIN livros l ON l.id = e.livro_id WHERE e.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Exemplar não encontrado.')
    return mapearExemplar(linha)
  }

  criarExemplar(dados: DadosExemplar): Exemplar {
    const livroId = Validador.inteiro(dados.livroId, 'livroId', { obrigatorio: true, min: 1 })
    if (this.livroPorId(livroId as number).deletedAt !== null) {
      throw ErroDeDominio.validacao('Não é possível criar exemplares para um livro inativo.', { livroId: 'Reative o livro antes.' })
    }
    const tombamento = Validador.texto(dados.codigoTombamento, 'codigoTombamento', { obrigatorio: true, min: 2, max: 60 })
    const estado = Validador.enum(dados.estadoConservacao, 'estadoConservacao', ['novo', 'bom', 'regular', 'danificado'], true)
    const status = Validador.enum(dados.status, 'status', ['disponivel', 'emprestado', 'reservado', 'agendado', 'em_manutencao', 'inativo']) ?? 'disponivel'
    const adquiridoEm = Validador.data(dados.adquiridoEm, 'adquiridoEm')
    const agora = hojeIso()
    const id = this.repos.exemplares.criar({
      livroId, codigoTombamento: tombamento, estadoConservacao: estado, status,
      localizacao: Validador.texto(dados.localizacao, 'localizacao', { max: 120 }),
      adquiridoEm, criadoEm: agora, atualizadoEm: agora
    })
    return this.exemplarPorId(id)
  }

  atualizarExemplar(id: number, dados: Partial<DadosExemplar> & { status?: unknown }): Exemplar {
    this.exemplarPorId(id)
    const alteracoes: Record<string, unknown> = { atualizadoEm: hojeIso() }
    if (dados.codigoTombamento !== undefined) alteracoes.codigoTombamento = Validador.texto(dados.codigoTombamento, 'codigoTombamento', { obrigatorio: true, min: 2, max: 60 })
    if (dados.estadoConservacao !== undefined) alteracoes.estadoConservacao = Validador.enum(dados.estadoConservacao, 'estadoConservacao', ['novo', 'bom', 'regular', 'danificado'], true)
    if (dados.status !== undefined) alteracoes.status = Validador.enum(dados.status, 'status', ['disponivel', 'emprestado', 'reservado', 'agendado', 'em_manutencao', 'inativo'], true)
    if (dados.localizacao !== undefined) alteracoes.localizacao = Validador.texto(dados.localizacao, 'localizacao', { max: 120 })
    if (dados.adquiridoEm !== undefined) alteracoes.adquiridoEm = Validador.data(dados.adquiridoEm, 'adquiridoEm')
    this.repos.exemplares.atualizar(id, alteracoes)
    return this.exemplarPorId(id)
  }

  inativarExemplar(id: number): void {
    const exemplar = this.exemplarPorId(id)
    if (exemplar.status === 'inativo' || exemplar.deletedAt !== null) throw ErroDeDominio.conflito('Este exemplar já está inativo.')
    const emUso = this.db.prepare("SELECT COUNT(*) AS total FROM emprestimos WHERE exemplar_id = ? AND status = 'aberto'").get(id) as { total: number }
    if (emUso.total > 0) throw ErroDeDominio.conflito('Este exemplar está emprestado.')
    if (exemplar.status === 'reservado' || exemplar.status === 'agendado') {
      throw ErroDeDominio.conflito('Este exemplar está reservado ou agendado.')
    }
    this.repos.exemplares.atualizar(id, { status: 'inativo', atualizadoEm: hojeIso() })
  }
}
