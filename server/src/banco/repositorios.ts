import type { Banco } from './conexao.js'
import { ErroDeDominio } from '../erros.js'

export type ParametroSql = string | number | Buffer | null

export interface FiltroLista {
  where?: string
  parametros?: ParametroSql[]
  ordem?: string
  limite?: number
  offset?: number
}

interface OpcoesRepositorio {
  ordenarPadrao?: string
  colunaInativacao?: 'deleted_at' | 'status'
  valorInativacao?: string
}

function eParametro(valor: unknown): valor is ParametroSql {
  return valor === null || typeof valor === 'string' || typeof valor === 'number' || Buffer.isBuffer(valor)
}

/**
 * Repositório genérico. Nomes de coluna vêm sempre da lista permitida e
 * valores são passados como parâmetros: nenhum SQL é montado com entrada do usuário.
 */
export class Repositorio<T> {
  constructor(
    protected readonly db: Banco,
    protected readonly tabela: string,
    protected readonly colunas: Readonly<Record<string, string>>,
    protected readonly opcoes: OpcoesRepositorio = {}
  ) {}

  listar(filtro: FiltroLista = {}): T[] {
    const sql = `SELECT * FROM ${this.tabela}` +
      (filtro.where === undefined ? '' : ` WHERE ${filtro.where}`) +
      ` ORDER BY ${filtro.ordem ?? this.opcoes.ordenarPadrao ?? 'id DESC'}` +
      (filtro.limite === undefined ? '' : ' LIMIT ? OFFSET ?')
    const parametros = filtro.parametros ?? []
    const finais = filtro.limite === undefined
      ? parametros
      : [...parametros, filtro.limite, filtro.offset ?? 0]
    return this.db.prepare(sql).all(...finais) as T[]
  }

  contar(where = '', parametros: ParametroSql[] = []): number {
    const sql = `SELECT COUNT(*) AS total FROM ${this.tabela}` + (where === '' ? '' : ` WHERE ${where}`)
    const linha = this.db.prepare(sql).get(...parametros) as { total: number }
    return linha.total
  }

  porId(id: number): T | undefined {
    return this.db.prepare(`SELECT * FROM ${this.tabela} WHERE id = ?`).get(id) as T | undefined
  }

  criar(dados: Record<string, unknown>): number {
    const pares = this.paresPermitidos(dados)
    if (pares.length === 0) throw ErroDeDominio.validacao('Nenhum campo válido foi informado.')
    const nomes = pares.map((par) => par.coluna).join(', ')
    const Marcadores = pares.map(() => '?').join(', ')
    const resultado = this.db.prepare(
      `INSERT INTO ${this.tabela} (${nomes}) VALUES (${Marcadores})`
    ).run(...pares.map((par) => par.valor))
    return Number(resultado.lastInsertRowid)
  }

  atualizar(id: number, dados: Record<string, unknown>): void {
    const pares = this.paresPermitidos(dados)
    if (pares.length === 0) throw ErroDeDominio.validacao('Nenhum campo permitido foi informado para alteração.')
    const atribuicoes = pares.map((par) => `${par.coluna} = ?`).join(', ')
    this.db.prepare(`UPDATE ${this.tabela} SET ${atribuicoes} WHERE id = ?`)
      .run(...pares.map((par) => par.valor), id)
  }

  inativar(id: number): void {
    const coluna = this.opcoes.colunaInativacao ?? 'deleted_at'
    const valor = this.opcoes.valorInativacao ?? new Date().toISOString()
    this.db.prepare(`UPDATE ${this.tabela} SET ${coluna} = ? WHERE id = ?`).run(valor, id)
  }

  executar(sql: string, parametros: ParametroSql[] = []): void {
    this.db.prepare(sql).run(...parametros)
  }

  private paresPermitidos(dados: Record<string, unknown>): Array<{ coluna: string; valor: ParametroSql }> {
    const pares: Array<{ coluna: string; valor: ParametroSql }> = []
    for (const [chave, valor] of Object.entries(dados)) {
      if (valor === undefined) continue
      const coluna = this.colunas[chave]
      if (coluna === undefined || !eParametro(valor)) continue
      pares.push({ coluna, valor })
    }
    return pares
  }
}

