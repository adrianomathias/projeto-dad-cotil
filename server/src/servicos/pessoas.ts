import { createHash, randomInt } from 'node:crypto'
import type {
  Convite, Endereco, Leitor, SituacaoRegistro, TrocaAdministradorResposta, Usuario, UsuarioLogado
} from '@biblioteca/shared'
import { validarEmailPermitido } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { FabricanteRepositorios, type ParametroSql } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'
import type { ConsultaCpfExterno } from '../integracoes/consulta-cpf.js'
import { cifrarTexto, hashCpf, mascararCpf, somenteDigitos } from '../seguranca/cpf.js'
import { mapearEndereco, mapearLeitor, mapearUsuario, hojeIso } from './mapeamento.js'
import { condicaoSituacao, normalizarSituacao } from './situacao.js'
import { Validador } from './validacao.js'

interface DadosLeitor {
  nome?: unknown
  cpf?: unknown
  email?: unknown
  telefone?: unknown
  cep?: unknown
  logradouro?: unknown
  numero?: unknown
  complemento?: unknown
  bairro?: unknown
  cidade?: unknown
  uf?: unknown
}

interface DadosUsuario {
  nome?: unknown
  email?: unknown
  perfil?: unknown
  leitorId?: unknown
  senha?: unknown
  ativo?: unknown
}

interface DadosCadastroLeitor extends DadosLeitor {
  senha?: unknown
}

interface DadosCadastroEquipe {
  codigo?: unknown
  nome?: unknown
  email?: unknown
  senha?: unknown
}

interface DadosConvite {
  perfil?: unknown
  email?: unknown
  criadoPorUsuarioId?: unknown
}

interface DadosEndereco {
  leitorId?: unknown
  cep?: unknown
  logradouro?: unknown
  numero?: unknown
  complemento?: unknown
  bairro?: unknown
  cidade?: unknown
  uf?: unknown
}

export interface ChavesPessoas {
  cpfCriptografia: Buffer
  cpfHmac: Buffer
}

export interface OpcoesPessoas {
  chaves: ChavesPessoas
  gerarHashSenha: (senha: string) => string
  avisarAtivacao?: (email: string, codigo: string) => void
  consultaCpf?: ConsultaCpfExterno
  validarCpfExterno?: boolean
}

const PERFIS = ['ADMIN', 'LEITOR'] as const

type CadastroCriado = { mensagem: string; usuario: UsuarioLogado }

export class ServicoPessoas {
  private readonly consultaCpf?: ConsultaCpfExterno
  private readonly validarCpfExterno: boolean

  constructor(
    private readonly db: Banco,
    private readonly repos: FabricanteRepositorios,
    private readonly opcoes: OpcoesPessoas
  ) {
    this.consultaCpf = opcoes.consultaCpf
    this.validarCpfExterno = opcoes.validarCpfExterno ?? true
  }

  private get chaves(): ChavesPessoas {
    return this.opcoes.chaves
  }

  private get gerarHashSenha(): (senha: string) => string {
    return this.opcoes.gerarHashSenha
  }

  listarLeitores(
    q?: string,
    situacao: SituacaoRegistro | boolean = 'todos',
    pagina = 1,
    porPagina = 50
  ): { itens: Leitor[]; total: number; pagina: number; porPagina: number } {
    const condicoes = ['l.excluido_em IS NULL']
    const condicao = condicaoSituacao(
      normalizarSituacao(situacao),
      'l.deleted_at IS NULL AND l.ativo = 1',
      '(l.deleted_at IS NOT NULL OR l.ativo = 0)'
    )
    if (condicao !== undefined) condicoes.push(condicao)
    const parametros: ParametroSql[] = []
    const termo = Validador.texto(q, 'q', { max: 120 })
    if (termo !== undefined) {
      const digitos = somenteDigitos(termo)
      if (digitos.length >= 3 && digitos.length <= 11) {
        condicoes.push('(l.nome LIKE ? OR l.cpf_hash = ?)')
        parametros.push(`%${termo}%`, hashCpf(digitos, this.chaves.cpfHmac))
      } else {
        condicoes.push('l.nome LIKE ?')
        parametros.push(`%${termo}%`)
      }
    }
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM leitores l${where}`).get(...parametros) as { total: number }).total
    const limite = Math.min(Math.max(porPagina, 1), 100)
    const paginaSegura = Math.max(pagina, 1)
    const linhas = this.db.prepare(`
      SELECT l.*, e.id AS endereco_id, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf,
        (SELECT COUNT(*) FROM emprestimos emp WHERE emp.leitor_id = l.id AND emp.status = 'aberto') AS emprestimos_ativos,
        (SELECT COUNT(*) FROM reservas r WHERE r.leitor_id = l.id AND r.status IN ('aguardando','disponivel_para_retirada')) AS reservas_ativas,
        (SELECT COALESCE(SUM(m.valor_centavos), 0) FROM multas m WHERE m.leitor_id = l.id AND m.status = 'pendente') AS multa_em_aberto_centavos
      FROM leitores l LEFT JOIN enderecos e ON e.leitor_id = l.id
      ${where} ORDER BY l.nome ASC LIMIT ? OFFSET ?
    `).all(...parametros, limite, (paginaSegura - 1) * limite) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearLeitor), total, pagina: paginaSegura, porPagina: limite }
  }

  leitorPorId(id: number): Leitor {
    const linha = this.db.prepare(`
      SELECT l.*, e.id AS endereco_id, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf,
        (SELECT COUNT(*) FROM emprestimos emp WHERE emp.leitor_id = l.id AND emp.status = 'aberto') AS emprestimos_ativos,
        (SELECT COUNT(*) FROM reservas r WHERE r.leitor_id = l.id AND r.status IN ('aguardando','disponivel_para_retirada')) AS reservas_ativas,
        (SELECT COALESCE(SUM(m.valor_centavos), 0) FROM multas m WHERE m.leitor_id = l.id AND m.status = 'pendente') AS multa_em_aberto_centavos
      FROM leitores l LEFT JOIN enderecos e ON e.leitor_id = l.id
      WHERE l.id = ? AND l.excluido_em IS NULL
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
    return mapearLeitor(linha)
  }

