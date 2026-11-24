import type { CanalNotificacao, Notificacao, SituacaoRegistro, TipoNotificacao } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { FabricanteRepositorios } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'
import { Notificador } from '../integracoes/notificador.js'
import { cifrarTexto, mascararEmail } from '../seguranca/cpf.js'
import { mapearNotificacao, hojeIso } from './mapeamento.js'
import { condicaoSituacao, normalizarSituacao } from './situacao.js'
import { Validador } from './validacao.js'

interface OpcoesRegistro {
  leitorId: number
  tipo: TipoNotificacao
  canal?: CanalNotificacao
  destinatario: string
  assunto: string
  mensagem: string
  chaveIdempotencia: string
  emprestimoId?: number | null
  reservaId?: number | null
  multaId?: number | null
}

interface FiltroNotificacao {
  leitorId?: number
  situacao?: SituacaoRegistro
  status?: string
  tipo?: string
  pagina?: number
  porPagina?: number
}

const TIPOS: readonly TipoNotificacao[] = [
  'ativacao', 'lembrete_vencimento', 'atraso', 'reserva_disponivel', 'multa', 'expiracao_reserva'
]

export class ServicoNotificacoes {
  constructor(
    private readonly db: Banco,
    private readonly repos: FabricanteRepositorios,
    private readonly notificador: Notificador,
    private readonly chaveCifragem: Buffer
  ) {}

  private readonly SELECT = `
    SELECT n.*,
      CASE WHEN le.deleted_at IS NULL THEN n.assunto ELSE 'Aviso arquivado' END AS assunto,
      CASE WHEN le.deleted_at IS NULL THEN n.mensagem ELSE 'Esta mensagem foi arquivada após a inativação do leitor.' END AS mensagem
    FROM notificacoes n
    LEFT JOIN leitores le ON le.id = n.leitor_id
  `

