import type { Agendamento, Feriado, Reserva, SituacaoRegistro } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { FabricanteRepositorios, type ParametroSql } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'
import { adicionarDias, dataHoraMaisHoras, proximoDiaUtil, hoje, agoraIso } from './datas.js'
import { mapearAgendamento, mapearReserva } from './mapeamento.js'
import { ServicoConfiguracoes } from './configuracoes.js'
import type { DepositoDevolucao } from './emprestimos.js'
import { condicaoSituacao, normalizarSituacao } from './situacao.js'
import type { ServicoNotificacoes } from './notificacoes.js'
import { Validador } from './validacao.js'

const SELECT_RESERVA = `
  SELECT r.*, l.titulo AS titulo_livro,
    CASE WHEN le.deleted_at IS NULL THEN le.nome ELSE 'Leitor inativo' END AS nome_leitor,
    ROW_NUMBER() OVER (PARTITION BY r.livro_id ORDER BY r.entrada_em, r.id) AS posicao
  FROM reservas r
  JOIN livros l ON l.id = r.livro_id
  JOIN leitores le ON le.id = r.leitor_id
`

const SELECT_AGENDAMENTO = `
  SELECT a.*, l.titulo AS titulo_livro,
    CASE WHEN le.deleted_at IS NULL THEN le.nome ELSE 'Leitor inativo' END AS nome_leitor
  FROM agendamentos a
  JOIN exemplares e ON e.id = a.exemplar_id
  JOIN livros l ON l.id = e.livro_id
  JOIN leitores le ON le.id = a.leitor_id
`

export interface ConsultaFeriados {
  feriados(ano: number): Promise<Feriado[]>
}

interface FiltroReservas {
  livroId?: number
  leitorId?: number
  situacao?: SituacaoRegistro
  status?: string
  fila?: boolean
  pagina?: number
  porPagina?: number
}

export class ServicoReservas {
  constructor(
    private readonly db: Banco,
    private readonly repos: FabricanteRepositorios,
    private readonly configuracoes: ServicoConfiguracoes,
    private readonly notificacoes: ServicoNotificacoes,
    private readonly brasilApi: ConsultaFeriados
  ) {}