  leitorExiste(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM leitores WHERE id = ? AND deleted_at IS NULL').get(id) !== undefined
  }

  criarLeitor(dados: DadosLeitor): Leitor {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 })
    const cpf = Validador.cpf(dados.cpf)
    const email = Validador.email(dados.email, 'email')
    const telefone = Validador.telefone(dados.telefone, 'telefone', true) as string
    this.exigirCpfDisponivel(hashCpf(cpf, this.chaves.cpfHmac))
    const agora = hojeIso()
    const transacao = this.db.transaction(() => {
      const id = this.repos.leitores.criar({
        nome, cpfCifrado: cifrarTexto(cpf, this.chaves.cpfCriptografia),
        cpfHash: hashCpf(cpf, this.chaves.cpfHmac), cpfMascara: mascararCpf(cpf),
        email, telefone, ativo: 1, criadoEm: agora, atualizadoEm: agora
      })
      if (dados.cep !== undefined || dados.logradouro !== undefined) {
        this.criarEnderecoPara(id, dados)
      }
      return id
    })
    return this.leitorPorId(transacao())
  }

  atualizarLeitor(id: number, dados: DadosLeitor): Leitor {
    this.leitorPorId(id)
    const alteracoes: Record<string, unknown> = { atualizadoEm: hojeIso() }
    if (dados.nome !== undefined) alteracoes.nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 })
    if (dados.email !== undefined) alteracoes.email = Validador.email(dados.email, 'email')
    if (dados.telefone !== undefined) alteracoes.telefone = Validador.telefone(dados.telefone, 'telefone', true)
    const transacao = this.db.transaction(() => {
      this.repos.leitores.atualizar(id, alteracoes)
      if (dados.cep !== undefined || dados.logradouro !== undefined || dados.cidade !== undefined) {
        const existente = this.db.prepare('SELECT id FROM enderecos WHERE leitor_id = ?').get(id) as { id: number } | undefined
        if (existente === undefined) this.criarEnderecoPara(id, dados)
        else this.atualizarEndereco(existente.id, { ...dados, leitorId: id })
      }
    })
    transacao()
    return this.leitorPorId(id)
  }

  inativarLeitor(id: number): void {
    const leitor = this.leitorPorId(id)
    if (leitor.deletedAt !== null || !leitor.ativo) throw ErroDeDominio.conflito('Este leitor já está inativo.')
    const ativos = this.db.prepare("SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ? AND status = 'aberto'").get(id) as { total: number }
    if (ativos.total > 0) throw ErroDeDominio.conflito('O leitor possui empréstimos em andamento.')

    const agora = hojeIso()
    // Exclusão lógica em cascata: o histórico fica no banco, mas nenhum dado do leitor
    // continua disponível para login, filtros, filas ou notificações.
    const transacao = this.db.transaction(() => {
      this.db.prepare('UPDATE leitores SET ativo = 0, deleted_at = ?, atualizado_em = ? WHERE id = ?')
        .run(agora, agora, id)
      this.db.prepare('UPDATE usuarios SET ativo = 0, deleted_at = ?, atualizado_em = ? WHERE leitor_id = ? AND deleted_at IS NULL')
        .run(agora, agora, id)
      this.db.prepare(`UPDATE exemplares SET status = 'disponivel', atualizado_em = ?
        WHERE id IN (SELECT exemplar_destinado_id FROM reservas
          WHERE leitor_id = ? AND status = 'disponivel_para_retirada' AND exemplar_destinado_id IS NOT NULL)`)
        .run(agora, id)
      this.db.prepare("UPDATE reservas SET status = 'cancelado', atualizado_em = ? WHERE leitor_id = ? AND status IN ('aguardando','disponivel_para_retirada')")
        .run(agora, id)
      this.db.prepare(`UPDATE exemplares SET status = 'disponivel', atualizado_em = ?
        WHERE id IN (SELECT exemplar_id FROM agendamentos WHERE leitor_id = ? AND status = 'ativo')`)
        .run(agora, id)
      this.db.prepare("UPDATE agendamentos SET status = 'cancelado', atualizado_em = ? WHERE leitor_id = ? AND status = 'ativo'")
        .run(agora, id)
      this.db.prepare('UPDATE consentimentos_whatsapp SET consentimento = 0, revogado_em = ? WHERE leitor_id = ? AND consentimento = 1')
        .run(agora, id)
    })
    transacao()
  }

  /**
   * Exclusão definitiva para administradores: apaga os dados pessoais do leitor
   * e o remove de todas as telas. A linha anônima permanece apenas para manter
   * íntegro o histórico de empréstimos, reservas, multas etc.
   */
  excluirDefinitivamente(id: number): void {
    const linha = this.db.prepare(
      'SELECT id, deleted_at, excluido_em FROM leitores WHERE id = ?'
    ).get(id) as { id: number; deleted_at: string | null; excluido_em: string | null } | undefined
    if (linha === undefined || linha.excluido_em !== null) {
      throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
    }
    if (linha.deleted_at === null) {
      throw ErroDeDominio.validacao('Inative o leitor antes de excluí-lo definitivamente.')
    }

    const agora = hojeIso()
    const cpfCifrado = cifrarTexto('00000000000', this.chaves.cpfCriptografia)
    const cpfHash = createHash('sha256').update(`excluido:${id}:${agora}`).digest()
    const emailAnonimo = `leitor-removido-${id}@biblioteca.local`
    const transacao = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE leitores SET nome = 'Leitor removido', cpf_cifrado = ?, cpf_hash = ?,
          cpf_mascara = '***.***.***-**', email = NULL, telefone = NULL,
          excluido_em = ?, atualizado_em = ? WHERE id = ?
      `).run(cpfCifrado, cpfHash, agora, agora, id)
      this.db.prepare(`
        UPDATE usuarios SET nome = 'Leitor removido', email = ?, ativo = 0,
          deleted_at = COALESCE(deleted_at, ?), atualizado_em = ? WHERE leitor_id = ?
      `).run(emailAnonimo, agora, agora, id)
      this.db.prepare('DELETE FROM enderecos WHERE leitor_id = ?').run(id)
      this.db.prepare('DELETE FROM consentimentos_whatsapp WHERE leitor_id = ?').run(id)
    })
    transacao()
  }

  /** Usada no middleware para derrubar sessões de contas inativadas. */
  usuarioEstaAtivo(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND deleted_at IS NULL AND ativo = 1').get(id) !== undefined
  }

  /** Conta de demonstração criada apenas para consultas; bloqueia escrita no middleware. */
  usuarioSomenteLeitura(id: number): boolean {
    const linha = this.db.prepare('SELECT somente_leitura FROM usuarios WHERE id = ?').get(id) as
      | { somente_leitura: number }
      | undefined
    return linha?.somente_leitura === 1
  }

  listarUsuarios(
    q?: string,
    pagina = 1,
    porPagina = 50,
    situacao: SituacaoRegistro = 'todos'
  ): { itens: Usuario[]; total: number; pagina: number; porPagina: number } {
    const termo = Validador.texto(q, 'q', { max: 120 })
    const condicoes: string[] = []
    const condicao = condicaoSituacao(
      normalizarSituacao(situacao),
      'deleted_at IS NULL AND ativo = 1',
      '(deleted_at IS NOT NULL OR ativo = 0)'
    )
    if (condicao !== undefined) condicoes.push(condicao)
    if (termo !== undefined) condicoes.push('(nome LIKE ? OR email LIKE ?)')
    const where = condicoes.length === 0 ? '' : ` WHERE ${condicoes.join(' AND ')}`
    const parametros = termo === undefined ? [] : [`%${termo}%`, `%${termo}%`]
    const total = (this.db.prepare(`SELECT COUNT(*) AS total FROM usuarios${where}`).get(...parametros) as { total: number }).total
    const limite = Math.min(Math.max(porPagina, 1), 100)
    const paginaSegura = Math.max(pagina, 1)
    const linhas = this.db.prepare(`SELECT * FROM usuarios${where} ORDER BY nome LIMIT ? OFFSET ?`)
      .all(...parametros, limite, (paginaSegura - 1) * limite) as Array<Record<string, unknown>>
    return { itens: linhas.map(mapearUsuario), total, pagina: paginaSegura, porPagina: limite }
  }

  usuarioPorId(id: number): Usuario {
    const linha = this.repos.usuarios.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Usuário não encontrado.')
    return mapearUsuario(linha)
  }

  usuarioPorEmail(email: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM usuarios WHERE email = ? AND deleted_at IS NULL AND ativo = 1')
      .get(email.toLowerCase()) as Record<string, unknown> | undefined
  }

  /** Localiza a conta de leitor pelo CPF cifrado, sem expor o número completo. */
  usuarioPorCpf(cpf: string): Record<string, unknown> | undefined {
    const digitos = somenteDigitos(cpf)
    if (digitos.length !== 11) return undefined
    return this.db.prepare(`
      SELECT u.* FROM usuarios u
      JOIN leitores l ON l.id = u.leitor_id
      WHERE l.cpf_hash = ? AND l.deleted_at IS NULL AND l.excluido_em IS NULL AND l.ativo = 1
        AND u.deleted_at IS NULL AND u.ativo = 1 AND u.perfil = 'LEITOR'
    `).get(hashCpf(digitos, this.chaves.cpfHmac)) as Record<string, unknown> | undefined
  }

  registrarLogin(id: number): void {
    this.repos.usuarios.atualizar(id, { ultimoLoginEm: hojeIso(), atualizadoEm: hojeIso() })
  }

  criarUsuario(dados: DadosUsuario): { usuario: Usuario; codigoAtivacao?: string } {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 })
    const email = Validador.email(dados.email, 'email', true) as string
    const perfil = Validador.enum(dados.perfil, 'perfil', PERFIS, true) as typeof PERFIS[number]
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { min: 1 })
    if (perfil === 'LEITOR' && leitorId === undefined) {
      throw ErroDeDominio.validacao('Usuários leitores precisam estar ligados a um leitor.', { leitorId: 'Escolha um leitor.' })
    }
    if (leitorId !== undefined && !this.leitorExiste(leitorId)) {
      throw ErroDeDominio.validacao('Leitor não encontrado.', { leitorId: 'Escolha um leitor cadastrado.' })
    }
    const senha = Validador.texto(dados.senha, 'senha', { max: 200 })
    const agora = hojeIso()
    let codigo: string | undefined
    const hashAtivacao = senha === undefined ? (() => {
      codigo = String(randomInt(100000, 999999))
      return createHash('sha256').update(codigo).digest('hex')
    })() : undefined

    const id = this.repos.usuarios.criar({
      leitorId, nome, email, perfil, ativo: 1,
      senhaHash: senha === undefined ? '' : this.gerarHashSenha(Validador.senha(senha)),
      codigoAtivacaoHash: hashAtivacao,
      codigoAtivacaoExpiraEm: hashAtivacao === undefined ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      criadoEm: agora, atualizadoEm: agora
    })
    if (codigo !== undefined) this.opcoes.avisarAtivacao?.(email, codigo)
    return { usuario: this.usuarioPorId(id), codigoAtivacao: codigo }
  }

  private async conferirCpfExterno(cpf: string): Promise<void> {
    if (!this.validarCpfExterno || this.consultaCpf === undefined) return
    const resultado = await this.consultaCpf.consultar(cpf)
    if (!resultado.existe) {
      throw new ErroDeDominio(
        400,
        'CPF_NAO_ENCONTRADO',
        'Não encontramos este CPF na base pública. Confira o número antes de continuar.',
        { cpf: 'CPF não encontrado na base pública.' }
      )
    }
  }

  private validarEndereco(dados: DadosLeitor): DadosLeitor | undefined {
    const cep = Validador.cep(dados.cep)
    const logradouro = Validador.texto(dados.logradouro, 'logradouro', { min: 2, max: 200 })
    const cidade = Validador.texto(dados.cidade, 'cidade', { min: 2, max: 120 })
    const uf = Validador.texto(dados.uf, 'uf', { min: 2, max: 2 })?.toUpperCase()
    const temEndereco = [dados.cep, dados.logradouro, dados.cidade, dados.uf]
      .some((valor) => valor !== undefined && valor !== null && valor !== '')
    if (!temEndereco) return undefined
    if (cep === undefined || logradouro === undefined || cidade === undefined || uf === undefined) {
      throw ErroDeDominio.validacao('Para salvar o endereço, informe CEP, rua, cidade e estado.')
    }
    return {
      cep,
      logradouro,
      cidade,
      uf,
      numero: Validador.texto(dados.numero, 'numero', { max: 20 }),
      complemento: Validador.texto(dados.complemento, 'complemento', { max: 120 }),
      bairro: Validador.texto(dados.bairro, 'bairro', { max: 120 })
    }
  }

  private paraLogado(usuario: Usuario): UsuarioLogado {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      leitorId: usuario.leitorId,
      somenteLeitura: usuario.somenteLeitura
    }
  }

  /** Lista de domínios aplicada somente ao cadastro público, no servidor. */
  private validarEmailPublico(valor: unknown): string {
    try {
      return validarEmailPermitido(valor)
    } catch (erro) {
      const mensagem = (erro as Error).message
      throw ErroDeDominio.validacao(mensagem, { email: mensagem })
    }
  }

  /** Cadastro público de leitor: cria leitor, endereço e usuário ativo em uma transação. */
  async cadastrarLeitor(dados: DadosCadastroLeitor): Promise<CadastroCriado> {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 }) as string
    const cpf = Validador.cpf(dados.cpf)
    const email = this.validarEmailPublico(dados.email)
    const telefone = Validador.telefone(dados.telefone, 'telefone', true) as string
    const senha = Validador.senhaForte(dados.senha)
    const endereco = this.validarEndereco(dados)
    const agora = hojeIso()
    if (this.emailEmUso(email)) {
      throw ErroDeDominio.conflito('Já existe uma conta com este e-mail. Entre normalmente.')
    }
    const cpfHash = hashCpf(cpf, this.chaves.cpfHmac)
    this.exigirCpfDisponivel(cpfHash)
    await this.conferirCpfExterno(cpf)

    const senhaHash = this.gerarHashSenha(senha)
    const usuarioId = this.db.transaction(() => {
      if (this.emailEmUso(email)) {
        throw ErroDeDominio.conflito('Já existe uma conta com este e-mail. Entre normalmente.')
      }
      const leitorId = this.repos.leitores.criar({
        nome,
        cpfCifrado: cifrarTexto(cpf, this.chaves.cpfCriptografia),
        cpfHash,
        cpfMascara: mascararCpf(cpf),
        email,
        telefone,
        ativo: 1,
        criadoEm: agora,
        atualizadoEm: agora
      })
      if (endereco !== undefined) this.criarEnderecoPara(leitorId, endereco)
      return this.repos.usuarios.criar({
        leitorId,
        nome,
        email,
        senhaHash,
        perfil: 'LEITOR',
        ativo: 1,
        emailVerificadoEm: agora,
        criadoEm: agora,
        atualizadoEm: agora
      })
    })()
    return {
      mensagem: 'Cadastro concluído. Seu acesso já está ativo.',
      usuario: this.paraLogado(this.usuarioPorId(usuarioId))
    }
  }

  private emailEmUso(email: string): boolean {
    return this.db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND deleted_at IS NULL').get(email) !== undefined
  }

  private leitorComCpfAtivo(cpfHash: Buffer, ignorarId?: number): { id: number; nome: string } | undefined {
    const sql = `SELECT id, nome FROM leitores
      WHERE cpf_hash = ? AND deleted_at IS NULL${ignorarId === undefined ? '' : ' AND id <> ?'}`
    const parametros = ignorarId === undefined ? [cpfHash] : [cpfHash, ignorarId]
    return this.db.prepare(sql).get(...parametros) as { id: number; nome: string } | undefined
  }

  private exigirCpfDisponivel(cpfHash: Buffer, ignorarId?: number): void {
    const existente = this.leitorComCpfAtivo(cpfHash, ignorarId)
    if (existente !== undefined) {
      throw new ErroDeDominio(
        409,
        'CPF_JA_CADASTRADO',
        'Já existe um cadastro ativo com este CPF.',
        { cpf: `Localizado em Leitores como "${existente.nome}". Para um cadastro novo, inative o registro anterior ou marque "Mostrar leitores inativos" para localizá-lo.` }
      )
    }
  }

  private hashConvite(codigo: string): string {
    return createHash('sha256').update(codigo).digest('hex')
  }

  private mapearConvite(linha: Record<string, unknown>): Convite {
    const usadoEm = linha.usado_em === null || linha.usado_em === undefined ? null : String(linha.usado_em)
    const revogadoEm = linha.revogado_em === null || linha.revogado_em === undefined ? null : String(linha.revogado_em)
    const expiraEm = String(linha.expira_em)
    return {
      id: Number(linha.id),
      perfil: String(linha.perfil) as Exclude<Usuario['perfil'], 'LEITOR'>,
      email: linha.email === null || linha.email === undefined ? null : String(linha.email),
      codigoMascara: String(linha.codigo_mascara),
      criadoPorUsuarioId: Number(linha.criado_por_usuario_id),
      criadoEm: String(linha.criado_em),
      expiraEm,
      usadoEm,
      revogadoEm,
      ativo: usadoEm === null && revogadoEm === null && expiraEm >= hojeIso()
    }
  }

  convitePorId(id: number): Convite {
    const linha = this.db.prepare('SELECT * FROM convites WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Convite não encontrado.')
    return this.mapearConvite(linha)
  }

  listarConvites(situacao: SituacaoRegistro = 'todos'): Convite[] {
    const condicao = condicaoSituacao(
      normalizarSituacao(situacao),
      'usado_em IS NULL AND revogado_em IS NULL AND expira_em >= ?',
      '(usado_em IS NOT NULL OR revogado_em IS NOT NULL OR expira_em < ?)'
    )
    const sql = condicao === undefined
      ? 'SELECT * FROM convites ORDER BY criado_em DESC LIMIT 100'
      : `SELECT * FROM convites WHERE ${condicao} ORDER BY criado_em DESC LIMIT 100`
    const linhas = this.db.prepare(sql).all(...(condicao === undefined ? [] : [hojeIso()])) as Array<Record<string, unknown>>
    return linhas.map((linha) => this.mapearConvite(linha))
  }

  /** Gera um código de uso único. O texto claro nunca é gravado no banco. */
  criarConvite(dados: DadosConvite): { codigo: string; convite: Convite } {
    const perfil = Validador.enum(dados.perfil, 'perfil', ['ADMIN'] as const, true) as 'ADMIN'
    const email = Validador.email(dados.email, 'email')
    const criadoPorUsuarioId = Validador.inteiro(dados.criadoPorUsuarioId, 'criadoPorUsuarioId', { obrigatorio: true, min: 1 }) as number
    const criador = this.db.prepare('SELECT perfil FROM usuarios WHERE id = ? AND deleted_at IS NULL AND ativo = 1')
      .get(criadoPorUsuarioId) as { perfil: string } | undefined
    if (criador?.perfil !== 'ADMIN') {
      throw ErroDeDominio.naoAutorizado('Somente um administrador ativo pode gerar convites.')
    }

    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let codigo = ''
    let hash = ''
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      codigo = Array.from({ length: 12 }, () => alfabeto[randomInt(alfabeto.length)]).join('')
      hash = this.hashConvite(codigo)
      if (this.db.prepare('SELECT 1 FROM convites WHERE codigo_hash = ?').get(hash) === undefined) break
    }
    if (this.db.prepare('SELECT 1 FROM convites WHERE codigo_hash = ?').get(hash) !== undefined) {
      throw new Error('Não foi possível gerar um convite único. Tente novamente.')
    }

    const agora = hojeIso()
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const id = Number(this.db.prepare(`
      INSERT INTO convites (codigo_hash, codigo_mascara, perfil, email, criado_por_usuario_id, criado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(hash, `${codigo.slice(0, 4)}••••••••`, perfil, email ?? null, criadoPorUsuarioId, agora, expiraEm).lastInsertRowid)
    return { codigo, convite: this.convitePorId(id) }
  }

  revogarConvite(id: number): void {
    const convite = this.convitePorId(id)
    if (!convite.ativo) throw ErroDeDominio.conflito('Este convite já foi usado, vencido ou revogado.')
    this.db.prepare('UPDATE convites SET revogado_em = ? WHERE id = ?').run(hojeIso(), convite.id)
  }

  /** Cadastro público de equipe: exige convite válido e cria a conta ativa. */
  async cadastrarEquipe(dados: DadosCadastroEquipe): Promise<CadastroCriado> {
    const codigo = (Validador.texto(dados.codigo, 'codigo', { obrigatorio: true, max: 40 }) ?? '')
      .replace(/[\s-]/g, '')
      .toUpperCase()
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 }) as string
    const email = this.validarEmailPublico(dados.email)
    const senha = Validador.senhaForte(dados.senha)
    if (codigo.length !== 12) {
      throw new ErroDeDominio(400, 'CONVITE_INVALIDO', 'Informe o código de convite de 12 caracteres.')
    }
    const agora = hojeIso()
    if (this.emailEmUso(email)) {
      throw ErroDeDominio.conflito('Já existe uma conta com este e-mail. Entre normalmente.')
    }

    const convite = this.db.prepare('SELECT * FROM convites WHERE codigo_hash = ?').get(this.hashConvite(codigo)) as Record<string, unknown> | undefined
    if (convite === undefined) {
      throw new ErroDeDominio(400, 'CONVITE_INVALIDO', 'Convite inválido. Solicite um novo código ao administrador.')
    }
    if (convite.usado_em !== null || convite.revogado_em !== null || String(convite.expira_em) < agora) {
      throw new ErroDeDominio(400, 'CONVITE_INVALIDO', 'Este convite foi usado, revogado ou venceu.')
    }
    if (convite.email !== null && String(convite.email) !== email) {
      throw new ErroDeDominio(400, 'CONVITE_INVALIDO', 'Este convite foi emitido para outro e-mail.')
    }

    const perfil = String(convite.perfil) as Exclude<Usuario['perfil'], 'LEITOR'>
    const senhaHash = this.gerarHashSenha(senha)
    const conviteId = Number(convite.id)
    const usuarioId = this.db.transaction(() => {
      const marcado = this.db.prepare(`
        UPDATE convites SET usado_em = ?
        WHERE id = ? AND usado_em IS NULL AND revogado_em IS NULL AND expira_em >= ?
      `).run(agora, conviteId, agora)
      if (marcado.changes !== 1) {
        throw new ErroDeDominio(400, 'CONVITE_INVALIDO', 'Este convite foi usado, revogado ou venceu. Solicite outro.')
      }
      return this.repos.usuarios.criar({
        nome,
        email,
        senhaHash,
        perfil,
        ativo: 1,
        emailVerificadoEm: agora,
        criadoEm: agora,
        atualizadoEm: agora
      })
    })()
    return {
      mensagem: 'Cadastro concluído. Seu acesso já está ativo.',
      usuario: this.paraLogado(this.usuarioPorId(usuarioId))
    }
  }

  atualizarUsuario(id: number, dados: Partial<DadosUsuario>): Usuario {
    const atual = this.usuarioPorId(id)
    const alteracoes: Record<string, unknown> = { atualizadoEm: hojeIso() }
    if (dados.nome !== undefined) alteracoes.nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 })
    if (dados.email !== undefined) alteracoes.email = Validador.email(dados.email, 'email', true)
    const perfil = dados.perfil === undefined
      ? undefined
      : Validador.enum(dados.perfil, 'perfil', PERFIS, true)
    const leitorId = dados.leitorId === undefined
      ? undefined
      : Validador.inteiro(dados.leitorId, 'leitorId', { min: 1 })
    if (perfil !== undefined) alteracoes.perfil = perfil
    if (leitorId !== undefined) alteracoes.leitorId = leitorId
    if (perfil === 'LEITOR' && leitorId === undefined && atual.leitorId === null) {
      throw ErroDeDominio.validacao('Usuários com perfil Leitor precisam ter um leitor vinculado.', {
        leitorId: 'Escolha um leitor.'
      })
    }
    const ativo = Validador.booleano(dados.ativo, 'ativo')
    if (ativo !== undefined) alteracoes.ativo = ativo ? 1 : 0
    if (dados.senha !== undefined) {
      alteracoes.senhaHash = this.gerarHashSenha(Validador.senhaForte(dados.senha))
    }
    this.repos.usuarios.atualizar(id, alteracoes)
    return this.usuarioPorId(id)
  }

  /**
   * Substitui a conta administrativa local pela conta do cliente e inativa a
   * anterior na mesma transação. O histórico vinculado ao usuário é preservado.
   */
  trocarAdministrador(
    dados: { nome?: unknown; email?: unknown; senha?: unknown },
    usuarioAtualId: number
  ): TrocaAdministradorResposta {
    const nome = Validador.texto(dados.nome, 'nome', { obrigatorio: true, min: 3, max: 120 })
    const email = Validador.email(dados.email, 'email', true) as string
    const senha = Validador.senhaForte(dados.senha)
    const atual = this.db.prepare(`
      SELECT id, nome, email, perfil FROM usuarios WHERE id = ? AND deleted_at IS NULL AND ativo = 1
    `).get(usuarioAtualId) as { id: number; nome: string; email: string; perfil: string } | undefined
    if (atual?.perfil !== 'ADMIN') {
      throw ErroDeDominio.naoAutorizado('Somente um administrador ativo pode substituir a conta administrativa.')
    }
    if (this.emailEmUso(email)) throw ErroDeDominio.conflito('Já existe uma conta com este e-mail.')

    const agora = hojeIso()
    const inativado = { id: atual.id, nome: atual.nome, email: atual.email }
    const novoId = this.db.transaction(() => {
      const id = this.repos.usuarios.criar({
        nome,
        email,
        senhaHash: this.gerarHashSenha(senha),
        perfil: 'ADMIN',
        ativo: 1,
        emailVerificadoEm: agora,
        criadoEm: agora,
        atualizadoEm: agora
      })
      this.db.prepare('UPDATE usuarios SET ativo = 0, atualizado_em = ? WHERE id = ?')
        .run(agora, atual.id)
      return id
    })()
    return { usuario: this.usuarioPorId(novoId), inativado }
  }

  inativarUsuario(id: number): void {
    const usuario = this.usuarioPorId(id)
    // Conta de leitor e pessoa são a mesma coisa para o cadastro: inativar apenas
    // o usuário deixava o CPF bloqueado no leitor, sem aparecer na tela de Usuários.
    if (usuario.perfil === 'LEITOR' && usuario.leitorId !== null) {
      this.inativarLeitor(usuario.leitorId)
      return
    }
    if (usuario.deletedAt !== null || !usuario.ativo) throw ErroDeDominio.conflito('Este usuário já está inativo.')
    this.repos.usuarios.inativar(id)
  }

  ativarUsuario(email: string, codigo: string, novaSenha: string): void {
    const linha = this.db.prepare('SELECT * FROM usuarios WHERE email = ? AND deleted_at IS NULL').get(email.toLowerCase()) as Record<string, unknown> | undefined
    if (linha === undefined) throw new ErroDeDominio(400, 'ATIVACAO_INVALIDA', 'Solicite um novo código de ativação.')
    const hash = typeof linha.codigo_ativacao_hash === 'string' ? linha.codigo_ativacao_hash : ''
    const expira = typeof linha.codigo_ativacao_expira_em === 'string' ? linha.codigo_ativacao_expira_em : ''
    const usado = linha.codigo_ativacao_usado_em !== null && linha.codigo_ativacao_usado_em !== undefined
    const confere = createHash('sha256').update(codigo).digest('hex') === hash
    if (hash === '' || usado || !confere || expira < hojeIso()) {
      throw new ErroDeDominio(400, 'ATIVACAO_INVALIDA', 'Código inválido, usado ou vencido.')
    }
    this.repos.usuarios.atualizar(Number(linha.id), {
      senhaHash: this.gerarHashSenha(Validador.senha(novaSenha)),
      codigoAtivacaoUsadoEm: hojeIso(),
      atualizadoEm: hojeIso()
    })
  }

  listarEnderecos(): Endereco[] {
    return (this.db.prepare('SELECT * FROM enderecos ORDER BY cidade, logradouro').all() as Array<Record<string, unknown>>).map(mapearEndereco)
  }

  enderecoPorId(id: number): Endereco {
    const linha = this.repos.enderecos.porId(id)
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Endereço não encontrado.')
    return mapearEndereco(linha)
  }

  private criarEnderecoPara(leitorId: number, dados: DadosLeitor): number {
    const cep = Validador.cep(dados.cep)
    const logradouro = Validador.texto(dados.logradouro, 'logradouro', { obrigatorio: true, min: 2, max: 200 })
    const cidade = Validador.texto(dados.cidade, 'cidade', { obrigatorio: true, min: 2, max: 120 })
    const uf = Validador.texto(dados.uf, 'uf', { obrigatorio: true, min: 2, max: 2 })?.toUpperCase()
    if (cep === undefined || logradouro === undefined || cidade === undefined || uf === undefined) {
      throw ErroDeDominio.validacao('Para salvar o endereço, informe CEP, rua, cidade e estado.')
    }
    return this.repos.enderecos.criar({
      leitorId, cep, logradouro, cidade, uf,
      numero: Validador.texto(dados.numero, 'numero', { max: 20 }),
      complemento: Validador.texto(dados.complemento, 'complemento', { max: 120 }),
      bairro: Validador.texto(dados.bairro, 'bairro', { max: 120 }),
      atualizadoEm: hojeIso()
    })
  }

  criarEndereco(dados: DadosEndereco): Endereco {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    if (leitorId === undefined || !this.leitorExiste(leitorId)) throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
    const existente = this.db.prepare('SELECT id FROM enderecos WHERE leitor_id = ?').get(leitorId) as { id: number } | undefined
    if (existente !== undefined) throw ErroDeDominio.conflito('Este leitor já possui endereço. Use alteração.')
    const id = this.criarEnderecoPara(leitorId, dados)
    return this.enderecoPorId(id)
  }

  atualizarEndereco(id: number, dados: Partial<DadosEndereco>): Endereco {
    this.enderecoPorId(id)
    const alteracoes: Record<string, unknown> = { atualizadoEm: hojeIso() }
    if (dados.cep !== undefined) alteracoes.cep = Validador.cep(dados.cep)
    if (dados.logradouro !== undefined) alteracoes.logradouro = Validador.texto(dados.logradouro, 'logradouro', { obrigatorio: true, min: 2, max: 200 })
    if (dados.numero !== undefined) alteracoes.numero = Validador.texto(dados.numero, 'numero', { max: 20 })
    if (dados.complemento !== undefined) alteracoes.complemento = Validador.texto(dados.complemento, 'complemento', { max: 120 })
    if (dados.bairro !== undefined) alteracoes.bairro = Validador.texto(dados.bairro, 'bairro', { max: 120 })
    if (dados.cidade !== undefined) alteracoes.cidade = Validador.texto(dados.cidade, 'cidade', { obrigatorio: true, min: 2, max: 120 })
    if (dados.uf !== undefined) alteracoes.uf = Validador.texto(dados.uf, 'uf', { obrigatorio: true, min: 2, max: 2 })?.toUpperCase()
    this.repos.enderecos.atualizar(id, alteracoes)
    return this.enderecoPorId(id)
  }

  removerEndereco(id: number): void {
    this.enderecoPorId(id)
    this.db.prepare('DELETE FROM enderecos WHERE id = ?').run(id)
  }

  dadosContatoLeitor(id: number): { nome: string; email: string | null } | undefined {
    return this.db.prepare('SELECT nome, email FROM leitores WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { nome: string; email: string | null } | undefined
  }

  listarAuditoria(): Array<Record<string, unknown>> {
    return this.db.prepare(`
      SELECT a.*, u.nome AS nome_usuario FROM configuracoes_auditoria a
      JOIN usuarios u ON u.id = a.alterado_por_usuario_id
      ORDER BY a.alterado_em DESC
    `).all() as Array<Record<string, unknown>>
  }

  auditoriaPorId(id: number): Record<string, unknown> {
    const linha = this.db.prepare(`
      SELECT a.*, u.nome AS nome_usuario FROM configuracoes_auditoria a
      JOIN usuarios u ON u.id = a.alterado_por_usuario_id WHERE a.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Registro de auditoria não encontrado.')
    return linha
  }

  listarConsentimentos(situacao: SituacaoRegistro = 'todos'): Array<Record<string, unknown>> {
    const condicao = condicaoSituacao(
      normalizarSituacao(situacao),
      'c.consentimento = 1 AND c.revogado_em IS NULL',
      '(c.consentimento = 0 OR c.revogado_em IS NOT NULL)'
    )
    const where = condicao === undefined ? '' : ` WHERE ${condicao}`
    return this.db.prepare(`
      SELECT c.id, c.leitor_id, c.telefone_mascara, c.consentimento, c.registrado_em, c.revogado_em, c.origem,
        CASE WHEN l.deleted_at IS NULL THEN l.nome ELSE 'Leitor inativo' END AS nome_leitor
      FROM consentimentos_whatsapp c JOIN leitores l ON l.id = c.leitor_id${where} ORDER BY c.registrado_em DESC
    `).all() as Array<Record<string, unknown>>
  }

  consentimentoPorId(id: number): Record<string, unknown> {
    const linha = this.db.prepare(`
      SELECT c.*, CASE WHEN l.deleted_at IS NULL THEN l.nome ELSE 'Leitor inativo' END AS nome_leitor
      FROM consentimentos_whatsapp c
      JOIN leitores l ON l.id = c.leitor_id WHERE c.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Consentimento não encontrado.')
    return linha
  }

  criarConsentimento(dados: { leitorId?: unknown; telefone?: unknown; consentimento?: unknown; origem?: unknown }): number {
    const leitorId = Validador.inteiro(dados.leitorId, 'leitorId', { obrigatorio: true, min: 1 })
    if (leitorId === undefined || !this.leitorExiste(leitorId)) throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
    const telefone = somenteDigitos(Validador.texto(dados.telefone, 'telefone', { obrigatorio: true }) ?? '')
    if (telefone.length < 10 || telefone.length > 13) throw ErroDeDominio.validacao('Informe um telefone com DDD.', { telefone: 'Exemplo: 11999999999' })
    const autorizado = Validador.booleano(dados.consentimento, 'consentimento') ?? false
    const origem = Validador.enum(dados.origem, 'origem', ['formulario', 'atendente', 'importacao'], true) as string
    return this.repos.consentimentos.criar({
      leitorId,
      telefoneCifrado: cifrarTexto(telefone, this.chaves.cpfCriptografia),
      telefoneMascara: `+${telefone.slice(0, 2)} ****-${telefone.slice(-4)}`,
      consentimento: autorizado ? 1 : 0,
      registradoEm: hojeIso(),
      revogadoEm: autorizado ? null : hojeIso(),
      origem
    })
  }

  revogarConsentimento(id: number): void {
    const linha = this.consentimentoPorId(id)
    if (Number(linha.consentimento) === 0) return
    this.repos.consentimentos.atualizar(id, { consentimento: 0, revogadoEm: hojeIso() })
  }
}
