import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import Database from 'better-sqlite3'
import { ConexaoBanco } from '../dist/banco/conexao.js'

const diretorio = mkdtempSync(join(tmpdir(), 'biblioteca-migracao-'))
const caminho = join(diretorio, 'antigo.sqlite')

after(() => rmSync(diretorio, { recursive: true, force: true }))

test('migração troca o UNIQUE global do CPF por índice parcial de ativos', () => {
  const antigo = new Database(caminho)
  antigo.exec(`
    CREATE TABLE leitores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
      cpf_cifrado BLOB NOT NULL,
      cpf_hash BLOB NOT NULL UNIQUE CHECK (length(cpf_hash) = 32),
      cpf_mascara TEXT NOT NULL,
      email TEXT,
      telefone TEXT,
      ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      deleted_at TEXT
    );
  `)
  const hash = randomBytes(32)
  antigo.prepare(`INSERT INTO leitores (nome, cpf_cifrado, cpf_hash, cpf_mascara, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?)`).run('Leitor Antigo', randomBytes(32), hash, '***.***.***-**', '2026-01-01', '2026-01-01')
  antigo.close()

  const conexao = new ConexaoBanco(caminho)
  try {
    const indices = conexao.db.prepare('PRAGMA index_list(leitores)').all()
    assert.equal(indices.some((indice) => indice.origin === 'u'), false)
    assert.equal(indices.some((indice) => indice.name === 'uq_leitores_cpf_ativo'), true)
    assert.equal(
      conexao.db.prepare('PRAGMA table_info(leitores)').all().some((coluna) => coluna.name === 'excluido_em'),
      true
    )

    conexao.db.prepare(`INSERT INTO leitores (nome, cpf_cifrado, cpf_hash, cpf_mascara, criado_em, atualizado_em, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Leitor Inativo', randomBytes(32), hash, '***.***.***-**', '2026-01-02', '2026-01-02', '2026-01-03')

    assert.throws(
      () => conexao.db.prepare(`INSERT INTO leitores (nome, cpf_cifrado, cpf_hash, cpf_mascara, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?)`).run('Leitor Ativo Duplicado', randomBytes(32), hash, '***.***.***-**', '2026-01-04', '2026-01-04'),
      /UNIQUE/
    )
    assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total, 2)
  } finally {
    conexao.fechar()
  }
})
