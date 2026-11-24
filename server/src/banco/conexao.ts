import Database from 'better-sqlite3'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executarSeed } from './seed.js'

export type Banco = Database.Database

export class ConexaoBanco {
  readonly db: Banco

  constructor(caminho: string) {
    mkdirSync(dirname(caminho), { recursive: true })
    this.db = new Database(caminho)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    const local = fileURLToPath(new URL('./schema.sql', import.meta.url))
    const noCodigoFonte = fileURLToPath(new URL('../../src/banco/schema.sql', import.meta.url))
    const caminhoEsquema = existsSync(local) ? local : noCodigoFonte
    const esquema = readFileSync(caminhoEsquema, 'utf8')
    this.db.exec(esquema)
    this.migrarIndiceCpfLeitores()
    this.migrarColunaExclusaoLeitor()
    this.migrarColunasVerificacao()
    this.migrarPerfis()
  }

  /**
   * Remove o perfil ATENDENTE de bancos antigos. As contas da equipe passam a
   * ser ADMIN, preservando o histórico; a conta de demonstração "Visitante" é
   * apagada quando não há vínculos e, se houver, apenas inativada.
   */
  private migrarPerfis(): void {
    this.db.prepare("UPDATE usuarios SET perfil = 'ADMIN' WHERE perfil = 'ATENDENTE'").run()
    this.db.prepare("UPDATE convites SET perfil = 'ADMIN' WHERE perfil = 'ATENDENTE'").run()

    const visitante = this.db.prepare(
      "SELECT id FROM usuarios WHERE email = 'visualizador@biblioteca.local'"
    ).get() as { id: number } | undefined
    if (visitante === undefined) return

    try {
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM usuarios WHERE id = ?').run(visitante.id)
      })()
    } catch {
      // Histórico aponta para a conta: mantemos a linha, mas sem acesso.
      this.db.prepare(`
        UPDATE usuarios SET ativo = 0, deleted_at = ?, somente_leitura = 0 WHERE id = ?
      `).run(new Date().toISOString(), visitante.id)
    }
  }

  /**
   * Bancos antigos tinham UNIQUE global em leitores.cpf_hash. Isso impedia
   * cadastrar novamente um CPF depois da inativação lógica, mesmo com o
   * registro antigo oculto. Recria a tabela com índice parcial por deleted_at,
   * preservando todos os registros e o histórico.
   */
  private migrarIndiceCpfLeitores(): void {
    const indices = this.db.prepare('PRAGMA index_list(leitores)').all() as Array<{ origin: string }>
    const temIndiceAntigo = indices.some((indice) => indice.origin === 'u')
    const temIndiceNovo = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'uq_leitores_cpf_ativo'"
    ).get() !== undefined
    if (!temIndiceAntigo && temIndiceNovo) return

    this.db.pragma('foreign_keys = OFF')
    try {
      const migrar = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE leitores_migracao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
            cpf_cifrado BLOB NOT NULL,
            cpf_hash BLOB NOT NULL CHECK (length(cpf_hash) = 32),
            cpf_mascara TEXT NOT NULL CHECK (length(cpf_mascara) BETWEEN 1 AND 20),
            email TEXT CHECK (email IS NULL OR email LIKE '%@%'),
            telefone TEXT CHECK (telefone IS NULL OR telefone LIKE '+%'),
            ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
            criado_em TEXT NOT NULL,
            atualizado_em TEXT NOT NULL,
            deleted_at TEXT,
            excluido_em TEXT
          );
          INSERT INTO leitores_migracao
            (id, nome, cpf_cifrado, cpf_hash, cpf_mascara, email, telefone, ativo, criado_em, atualizado_em, deleted_at)
          SELECT id, nome, cpf_cifrado, cpf_hash, cpf_mascara, email, telefone, ativo, criado_em, atualizado_em, deleted_at
          FROM leitores;
          DROP TABLE leitores;
          ALTER TABLE leitores_migracao RENAME TO leitores;
          CREATE INDEX idx_leitores_nome ON leitores(nome);
          CREATE INDEX idx_leitores_ativo ON leitores(ativo, deleted_at);
          CREATE UNIQUE INDEX uq_leitores_cpf_ativo ON leitores(cpf_hash) WHERE deleted_at IS NULL;
        `)
      })
      migrar()
    } finally {
      this.db.pragma('foreign_keys = ON')
    }
  }

  /** Bancos já existentes passam a registrar a exclusão definitiva do leitor. */
  private migrarColunaExclusaoLeitor(): void {
    const existentes = new Set(
      (this.db.prepare('PRAGMA table_info(leitores)').all() as Array<{ name: string }>)
        .map((coluna) => coluna.name)
    )
    if (!existentes.has('excluido_em')) this.db.exec('ALTER TABLE leitores ADD COLUMN excluido_em TEXT')
  }

  /** Bancos já existentes ganham as colunas de confirmação sem perder histórico. */
  private migrarColunasVerificacao(): void {
    const existentes = new Set(
      (this.db.prepare('PRAGMA table_info(usuarios)').all() as Array<{ name: string }>)
        .map((coluna) => coluna.name)
    )
    const adicoes: Array<[string, string]> = [
      ['email_verificado_em', 'TEXT'],
      ['verificacao_codigo_hash', 'TEXT'],
      ['verificacao_expira_em', 'TEXT'],
      ['verificacao_tentativas', 'INTEGER NOT NULL DEFAULT 0'],
      ['verificacao_enviado_em', 'TEXT'],
      ['somente_leitura', 'INTEGER NOT NULL DEFAULT 0 CHECK (somente_leitura IN (0,1))']
    ]
    for (const [nome, tipo] of adicoes) {
      if (!existentes.has(nome)) this.db.exec(`ALTER TABLE usuarios ADD COLUMN ${nome} ${tipo}`)
    }
  }

  aplicarSeed(opcoes: {
    adminEmail: string
    adminSenha: string
    senhaInicialLeitor?: string
    gerarHash: (senha: string) => string
    cifrar: (texto: string) => Buffer
    hashCpf: (cpf: string) => Buffer
    mascarar: (cpf: string) => string
    incluirExemplos: boolean
  }): void {
    executarSeed(this.db, opcoes)
  }

  fechar(): void {
    this.db.close()
  }
}