/** Fábrica de repositórios usada pelos serviços. */
export class FabricanteRepositorios {
  readonly autores: Repositorio<{ id: number; nome: string; deleted_at: string | null }>
  readonly editoras: Repositorio<{ id: number; nome: string; deleted_at: string | null }>
  readonly categorias: Repositorio<{ id: number; nome: string; deleted_at: string | null }>
  readonly livros: Repositorio<Record<string, unknown>>
  readonly exemplares: Repositorio<Record<string, unknown>>
  readonly leitores: Repositorio<Record<string, unknown>>
  readonly enderecos: Repositorio<Record<string, unknown>>
  readonly usuarios: Repositorio<Record<string, unknown>>
  readonly emprestimos: Repositorio<Record<string, unknown>>
  readonly reservas: Repositorio<Record<string, unknown>>
  readonly agendamentos: Repositorio<Record<string, unknown>>
  readonly multas: Repositorio<Record<string, unknown>>
  readonly pagamentos: Repositorio<Record<string, unknown>>
  readonly notificacoes: Repositorio<Record<string, unknown>>
  readonly consentimentos: Repositorio<Record<string, unknown>>
  readonly auditoria: Repositorio<Record<string, unknown>>

  constructor(db: Banco) {
    this.autores = new Repositorio(db, 'autores', { nome: 'nome', deletedAt: 'deleted_at', criadoEm: 'criado_em' }, { ordenarPadrao: 'nome ASC' })
    this.editoras = new Repositorio(db, 'editoras', { nome: 'nome', deletedAt: 'deleted_at', criadoEm: 'criado_em' }, { ordenarPadrao: 'nome ASC' })
    this.categorias = new Repositorio(db, 'categorias', { nome: 'nome', deletedAt: 'deleted_at', criadoEm: 'criado_em' }, { ordenarPadrao: 'nome ASC' })
    this.livros = new Repositorio(db, 'livros', {
      titulo: 'titulo', subtitulo: 'subtitulo', isbn10: 'isbn10', isbn13: 'isbn13', editoraId: 'editora_id',
      anoPublicacao: 'ano_publicacao', descricaoCurta: 'descricao_curta', capaUrl: 'capa_url', idioma: 'idioma',
      criadoEm: 'criado_em', atualizadoEm: 'atualizado_em', deletedAt: 'deleted_at'
    }, { ordenarPadrao: 'titulo ASC' })
    this.exemplares = new Repositorio(db, 'exemplares', {
      livroId: 'livro_id', codigoTombamento: 'codigo_tombamento', estadoConservacao: 'estado_conservacao',
      status: 'status', localizacao: 'localizacao', adquiridoEm: 'adquirido_em',
      criadoEm: 'criado_em', atualizadoEm: 'atualizado_em', deletedAt: 'deleted_at'
    }, { ordenarPadrao: 'codigo_tombamento ASC' })
    this.leitores = new Repositorio(db, 'leitores', {
      nome: 'nome', cpfCifrado: 'cpf_cifrado', cpfHash: 'cpf_hash', cpfMascara: 'cpf_mascara',
      email: 'email', telefone: 'telefone', ativo: 'ativo', criadoEm: 'criado_em',
      atualizadoEm: 'atualizado_em', deletedAt: 'deleted_at', excluidoEm: 'excluido_em'
    }, { ordenarPadrao: 'nome ASC' })
    this.enderecos = new Repositorio(db, 'enderecos', {
      leitorId: 'leitor_id', cep: 'cep', logradouro: 'logradouro', numero: 'numero',
      complemento: 'complemento', bairro: 'bairro', cidade: 'cidade', uf: 'uf', atualizadoEm: 'atualizado_em'
    })
    this.usuarios = new Repositorio(db, 'usuarios', {
      leitorId: 'leitor_id', nome: 'nome', email: 'email', senhaHash: 'senha_hash', perfil: 'perfil',
      ativo: 'ativo', somenteLeitura: 'somente_leitura',
      codigoAtivacaoHash: 'codigo_ativacao_hash', codigoAtivacaoExpiraEm: 'codigo_ativacao_expira_em',
      codigoAtivacaoUsadoEm: 'codigo_ativacao_usado_em', emailVerificadoEm: 'email_verificado_em',
      verificacaoCodigoHash: 'verificacao_codigo_hash', verificacaoExpiraEm: 'verificacao_expira_em',
      verificacaoTentativas: 'verificacao_tentativas', verificacaoEnviadoEm: 'verificacao_enviado_em',
      ultimoLoginEm: 'ultimo_login_em',
      criadoEm: 'criado_em', atualizadoEm: 'atualizado_em', deletedAt: 'deleted_at'
    }, { ordenarPadrao: 'nome ASC' })
    this.emprestimos = new Repositorio(db, 'emprestimos', {
      exemplarId: 'exemplar_id', leitorId: 'leitor_id', registradoPorUsuarioId: 'registrado_por_usuario_id',
      dataEmprestimo: 'data_emprestimo', dataDevolucaoPrevista: 'data_devolucao_prevista',
      dataDevolucaoReal: 'data_devolucao_real', renovacoes: 'renovacoes', status: 'status',
      observacao: 'observacao', criadoEm: 'criado_em'
    }, { ordenarPadrao: 'data_emprestimo DESC', colunaInativacao: 'status', valorInativacao: 'cancelado' })
    this.reservas = new Repositorio(db, 'reservas', {
      livroId: 'livro_id', leitorId: 'leitor_id', registradoPorUsuarioId: 'registrado_por_usuario_id',
      entradaEm: 'entrada_em', status: 'status', notificadoEm: 'notificado_em',
      prazoRetiradaInicio: 'prazo_retirada_inicio', prazoRetiradaFim: 'prazo_retirada_fim',
      exemplarDestinadoId: 'exemplar_destinado_id', emprestimoId: 'emprestimo_id', atualizadoEm: 'atualizado_em'
    }, { ordenarPadrao: 'entrada_em ASC', colunaInativacao: 'status', valorInativacao: 'cancelado' })
    this.agendamentos = new Repositorio(db, 'agendamentos', {
      exemplarId: 'exemplar_id', leitorId: 'leitor_id', registradoPorUsuarioId: 'registrado_por_usuario_id',
      dataAgendada: 'data_agendada', validadeAte: 'validade_ate', status: 'status',
      emprestimoId: 'emprestimo_id', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em'
    }, { ordenarPadrao: 'data_agendada DESC', colunaInativacao: 'status', valorInativacao: 'cancelado' })
    this.multas = new Repositorio(db, 'multas', {
      emprestimoId: 'emprestimo_id', leitorId: 'leitor_id', diasAtraso: 'dias_atraso',
      valorDiarioCentavos: 'valor_diario_centavos', tetoCentavos: 'teto_centavos',
      valorCentavos: 'valor_centavos', status: 'status', registradaEm: 'registrada_em',
      perdaoMotivo: 'perdao_motivo', perdaoPorUsuarioId: 'perdao_por_usuario_id', perdaoEm: 'perdao_em'
    }, { ordenarPadrao: 'registrada_em DESC', colunaInativacao: 'status', valorInativacao: 'estornada' })
    this.pagamentos = new Repositorio(db, 'pagamentos_multa', {
      multaId: 'multa_id', valorCentavos: 'valor_centavos', forma: 'forma',
      registradoPorUsuarioId: 'registrado_por_usuario_id', registradoEm: 'registrado_em', comprovante: 'comprovante'
    }, { ordenarPadrao: 'registrado_em DESC' })
    this.notificacoes = new Repositorio(db, 'notificacoes', {
      leitorId: 'leitor_id', usuarioDestinatarioId: 'usuario_destinatario_id', tipo: 'tipo', canal: 'canal',
      status: 'status', chaveIdempotencia: 'chave_idempotencia', destinatarioCifrado: 'destinatario_cifrado',
      destinatarioMascara: 'destinatario_mascara', emprestimoId: 'emprestimo_id', reservaId: 'reserva_id',
      multaId: 'multa_id', assunto: 'assunto', mensagem: 'mensagem', criadoEm: 'criado_em',
      enviadoEm: 'enviado_em', erroResumo: 'erro_resumo', tentativas: 'tentativas'
    }, { ordenarPadrao: 'criado_em DESC', colunaInativacao: 'status', valorInativacao: 'falhou' })
    this.consentimentos = new Repositorio(db, 'consentimentos_whatsapp', {
      leitorId: 'leitor_id', telefoneCifrado: 'telefone_cifrado', telefoneMascara: 'telefone_mascara',
      consentimento: 'consentimento', registradoEm: 'registrado_em', revogadoEm: 'revogado_em', origem: 'origem'
    }, { ordenarPadrao: 'registrado_em DESC' })
    this.auditoria = new Repositorio(db, 'configuracoes_auditoria', {
      configuracaoId: 'configuracao_id', alteradoPorUsuarioId: 'alterado_por_usuario_id',
      alteradoEm: 'alterado_em', campo: 'campo', valorAnterior: 'valor_anterior', valorNovo: 'valor_novo'
    }, { ordenarPadrao: 'alterado_em DESC' })
  }
}