  listar(filtro: FiltroReservas = {}): { itens: Reserva[]; total: number } {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(filtro.situacao),
      "r.status IN ('aguardando', 'disponivel_para_retirada')",
      "r.status IN ('retirado', 'expirado', 'cancelado')"
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    if (filtro.livroId !== undefined) { condicoes.push('r.livro_id = ?'); parametros.push(filtro.livroId) }
    if (filtro.leitorId !== undefined) { condicoes.push('r.leitor_id = ?'); parametros.push(filtro.leitorId) }
    if (filtro.status !== undefined) {
      condicoes.push('r.status = ?')
      parametros.push(Validador.enum(filtro.status, 'status', ['aguardando', 'disponivel_para_retirada', 'retirado', 'expirado', 'cancelado'], true) as string)
    }
    if (filtro.fila === true) condicoes.push("r.status IN ('aguardando','disponivel_para_retirada')")
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM reservas r${where}`).get(...parametros) as { total: number }).total
    const porPagina = Math.min(Math.max(filtro.porPagina ?? 100, 1), 200)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const ordem = filtro.fila === true ? 'r.livro_id, r.entrada_em, r.id' : 'r.entrada_em DESC'
    const linhas = this.db.prepare(`${SELECT_RESERVA}${where} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
      .all(...parametros, porPagina, (pagina - 1) * porPagina) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearReserva), total }
  }

  reservaPorId(id: number): Reserva {
    const linha = this.db.prepare(`${SELECT_RESERVA} WHERE r.id = ?`).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Reserva não encontrada.')
    return mapearReserva(linha)
  }

  criar(dados: { leitorId?: unknown; livroId?: unknown }, usuarioId: number): Reserva {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    const livroId = Validador.inteiro(dados.livroId, 'livroId', { obrigatorio: true, min: 1 })
    if (leitorId === undefined || livroId === undefined) throw ErroDeDominio.validacao('Informe leitor e livro.')
    const politica = this.configuracoes.obter()
    const leitor = this.db.prepare('SELECT id, ativo, deleted_at FROM leitores WHERE id = ?').get(leitorId) as
      { id: number; ativo: number; deleted_at: string | null } | undefined
    if (leitor === undefined || leitor.deleted_at !== null || leitor.ativo !== 1) {
      throw ErroDeDominio.validacao('Este leitor não está ativo.', { leitorId: 'Escolha um leitor ativo.' })
    }
    const livro = this.db.prepare('SELECT id, deleted_at FROM livros WHERE id = ?').get(livroId) as
      { id: number; deleted_at: string | null } | undefined
    if (livro === undefined || livro.deleted_at !== null) throw ErroDeDominio.naoEncontrado('Livro não encontrado.')

    const ativas = this.db.prepare(`
      SELECT COUNT(*) AS total FROM reservas
      WHERE leitor_id = ? AND status IN ('aguardando','disponivel_para_retirada')
    `).get(leitorId) as { total: number }
    if (ativas.total >= politica.limiteReservasAtivas) {
      throw ErroDeDominio.conflito(`Este leitor já atingiu o limite de ${politica.limiteReservasAtivas} reservas ativas.`)
    }
    const disponiveis = this.db.prepare("SELECT COUNT(*) AS total FROM exemplares WHERE livro_id = ? AND status = 'disponivel' AND deleted_at IS NULL")
      .get(livroId) as { total: number }
    if (disponiveis.total > 0) {
      throw ErroDeDominio.conflito('Este livro tem exemplar disponível. Use o agendamento para escolher um dia.')
    }

    const id = this.repos.reservas.criar({
      livroId, leitorId, registradoPorUsuarioId: usuarioId,
      entradaEm: agoraIso(), status: 'aguardando', atualizadoEm: agoraIso()
    })
    return this.reservaPorId(id)
  }

  async promoverAposDevolucao(resultado: DepositoDevolucao): Promise<void> {
    const proxima = this.db.prepare(`
      SELECT r.id FROM reservas r
      JOIN leitores le ON le.id = r.leitor_id AND le.deleted_at IS NULL AND le.ativo = 1
      WHERE r.livro_id = ? AND r.status = 'aguardando'
      ORDER BY r.entrada_em, r.id LIMIT 1
    `).get(resultado.livroId) as { id: number } | undefined
    if (proxima === undefined) return

    const politica = this.configuracoes.obter()
    const inicio = agoraIso()
    let fim = dataHoraMaisHoras(inicio, politica.prazoRetiradaHoras)
    try {
      const feriados = await this.brasilApi.feriados(Number(fim.slice(0, 4)))
      const datas = feriados.map((feriado) => feriado.data)
      const dataAjustada = proximoDiaUtil(fim.slice(0, 10), datas)
      if (dataAjustada !== fim.slice(0, 10)) fim = `${dataAjustada}T23:59:59Z`
    } catch {
      // Sem feriados disponíveis, vale o prazo corrido de 24 horas.
    }

    this.repos.reservas.atualizar(proxima.id, {
      status: 'disponivel_para_retirada',
      exemplarDestinadoId: resultado.exemplarId,
      notificadoEm: inicio,
      prazoRetiradaInicio: inicio,
      prazoRetiradaFim: fim,
      atualizadoEm: inicio
    })
    this.repos.exemplares.atualizar(resultado.exemplarId, { status: 'reservado', atualizadoEm: inicio })
    await this.avisarReserva(proxima.id)
  }

  private async avisarReserva(id: number): Promise<void> {
    const reserva = this.reservaPorId(id)
    const leitor = this.db.prepare('SELECT nome, email FROM leitores WHERE id = ? AND deleted_at IS NULL AND ativo = 1')
      .get(reserva.leitorId) as { nome: string; email: string | null } | undefined
    if (leitor === undefined || leitor.email === null || leitor.email === '') return
    await this.notificacoes.registrar({
      leitorId: reserva.leitorId,
      tipo: 'reserva_disponivel',
      destinatario: leitor.email,
      assunto: `O livro "${reserva.tituloLivro ?? ''}" chegou na biblioteca`,
      mensagem: `Olá, ${leitor.nome}! O livro que você reservou está disponível. Você tem até ${reserva.prazoRetiradaFim} para retirar. Se não vier, o exemplar volta para a fila.`,
      chaveIdempotencia: `reserva-disponivel-${reserva.id}`,
      reservaId: reserva.id
    })
  }

  registrarRetirada(id: number, usuarioId: number): Reserva {
    const reserva = this.reservaPorId(id)
    if (reserva.status !== 'disponivel_para_retirada') {
      throw ErroDeDominio.conflito('Esta reserva ainda não está disponível para retirada.')
    }
    if (reserva.exemplarDestinadoId === null) throw ErroDeDominio.conflito('Exemplar reservado não identificado.')
    const agora = agoraIso()
    if (reserva.prazoRetiradaFim !== null && reserva.prazoRetiradaFim < agora) {
      this.expirar(id)
      throw ErroDeDominio.conflito('O prazo de retirada venceu. O livro voltou para a fila.')
    }
    const ativos = this.db.prepare("SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ? AND status = 'aberto'")
      .get(reserva.leitorId) as { total: number }
    if (ativos.total >= this.configuracoes.obter().limiteExemplaresPorLeitor) {
      throw ErroDeDominio.conflito('O leitor atingiu o limite de empréstimos ativos.')
    }
    const data = hoje()
    this.db.transaction(() => {
      const idEmprestimo = this.repos.emprestimos.criar({
        exemplarId: reserva.exemplarDestinadoId,
        leitorId: reserva.leitorId,
        registradoPorUsuarioId: usuarioId,
        dataEmprestimo: data,
        dataDevolucaoPrevista: adicionarDias(data, this.configuracoes.obter().prazoEmprestimoDias),
        status: 'aberto', renovacoes: 0, criadoEm: agora
      })
      this.repos.reservas.atualizar(id, { status: 'retirado', emprestimoId: idEmprestimo, atualizadoEm: agora })
      this.repos.exemplares.atualizar(reserva.exemplarDestinadoId as number, { status: 'emprestado', atualizadoEm: agora })
    })()
    return this.reservaPorId(id)
  }

  cancelar(id: number): void {
    const reserva = this.reservaPorId(id)
    if (!['aguardando', 'disponivel_para_retirada'].includes(reserva.status)) {
      throw ErroDeDominio.conflito('Esta reserva já foi encerrada.')
    }
    const exemplar = reserva.exemplarDestinadoId
    this.repos.reservas.atualizar(id, { status: 'cancelado', atualizadoEm: agoraIso() })
    if (exemplar !== null) {
      this.repos.exemplares.atualizar(exemplar, { status: 'disponivel', atualizadoEm: agoraIso() })
    }
  }

  expirar(id: number): void {
    const reserva = this.reservaPorId(id)
    if (reserva.status !== 'disponivel_para_retirada') return
    const exemplar = reserva.exemplarDestinadoId
    this.repos.reservas.atualizar(id, { status: 'expirado', atualizadoEm: agoraIso() })
    if (exemplar !== null) {
      this.repos.exemplares.atualizar(exemplar, { status: 'disponivel', atualizadoEm: agoraIso() })
    }
  }

  async expirarVencidas(): Promise<number> {
    const vencidas = this.db.prepare(`
      SELECT id FROM reservas WHERE status = 'disponivel_para_retirada'
      AND prazo_retirada_fim IS NOT NULL AND prazo_retirada_fim < ?
    `).all(agoraIso()) as Array<{ id: number }>
    for (const linha of vencidas) {
      const reserva = this.reservaPorId(linha.id)
      this.expirar(linha.id)
      if (reserva.exemplarDestinadoId !== null) {
        await this.promoverAposDevolucao({
          exemplarId: reserva.exemplarDestinadoId,
          livroId: reserva.livroId,
          leitorId: reserva.leitorId,
          emprestimoId: 0,
          diasAtraso: 0,
          multaId: null,
          valorMultaCentavos: 0
        })
      }
      const email = this.emailDoLeitor(reserva.leitorId)
      if (email !== null) {
        await this.notificacoes.registrar({
          leitorId: reserva.leitorId,
          tipo: 'expiracao_reserva',
          destinatario: email,
          assunto: 'Reserva expirada',
          mensagem: `O prazo para retirar "${reserva.tituloLivro ?? 'o livro'}" terminou. O exemplar voltou para a fila.`,
          chaveIdempotencia: `reserva-expirada-${reserva.id}`,
          reservaId: reserva.id
        })
      }
    }
    return vencidas.length
  }

  listarAgendamentos(
    filtro: { leitorId?: number; exemplarId?: number; situacao?: SituacaoRegistro } = {}
  ): Agendamento[] {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(filtro.situacao),
      "a.status = 'ativo'",
      "a.status IN ('retirado', 'expirado', 'cancelado')"
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    if (filtro.leitorId !== undefined) { condicoes.push('a.leitor_id = ?'); parametros.push(filtro.leitorId) }
    if (filtro.exemplarId !== undefined) { condicoes.push('a.exemplar_id = ?'); parametros.push(filtro.exemplarId) }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const linhas = this.db.prepare(`${SELECT_AGENDAMENTO}${where} ORDER BY a.data_agendada DESC`).all(...parametros) as Array<Record<string, unknown>>
    return linhas.map(mapearAgendamento)
  }

  agendamentoPorId(id: number): Agendamento {
    const linha = this.db.prepare(`${SELECT_AGENDAMENTO} WHERE a.id = ?`).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Agendamento não encontrado.')
    return mapearAgendamento(linha)
  }

  criarAgendamento(dados: { leitorId?: unknown; exemplarId?: unknown; dataAgendada?: unknown }, usuarioId: number): Agendamento {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    const exemplarId = Validador.inteiro(dados.exemplarId, 'exemplarId', { obrigatorio: true, min: 1 })
    const data = Validador.data(dados.dataAgendada, 'dataAgendada', true)
    if (leitorId === undefined || exemplarId === undefined || data === undefined) throw ErroDeDominio.validacao('Informe leitor, exemplar e data.')
    const politica = this.configuracoes.obter()
    const hojeData = hoje()
    if (data < hojeData || data > adicionarDias(hojeData, politica.diasMaxAgendamento)) {
      throw ErroDeDominio.validacao(`Escolha uma data entre hoje e ${adicionarDias(hojeData, politica.diasMaxAgendamento)}.`)
    }
    const leitor = this.db.prepare('SELECT id, ativo, deleted_at FROM leitores WHERE id = ?').get(leitorId) as
      { id: number; ativo: number; deleted_at: string | null } | undefined
    if (leitor === undefined || leitor.deleted_at !== null || leitor.ativo !== 1) {
      throw ErroDeDominio.validacao('Este leitor não está ativo.', { leitorId: 'Escolha um leitor ativo.' })
    }
    const exemplar = this.db.prepare('SELECT id, status, deleted_at FROM exemplares WHERE id = ?').get(exemplarId) as
      { id: number; status: string; deleted_at: string | null } | undefined
    if (exemplar === undefined || exemplar.deleted_at !== null) throw ErroDeDominio.naoEncontrado('Exemplar não encontrado.')
    if (exemplar.status !== 'disponivel') throw ErroDeDominio.conflito('Este exemplar não está disponível para agendamento.')
    const ativas = this.db.prepare(`
      SELECT COUNT(*) AS total FROM reservas WHERE leitor_id = ? AND status IN ('aguardando','disponivel_para_retirada')
    `).get(leitorId) as { total: number }
    const agendamentosAtivos = this.db.prepare("SELECT COUNT(*) AS total FROM agendamentos WHERE leitor_id = ? AND status = 'ativo'")
      .get(leitorId) as { total: number }
    if (ativas.total + agendamentosAtivos.total >= politica.limiteReservasAtivas) {
      throw ErroDeDominio.conflito(`Este leitor já atingiu o limite de ${politica.limiteReservasAtivas} reservas ativas.`)
    }
    const agora = agoraIso()
    const id = this.db.transaction(() => {
      const agendamentoId = this.repos.agendamentos.criar({
        exemplarId, leitorId, registradoPorUsuarioId: usuarioId, dataAgendada: data,
        validadeAte: `${data}T23:59:59Z`, status: 'ativo', criadoEm: agora, atualizadoEm: agora
      })
      this.repos.exemplares.atualizar(exemplarId, { status: 'agendado', atualizadoEm: agora })
      return agendamentoId
    })()
    return this.agendamentoPorId(id)
  }

  retirarAgendamento(id: number, usuarioId: number): Agendamento {
    const agendamento = this.agendamentoPorId(id)
    if (agendamento.status !== 'ativo') throw ErroDeDominio.conflito('Este agendamento não está ativo.')
    if (agendamento.validadeAte < agoraIso()) {
      this.cancelarAgendamento(id)
      throw ErroDeDominio.conflito('O prazo deste agendamento terminou.')
    }
    const data = hoje()
    this.db.transaction(() => {
      const idEmprestimo = this.repos.emprestimos.criar({
        exemplarId: agendamento.exemplarId, leitorId: agendamento.leitorId,
        registradoPorUsuarioId: usuarioId, dataEmprestimo: data,
        dataDevolucaoPrevista: adicionarDias(data, this.configuracoes.obter().prazoEmprestimoDias),
        status: 'aberto', renovacoes: 0, criadoEm: agoraIso()
      })
      this.repos.agendamentos.atualizar(id, { status: 'retirado', emprestimoId: idEmprestimo, atualizadoEm: agoraIso() })
      this.repos.exemplares.atualizar(agendamento.exemplarId, { status: 'emprestado', atualizadoEm: agoraIso() })
    })()
    return this.agendamentoPorId(id)
  }

  cancelarAgendamento(id: number): void {
    const agendamento = this.agendamentoPorId(id)
    if (agendamento.status !== 'ativo') return
    this.db.transaction(() => {
      this.repos.agendamentos.atualizar(id, { status: 'cancelado', atualizadoEm: agoraIso() })
      this.repos.exemplares.atualizar(agendamento.exemplarId, { status: 'disponivel', atualizadoEm: agoraIso() })
    })()
  }

  expirarAgendamentos(): number {
    const vencidos = this.db.prepare("SELECT id FROM agendamentos WHERE status = 'ativo' AND validade_ate < ?")
      .all(agoraIso()) as Array<{ id: number }>
    for (const linha of vencidos) {
      const agendamento = this.agendamentoPorId(linha.id)
      this.db.transaction(() => {
        this.repos.agendamentos.atualizar(linha.id, { status: 'expirado', atualizadoEm: agoraIso() })
        this.repos.exemplares.atualizar(agendamento.exemplarId, { status: 'disponivel', atualizadoEm: agoraIso() })
      })()
    }
    return vencidos.length
  }

  private emailDoLeitor(id: number): string | null {
    const linha = this.db.prepare('SELECT email FROM leitores WHERE id = ? AND deleted_at IS NULL AND ativo = 1').get(id) as { email: string | null } | undefined
    return linha?.email ?? null
  }
}
