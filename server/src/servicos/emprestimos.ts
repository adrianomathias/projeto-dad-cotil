import type { Emprestimo, Multa, PagamentoMulta, SituacaoRegistro } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { FabricanteRepositorios, type ParametroSql } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'
import { adicionarDias, diasEntre, hoje, agoraIso } from './datas.js'
import { mapearEmprestimo, mapearMulta, mapearPagamento } from './mapeamento.js'
import { ServicoConfiguracoes } from './configuracoes.js'
import { condicaoSituacao, normalizarSituacao } from './situacao.js'
import { Validador } from './validacao.js'

const SELECT_EMPRESTIMO = `
  SELECT emp.*, l.titulo AS titulo_livro,
    CASE WHEN le.deleted_at IS NULL THEN le.nome ELSE 'Leitor inativo' END AS nome_leitor,
    e.codigo_tombamento,
    CASE WHEN emp.status = 'aberto' AND emp.data_devolucao_prevista < date('now')
      THEN CAST(julianday(date('now')) - julianday(emp.data_devolucao_prevista) AS INTEGER) ELSE 0 END AS dias_atraso,
    COALESCE((SELECT m.valor_centavos FROM multas m WHERE m.emprestimo_id = emp.id), 0) AS valor_multa_centavos
  FROM emprestimos emp
  JOIN exemplares e ON e.id = emp.exemplar_id
  JOIN livros l ON l.id = e.livro_id
  JOIN leitores le ON le.id = emp.leitor_id
`

interface FiltroEmprestimos {
  status?: string
  situacao?: SituacaoRegistro
  q?: string
  leitorId?: number
  atrasados?: boolean
  vencendo?: boolean
  pagina?: number
  porPagina?: number
}

export interface DepositoDevolucao {
  exemplarId: number
  livroId: number
  leitorId: number
  emprestimoId: number
  diasAtraso: number
  multaId: number | null
  valorMultaCentavos: number
}

export type AposDevolucao = (resultado: DepositoDevolucao) => Promise<void>

export class ServicoEmprestimos {
  constructor(
    private readonly db: Banco,
    private readonly repos: FabricanteRepositorios,
    private readonly configuracoes: ServicoConfiguracoes,
    private readonly aposDevolucao?: AposDevolucao
  ) {}