  listar(filtro: FiltroNotificacao = {}): { itens: Notificacao[]; total: number } {
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(filtro.situacao),
      "n.status = 'pendente'",
      "n.status IN ('enviada', 'falhou', 'reenviada')"
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: Array<string | number> = []
    if (filtro.leitorId !== undefined) {
      condicoes.push('n.leitor_id = ?')
      parametros.push(filtro.leitorId)
    }
    if (filtro.status !== undefined) {
      condicoes.push('n.status = ?')
      parametros.push(filtro.status)
    }
    if (filtro.tipo !== undefined) {
      condicoes.push('n.tipo = ?')
      parametros.push(filtro.tipo)
    }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM notificacoes n${where}`).get(...parametros) as { total: number }).total
    const porPagina = Math.min(Math.max(filtro.porPagina ?? 50, 1), 100)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const linhas = this.db.prepare(`${this.SELECT}${where} ORDER BY n.criado_em DESC LIMIT ? OFFSET ?`)
      .all(...parametros, porPagina, (pagina - 1) * porPagina) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearNotificacao), total }
  }

  notificacaoPorId(id: number): Notificacao {
    const linha = this.db.prepare(`${this.SELECT} WHERE n.id = ?`).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Notificação não encontrada.')
    return mapearNotificacao(linha)
  }

  async registrar(opcoes: OpcoesRegistro): Promise<Notificacao> {
    const existente = this.db.prepare('SELECT id FROM notificacoes WHERE chave_idempotencia = ?')
      .get(opcoes.chaveIdempotencia) as { id: number } | undefined
    if (existente !== undefined) return this.notificacaoPorId(existente.id)

    const canal = opcoes.canal ?? 'email'
    const tipo = Validador.enum(opcoes.tipo, 'tipo', TIPOS, true) as TipoNotificacao
    const agora = hojeIso()
    const id = this.repos.notificacoes.criar({
      leitorId: opcoes.leitorId,
      tipo,
      canal,
      status: 'pendente',
      chaveIdempotencia: opcoes.chaveIdempotencia,
      destinatarioCifrado: cifrarTexto(opcoes.destinatario, this.chaveCifragem),
      destinatarioMascara: this.mascarar(opcoes.destinatario),
      emprestimoId: opcoes.emprestimoId ?? null,
      reservaId: opcoes.reservaId ?? null,
      multaId: opcoes.multaId ?? null,
      assunto: Validador.texto(opcoes.assunto, 'assunto', { obrigatorio: true, max: 150 }) ?? 'Aviso da biblioteca',
      mensagem: Validador.texto(opcoes.mensagem, 'mensagem', { obrigatorio: true, max: 2000 }) ?? 'Aviso da biblioteca.',
      criadoEm: agora,
      tentativas: 0
    })

    if (canal === 'email') await this.enviar(id)
    return this.notificacaoPorId(id)
  }

  private async enviar(id: number): Promise<void> {
    const linha = this.db.prepare('SELECT * FROM notificacoes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (linha === undefined) return
    const leitorId = Number(linha.leitor_id)
    const leitor = this.db.prepare('SELECT email, deleted_at, ativo FROM leitores WHERE id = ?').get(leitorId) as
      { email: string | null; deleted_at: string | null; ativo: number } | undefined
    if (leitor === undefined || leitor.deleted_at !== null || leitor.ativo !== 1) {
      this.repos.notificacoes.atualizar(id, { status: 'falhou', erroResumo: 'Conta do leitor inativada.' })
      return
    }
    const destinatario = leitor.email
    if (destinatario === undefined || destinatario === null || destinatario === '') {
      this.repos.notificacoes.atualizar(id, { status: 'falhou', erroResumo: 'Leitor sem e-mail cadastrado.' })
      return
    }
    const resultado = await this.notificador.enviar(
      destinatario,
      String(linha.assunto),
      String(linha.mensagem)
    )
    this.repos.notificacoes.atualizar(id, {
      status: resultado.enviado ? (Number(linha.tentativas) > 0 ? 'reenviada' : 'enviada') : 'falhou',
      enviadoEm: resultado.enviado ? hojeIso() : null,
      erroResumo: resultado.enviado ? null : (resultado.detalhe ?? 'Falha no envio.'),
      tentativas: Number(linha.tentativas) + 1
    })
  }

  async reenviar(id: number): Promise<Notificacao> {
    this.notificacaoPorId(id)
    await this.enviar(id)
    return this.notificacaoPorId(id)
  }

  async criarManual(dados: { leitorId?: unknown; tipo?: unknown; mensagem?: unknown }): Promise<Notificacao> {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    if (leitorId === undefined) throw ErroDeDominio.validacao('Informe o leitor.')
    const leitor = this.db.prepare('SELECT id, email, nome FROM leitores WHERE id = ? AND deleted_at IS NULL').get(leitorId) as
      { id: number; email: string | null; nome: string } | undefined
    if (leitor === undefined) throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
    if (leitor.email === null || leitor.email === '') throw ErroDeDominio.validacao('Este leitor não possui e-mail cadastrado.')
    const tipo = Validador.enum(dados.tipo, 'tipo', TIPOS, true) as TipoNotificacao
    const mensagem = Validador.texto(dados.mensagem, 'mensagem', { obrigatorio: true, min: 3, max: 2000 }) ?? ''
    return this.registrar({
      leitorId,
      tipo,
      destinatario: leitor.email,
      assunto: 'Aviso da biblioteca comunitária',
      mensagem,
      chaveIdempotencia: `manual-${leitorId}-${Date.now()}`
    })
  }

  cancelar(id: number): void {
    this.notificacaoPorId(id)
    this.repos.notificacoes.atualizar(id, { status: 'falhou', erroResumo: 'Cancelada pelo administrador.' })
  }

  private mascarar(destinatario: string): string {
    if (destinatario.includes('@')) return mascararEmail(destinatario)
    const digitos = destinatario.replace(/\D/g, '')
    if (digitos.length < 4) return '***'
    return `+${digitos.slice(0, 2)} ****-${digitos.slice(-4)}`
  }
}
