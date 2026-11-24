import type { Banco } from '../banco/conexao.js'
import type { ParametroSql } from '../banco/repositorios.js'
import { ErroDeDominio } from '../erros.js'

export const RECURSOS_EXCLUSAO = [
  'autores', 'editoras', 'categorias', 'livros', 'exemplares',
  'leitores', 'usuarios', 'convites', 'emprestimos', 'reservas',
  'agendamentos', 'multas', 'notificacoes', 'consentimentos-whatsapp'
] as const

export type RecursoExclusao = typeof RECURSOS_EXCLUSAO[number]

interface Bloqueio {
  sql: string
  mensagem: string
  parametros?: ParametroSql[]
}

type Linha = Record<string, unknown>

/** Remove do banco apenas registros já inativos e sem vínculo histórico. */
export class ServicoExclusaoFisica {
  constructor(private readonly db: Banco) {}

  excluir(recurso: string, id: number): void {
    if (!RECURSOS_EXCLUSAO.includes(recurso as RecursoExclusao)) {
      throw ErroDeDominio.validacao('Recurso não permitido para exclusão física.', {
        recurso: 'Use um dos recursos de cadastro ou operação.'
      })
    }
    const tipo = recurso as RecursoExclusao
    const linha = this.db.prepare(`SELECT * FROM ${this.tabela(tipo)} WHERE id = ?`).get(id) as Linha | undefined
    if (linha === undefined) throw ErroDeDominio.naoEncontrado('Registro não encontrado.')
    if (!this.estaInativo(tipo, linha)) {
      throw ErroDeDominio.validacao('Inative o registro antes de excluí-lo do banco.')
    }

    const bloqueios = this.bloqueios(tipo, linha, id)
    const motivos = bloqueios
      .filter((bloqueio) => this.contar(bloqueio.sql, ...(bloqueio.parametros ?? [id])) > 0)
      .map((bloqueio) => bloqueio.mensagem)
    if (motivos.length > 0) {
      throw ErroDeDominio.conflito(
        'Este registro possui vínculos e não pode ser apagado sem destruir o histórico.',
        { vinculos: motivos.join('; ') }
      )
    }

    this.db.transaction(() => this.apagar(tipo, id))()
  }

  private tabela(tipo: RecursoExclusao): string {
    return tipo === 'consentimentos-whatsapp' ? 'consentimentos_whatsapp' : tipo
  }

  private contar(sql: string, ...parametros: ParametroSql[]): number {
    return (this.db.prepare(sql).get(...parametros) as { total: number }).total
  }

  private estaInativo(tipo: RecursoExclusao, linha: Linha): boolean {
    const nulo = (valor: unknown): boolean => valor === null || valor === undefined || valor === ''
    if (tipo === 'leitores') {
      if (!nulo(linha.excluido_em)) throw ErroDeDominio.naoEncontrado('Leitor não encontrado.')
      return !nulo(linha.deleted_at) || Number(linha.ativo) === 0
    }
    if (tipo === 'exemplares') return !nulo(linha.deleted_at) || linha.status === 'inativo'
    if (tipo === 'usuarios') return !nulo(linha.deleted_at) || Number(linha.ativo) === 0
    if (tipo === 'convites') {
      return !nulo(linha.usado_em) || !nulo(linha.revogado_em) || new Date(String(linha.expira_em)).getTime() < Date.now()
    }
    if (tipo === 'consentimentos-whatsapp') return Number(linha.consentimento) === 0 || !nulo(linha.revogado_em)
    if (tipo === 'emprestimos') return linha.status !== 'aberto'
    if (tipo === 'reservas') return !['aguardando', 'disponivel_para_retirada'].includes(String(linha.status))
    if (tipo === 'agendamentos') return !['ativo'].includes(String(linha.status))
    if (tipo === 'multas') return linha.status !== 'pendente'
    if (tipo === 'notificacoes') return linha.status !== 'pendente'
    return !nulo(linha.deleted_at)
  }