  listar(filtro: FiltroEmprestimos = {}): { itens: Emprestimo[]; total: number; pagina: number; porPagina: number } {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(filtro.situacao),
      "emp.status = 'aberto'",
      "emp.status IN ('devolvido', 'cancelado')"
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    if (filtro.status !== undefined) {
      condicoes.push('emp.status = ?')
      parametros.push(Validador.enum(filtro.status, 'status', ['aberto', 'devolvido', 'cancelado'], true) as string)
    }
    if (filtro.leitorId !== undefined) {
      condicoes.push('emp.leitor_id = ?')
      parametros.push(filtro.leitorId)
    }
    if (filtro.atrasados === true) {
      condicoes.push("emp.status = 'aberto' AND emp.data_devolucao_prevista < date('now')")
    }
    if (filtro.vencendo === true) {
      const dias = this.configuracoes.obter().antecedenciaAvisoDias
      condicoes.push("emp.status = 'aberto' AND emp.data_devolucao_prevista BETWEEN date('now') AND date('now', ?)")
      parametros.push(`+${dias} days`)
    }
    const q = Validador.texto(filtro.q, 'q', { max: 120 })
    if (q !== undefined) {
      condicoes.push("((le.deleted_at IS NULL AND le.nome LIKE ?) OR l.titulo LIKE ? OR e.codigo_tombamento LIKE ?)")
      const termo = `%${q}%`
      parametros.push(termo, termo, termo)
    }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM emprestimos emp
      JOIN exemplares e ON e.id = emp.exemplar_id JOIN livros l ON l.id = e.livro_id
      JOIN leitores le ON le.id = emp.leitor_id${where}`).get(...parametros) as { total: number }).total
    const porPagina = Math.min(Math.max(filtro.porPagina ?? 50, 1), 100)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const linhas = this.db.prepare(`${SELECT_EMPRESTIMO}${where} ORDER BY emp.data_emprestimo DESC LIMIT ? OFFSET ?`)
      .all(...parametros, porPagina, (pagina - 1) * porPagina) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearEmprestimo), total, pagina, porPagina }
  }

  emprestimoPorId(id: number): Emprestimo {
    const linha = this.db.prepare(`${SELECT_EMPRESTIMO} WHERE emp.id = ?`).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Empréstimo não encontrado.')
    return mapearEmprestimo(linha)
  }

  criar(dados: { leitorId?: unknown; exemplarId?: unknown; observacao?: unknown }, usuarioId: number): Emprestimo {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    const exemplarId = Validador.inteiro(dados.exemplarId, 'exemplarId', { obrigatorio: true, min: 1 })
    if (leitorId === undefined || exemplarId === undefined) throw ErroDeDominio.validacao('Informe leitor e exemplar.')
    const politica = this.configuracoes.obter()

    const leitor = this.db.prepare('SELECT id, ativo, deleted_at FROM leitores WHERE id = ?').get(leitorId) as
      { id: number; ativo: number; deleted_at: string | null } | undefined
    if (leitor === undefined || leitor.deleted_at !== null || leitor.ativo !== 1) {
      throw ErroDeDominio.validacao('Este leitor não está ativo.', { leitorId: 'Escolha um leitor ativo.' })
    }
    const exemplar = this.db.prepare(`
      SELECT e.id, e.status, e.deleted_at, e.livro_id FROM exemplares e WHERE e.id = ?
    `).get(exemplarId) as { id: number; status: string; deleted_at: string | null; livro_id: number } | undefined
    if (exemplar === undefined || exemplar.deleted_at !== null) throw ErroDeDominio.naoEncontrado('Exemplar não encontrado.')
    if (exemplar.status !== 'disponivel') {
      throw ErroDeDominio.conflito('Este exemplar não está disponível para retirada direta.')
    }

    const naFila = this.db.prepare(`
      SELECT COUNT(*) AS total FROM reservas WHERE livro_id = ? AND status = 'aguardando'
    `).get(exemplar.livro_id) as { total: number }
    if (naFila.total > 0) {
      throw ErroDeDominio.conflito('Há leitores na fila deste livro. Use a retirada da reserva.')
    }

    const ativos = this.db.prepare("SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ? AND status = 'aberto'")
      .get(leitorId) as { total: number }
    if (ativos.total >= politica.limiteExemplaresPorLeitor) {
      throw ErroDeDominio.conflito(`Este leitor já atingiu o limite de ${politica.limiteExemplaresPorLeitor} exemplares.`)
    }

    const data = hoje()
    const id = this.db.transaction(() => {
      const emprestimoId = this.repos.emprestimos.criar({
        exemplarId, leitorId, registradoPorUsuarioId: usuarioId,
        dataEmprestimo: data, dataDevolucaoPrevista: adicionarDias(data, politica.prazoEmprestimoDias),
        status: 'aberto', renovacoes: 0,
        observacao: Validador.texto(dados.observacao, 'observacao', { max: 500 }),
        criadoEm: agoraIso()
      })
      this.repos.exemplares.atualizar(exemplarId, { status: 'emprestado', atualizadoEm: agoraIso() })
      return emprestimoId
    })()
    return this.emprestimoPorId(id)
  }

  async devolver(id: number, usuarioId: number): Promise<Emprestimo> {
    const emprestimo = this.emprestimoPorId(id)
    if (emprestimo.status !== 'aberto') throw ErroDeDominio.conflito('Este empréstimo já foi encerrado.')
    const politica = this.configuracoes.obter()
    const hojeIsoData = hoje()
    const linhaExemplar = this.db.prepare('SELECT livro_id FROM exemplares WHERE id = ?')
      .get(emprestimo.exemplarId) as { livro_id: number }
    const diasAtraso = Math.max(0, diasEntre(emprestimo.dataDevolucaoPrevista, hojeIsoData))

    const resultado: DepositoDevolucao = {
      exemplarId: emprestimo.exemplarId,
      livroId: linhaExemplar.livro_id,
      leitorId: emprestimo.leitorId,
      emprestimoId: id,
      diasAtraso,
      multaId: null,
      valorMultaCentavos: 0
    }

    this.db.transaction(() => {
      this.repos.emprestimos.atualizar(id, { dataDevolucaoReal: hojeIsoData, status: 'devolvido' })
      if (diasAtraso > 0) {
        const valor = Math.min(diasAtraso * politica.valorDiarioMultaCentavos, politica.tetoMultaCentavos)
        const multaId = this.repos.multas.criar({
          emprestimoId: id, leitorId: emprestimo.leitorId, diasAtraso,
          valorDiarioCentavos: politica.valorDiarioMultaCentavos,
          tetoCentavos: politica.tetoMultaCentavos, valorCentavos: valor,
          status: 'pendente', registradaEm: agoraIso()
        })
        resultado.multaId = multaId
        resultado.valorMultaCentavos = valor
      }
      this.repos.exemplares.atualizar(emprestimo.exemplarId, { status: 'disponivel', atualizadoEm: agoraIso() })
    })()

    if (this.aposDevolucao !== undefined) await this.aposDevolucao(resultado)
    return this.emprestimoPorId(id)
  }

  renovar(id: number): Emprestimo {
    const emprestimo = this.emprestimoPorId(id)
    if (emprestimo.status !== 'aberto') throw ErroDeDominio.conflito('Somente empréstimos abertos podem ser renovados.')
    const livroId = (this.db.prepare('SELECT livro_id FROM exemplares WHERE id = ?')
      .get(emprestimo.exemplarId) as { livro_id: number }).livro_id
    const naFila = this.db.prepare("SELECT COUNT(*) AS total FROM reservas WHERE livro_id = ? AND status = 'aguardando'")
      .get(livroId) as { total: number }
    if (naFila.total > 0) throw ErroDeDominio.conflito('Não é possível renovar: há leitores aguardando este livro.')
    if (emprestimo.renovacoes >= 1) throw ErroDeDominio.conflito('Este empréstimo já usou a renovação permitida.')
    const politica = this.configuracoes.obter()
    this.repos.emprestimos.atualizar(id, {
      dataDevolucaoPrevista: adicionarDias(emprestimo.dataDevolucaoPrevista, politica.prazoRenovacaoDias),
      renovacoes: 1
    })
    return this.emprestimoPorId(id)
  }

  cancelar(id: number): void {
    const emprestimo = this.emprestimoPorId(id)
    if (emprestimo.status !== 'aberto') throw ErroDeDominio.conflito('Este empréstimo não está aberto.')
    this.db.transaction(() => {
      this.repos.emprestimos.atualizar(id, { status: 'cancelado' })
      this.repos.exemplares.atualizar(emprestimo.exemplarId, { status: 'disponivel', atualizadoEm: agoraIso() })
    })()
  }

  atualizarObservacao(id: number, observacao: unknown): Emprestimo {
    this.emprestimoPorId(id)
    this.repos.emprestimos.atualizar(id, {
      observacao: Validador.texto(observacao, 'observacao', { max: 500 })
    })
    return this.emprestimoPorId(id)
  }

  listarParaAviso(dias: number): Emprestimo[] {
    const linhas = this.db.prepare(`${SELECT_EMPRESTIMO}
      WHERE emp.status = 'aberto' AND emp.data_devolucao_prevista = date('now', ?)
    `).all(`+${dias} days`) as Array<Record<string, unknown>>
    return linhas.map(mapearEmprestimo)
  }

  listarAtrasados(): Emprestimo[] {
    const linhas = this.db.prepare(`${SELECT_EMPRESTIMO}
      WHERE emp.status = 'aberto' AND emp.data_devolucao_prevista < date('now')
    `).all() as Array<Record<string, unknown>>
    return linhas.map(mapearEmprestimo)
  }

  listarMultas(
    filtro: { leitorId?: number; status?: string; situacao?: SituacaoRegistro; pagina?: number; porPagina?: number } = {}
  ): { itens: Multa[]; total: number } {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(normalizarSituacao(filtro.situacao), "m.status = 'pendente'", "m.status IN ('paga', 'perdoada', 'estornada')")
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    if (filtro.leitorId !== undefined) { condicoes.push('m.leitor_id = ?'); parametros.push(filtro.leitorId) }
    if (filtro.status !== undefined) {
      condicoes.push('m.status = ?')
      parametros.push(Validador.enum(filtro.status, 'status', ['pendente', 'paga', 'perdoada', 'estornada'], true) as string)
    }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM multas m${where}`).get(...parametros) as { total: number }).total
    const porPagina = Math.min(Math.max(filtro.porPagina ?? 50, 1), 100)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const linhas = this.db.prepare(`
      SELECT m.*, CASE WHEN le.deleted_at IS NULL THEN le.nome ELSE 'Leitor inativo' END AS nome_leitor, l.titulo AS titulo_livro FROM multas m
      JOIN leitores le ON le.id = m.leitor_id
      JOIN emprestimos emp ON emp.id = m.emprestimo_id
      JOIN exemplares e ON e.id = emp.exemplar_id
      JOIN livros l ON l.id = e.livro_id${where}
      ORDER BY m.registrada_em DESC LIMIT ? OFFSET ?
    `).all(...parametros, porPagina, (pagina - 1) * porPagina) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearMulta), total }
  }

  multaPorId(id: number): Multa {
    const linha = this.db.prepare(`
      SELECT m.*, CASE WHEN le.deleted_at IS NULL THEN le.nome ELSE 'Leitor inativo' END AS nome_leitor, l.titulo AS titulo_livro FROM multas m
      JOIN leitores le ON le.id = m.leitor_id
      JOIN emprestimos emp ON emp.id = m.emprestimo_id
      JOIN exemplares e ON e.id = emp.exemplar_id
      JOIN livros l ON l.id = e.livro_id WHERE m.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Multa não encontrada.')
    return mapearMulta(linha)
  }

  criarMulta(dados: { emprestimoId?: unknown; diasAtraso?: unknown; valorCentavos?: unknown }): Multa {
    const emprestimoId = Validador.inteiro(dados.emprestimoId, 'emprestimoId', { obrigatorio: true, min: 1 })
    const diasAtraso = Validador.inteiro(dados.diasAtraso, 'diasAtraso', { obrigatorio: true, min: 1 })
    const emprestimo = this.emprestimoPorId(emprestimoId as number)
    const existente = this.db.prepare('SELECT id FROM multas WHERE emprestimo_id = ?').get(emprestimoId) as { id: number } | undefined
    if (existente !== undefined) throw ErroDeDominio.conflito('Este empréstimo já possui multa.')
    const politica = this.configuracoes.obter()
    const valor = Validador.inteiro(dados.valorCentavos, 'valorCentavos', { min: 0, max: politica.tetoMultaCentavos }) ??
      Math.min((diasAtraso as number) * politica.valorDiarioMultaCentavos, politica.tetoMultaCentavos)
    const id = this.repos.multas.criar({
      emprestimoId, leitorId: emprestimo.leitorId, diasAtraso,
      valorDiarioCentavos: politica.valorDiarioMultaCentavos, tetoCentavos: politica.tetoMultaCentavos,
      valorCentavos: valor, status: 'pendente', registradaEm: agoraIso()
    })
    return this.multaPorId(id)
  }

  perdoarMulta(id: number, motivo: unknown, usuarioId: number): Multa {
    this.multaPorId(id)
    const texto = Validador.texto(motivo, 'perdaoMotivo', { obrigatorio: true, min: 5, max: 300 })
    this.repos.multas.atualizar(id, {
      status: 'perdoada', perdaoMotivo: texto, perdaoPorUsuarioId: usuarioId, perdaoEm: agoraIso()
    })
    return this.multaPorId(id)
  }

  estornarMulta(id: number): void {
    this.multaPorId(id)
    this.repos.multas.atualizar(id, { status: 'estornada' })
  }

  listarPagamentos(): PagamentoMulta[] {
    const linhas = this.db.prepare('SELECT * FROM pagamentos_multa ORDER BY registrado_em DESC').all() as Array<Record<string, unknown>>
    return linhas.map(mapearPagamento)
  }

  pagamentoPorId(id: number): PagamentoMulta {
    const linha = this.repos.pagamentos.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Pagamento não encontrado.')
    return mapearPagamento(linha)
  }

  pagarMulta(dados: { multaId?: unknown; valorCentavos?: unknown; forma?: unknown }, usuarioId: number): PagamentoMulta {
    const multaId = Validador.inteiro(dados.multaId, 'multaId', { obrigatorio: true, min: 1 })
    const valor = Validador.inteiro(dados.valorCentavos, 'valorCentavos', { obrigatorio: true, min: 1 })
    const forma = Validador.enum(dados.forma, 'forma', ['dinheiro', 'pix', 'cartao', 'outro'], true) as PagamentoMulta['forma']
    if (multaId === undefined || valor === undefined) throw ErroDeDominio.validacao('Informe multa e valor.')
    const multa = this.multaPorId(multaId)
    if (multa.status !== 'pendente') throw ErroDeDominio.conflito('Esta multa não está em aberto.')
    const pagos = (this.db.prepare("SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM pagamentos_multa WHERE multa_id = ?")
      .get(multaId) as { total: number }).total
    if (pagos + valor > multa.valorCentavos) {
      throw ErroDeDominio.validacao('O valor informado é maior que o saldo devedor.', { valorCentavos: `Saldo: ${(multa.valorCentavos - pagos) / 100}` })
    }
    const id = this.db.transaction(() => {
      const pagamentoId = this.repos.pagamentos.criar({
        multaId, valorCentavos: valor, forma, registradoPorUsuarioId: usuarioId, registradoEm: agoraIso()
      })
      if (pagos + valor === multa.valorCentavos) this.repos.multas.atualizar(multaId, { status: 'paga' })
      return pagamentoId
    })()
    return this.pagamentoPorId(id)
  }

  atualizarPagamento(id: number, comprovante: unknown): PagamentoMulta {
    this.pagamentoPorId(id)
    this.repos.pagamentos.atualizar(id, {
      comprovante: Validador.texto(comprovante, 'comprovante', { max: 120 })
    })
    return this.pagamentoPorId(id)
  }

  estornarPagamento(id: number): void {
    const pagamento = this.pagamentoPorId(id)
    this.db.transaction(() => {
      this.repos.multas.atualizar(pagamento.multaId, { status: 'pendente' })
      this.db.prepare('DELETE FROM pagamentos_multa WHERE id = ?').run(id)
    })()
  }
}