  private bloqueios(tipo: RecursoExclusao, linha: Linha, id: number): Bloqueio[] {
    const usuariosDoLeitor = 'SELECT id FROM usuarios WHERE leitor_id = ?'
    switch (tipo) {
      case 'autores':
        return [{ sql: 'SELECT COUNT(*) AS total FROM livro_autores WHERE autor_id = ?', mensagem: 'Existem livros vinculados a este autor.' }]
      case 'editoras':
        return [{ sql: 'SELECT COUNT(*) AS total FROM livros WHERE editora_id = ?', mensagem: 'Existem livros vinculados a esta editora.' }]
      case 'categorias':
        return [{ sql: 'SELECT COUNT(*) AS total FROM livro_categorias WHERE categoria_id = ?', mensagem: 'Existem livros vinculados a esta categoria.' }]
      case 'livros':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM emprestimos emp JOIN exemplares e ON e.id = emp.exemplar_id WHERE e.livro_id = ?', mensagem: 'Existem empréstimos deste livro.' },
          { sql: 'SELECT COUNT(*) AS total FROM reservas WHERE livro_id = ? OR exemplar_destinado_id IN (SELECT e.id FROM exemplares e WHERE e.livro_id = ?)', parametros: [id, id], mensagem: 'Existem reservas deste livro.' },
          { sql: 'SELECT COUNT(*) AS total FROM agendamentos a JOIN exemplares e ON e.id = a.exemplar_id WHERE e.livro_id = ?', mensagem: 'Existem agendamentos deste livro.' },
          { sql: `SELECT COUNT(*) AS total FROM notificacoes n
              WHERE n.reserva_id IN (SELECT r.id FROM reservas r WHERE r.livro_id = ?)
                OR n.emprestimo_id IN (SELECT emp.id FROM emprestimos emp JOIN exemplares e ON e.id = emp.exemplar_id WHERE e.livro_id = ?)
                OR n.multa_id IN (SELECT m.id FROM multas m JOIN emprestimos emp ON emp.id = m.emprestimo_id JOIN exemplares e ON e.id = emp.exemplar_id WHERE e.livro_id = ?)`,
            parametros: [id, id, id], mensagem: 'Existem notificações ligadas ao histórico deste livro.' }
        ]
      case 'exemplares':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM emprestimos WHERE exemplar_id = ?', mensagem: 'Existem empréstimos deste exemplar.' },
          { sql: 'SELECT COUNT(*) AS total FROM reservas WHERE exemplar_destinado_id = ?', mensagem: 'Existem reservas com este exemplar destinado.' },
          { sql: 'SELECT COUNT(*) AS total FROM agendamentos WHERE exemplar_id = ?', mensagem: 'Existem agendamentos deste exemplar.' },
          { sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE emprestimo_id IN (SELECT id FROM emprestimos WHERE exemplar_id = ?)', mensagem: 'Existem notificações ligadas ao histórico deste exemplar.' }
        ]
      case 'leitores':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ?', mensagem: 'Existem empréstimos deste leitor.' },
          { sql: 'SELECT COUNT(*) AS total FROM reservas WHERE leitor_id = ?', mensagem: 'Existem reservas deste leitor.' },
          { sql: 'SELECT COUNT(*) AS total FROM agendamentos WHERE leitor_id = ?', mensagem: 'Existem agendamentos deste leitor.' },
          { sql: 'SELECT COUNT(*) AS total FROM multas WHERE leitor_id = ?', mensagem: 'Existem multas deste leitor.' },
          { sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE leitor_id = ? OR usuario_destinatario_id IN (SELECT id FROM usuarios WHERE leitor_id = ?)', parametros: [id, id], mensagem: 'Existem notificações deste leitor.' },
          { sql: `SELECT COUNT(*) AS total FROM convites WHERE criado_por_usuario_id IN (${usuariosDoLeitor})`, mensagem: 'A conta deste leitor criou convites.' },
          { sql: `SELECT COUNT(*) AS total FROM pagamentos_multa WHERE registrado_por_usuario_id IN (${usuariosDoLeitor})`, mensagem: 'A conta deste leitor registrou pagamentos.' },
          { sql: `SELECT COUNT(*) AS total FROM configuracoes WHERE atualizado_por_usuario_id IN (${usuariosDoLeitor})`, mensagem: 'A conta deste leitor alterou configurações.' },
          { sql: `SELECT COUNT(*) AS total FROM configuracoes_auditoria WHERE alterado_por_usuario_id IN (${usuariosDoLeitor})`, mensagem: 'A conta deste leitor aparece na auditoria.' }
        ]
      case 'usuarios':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM convites WHERE criado_por_usuario_id = ?', mensagem: 'Este usuário criou convites.' },
          { sql: 'SELECT COUNT(*) AS total FROM emprestimos WHERE registrado_por_usuario_id = ?', mensagem: 'Este usuário registrou empréstimos.' },
          { sql: 'SELECT COUNT(*) AS total FROM reservas WHERE registrado_por_usuario_id = ?', mensagem: 'Este usuário registrou reservas.' },
          { sql: 'SELECT COUNT(*) AS total FROM agendamentos WHERE registrado_por_usuario_id = ?', mensagem: 'Este usuário registrou agendamentos.' },
          { sql: 'SELECT COUNT(*) AS total FROM multas WHERE perdao_por_usuario_id = ?', mensagem: 'Este usuário perdoou multas.' },
          { sql: 'SELECT COUNT(*) AS total FROM pagamentos_multa WHERE registrado_por_usuario_id = ?', mensagem: 'Este usuário registrou pagamentos.' },
          { sql: 'SELECT COUNT(*) AS total FROM configuracoes WHERE atualizado_por_usuario_id = ?', mensagem: 'Este usuário alterou configurações.' },
          { sql: 'SELECT COUNT(*) AS total FROM configuracoes_auditoria WHERE alterado_por_usuario_id = ?', mensagem: 'Este usuário aparece na auditoria de configurações.' },
          { sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_destinatario_id = ?', mensagem: 'Existem notificações destinadas a este usuário.' }
        ]
      case 'emprestimos':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM multas WHERE emprestimo_id = ?', mensagem: 'Existem multas ligadas a este empréstimo.' },
          { sql: 'SELECT COUNT(*) AS total FROM reservas WHERE emprestimo_id = ?', mensagem: 'Existem reservas ligadas a este empréstimo.' },
          { sql: 'SELECT COUNT(*) AS total FROM agendamentos WHERE emprestimo_id = ?', mensagem: 'Existem agendamentos ligados a este empréstimo.' },
          { sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE emprestimo_id = ?', mensagem: 'Existem notificações ligadas a este empréstimo.' }
        ]
      case 'reservas':
        return [{ sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE reserva_id = ?', mensagem: 'Existem notificações ligadas a esta reserva.' }]
      case 'agendamentos':
        return []
      case 'multas':
        return [
          { sql: 'SELECT COUNT(*) AS total FROM pagamentos_multa WHERE multa_id = ?', mensagem: 'Existem pagamentos ligados a esta multa.' },
          { sql: 'SELECT COUNT(*) AS total FROM notificacoes WHERE multa_id = ?', mensagem: 'Existem notificações ligadas a esta multa.' }
        ]
      case 'notificacoes':
      case 'convites':
      case 'consentimentos-whatsapp':
        return []
    }
  }

  private apagar(tipo: RecursoExclusao, id: number): void {
    if (tipo === 'livros') {
      this.db.prepare('DELETE FROM livro_autores WHERE livro_id = ?').run(id)
      this.db.prepare('DELETE FROM livro_categorias WHERE livro_id = ?').run(id)
      this.db.prepare('DELETE FROM exemplares WHERE livro_id = ?').run(id)
    }
    if (tipo === 'leitores') {
      this.db.prepare('DELETE FROM enderecos WHERE leitor_id = ?').run(id)
      this.db.prepare('DELETE FROM consentimentos_whatsapp WHERE leitor_id = ?').run(id)
      this.db.prepare('DELETE FROM usuarios WHERE leitor_id = ?').run(id)
    }
    this.db.prepare(`DELETE FROM ${this.tabela(tipo)} WHERE id = ?`).run(id)
  }
}
