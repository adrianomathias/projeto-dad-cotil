import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'

test('driver nativo: conexão, CRUD parametrizado, transação e persistência temporária', () => {
  // Diagnóstico isolado da dependência. Esta tabela não faz parte do modelo do projeto.
  const pasta = mkdtempSync(join(tmpdir(), 'biblioteca-sqlite-'))
  const arquivo = join(pasta, 'diagnostico.sqlite')
  let banco
  try {
    banco = new Database(arquivo)
    banco.pragma('foreign_keys = ON')
    banco.pragma('journal_mode = WAL')
    assert.equal(banco.pragma('foreign_keys', { simple: true }), 1)
    banco.exec('CREATE TABLE diagnostico (id INTEGER PRIMARY KEY, texto TEXT NOT NULL)')
    const malicioso = "teste'); DROP TABLE diagnostico; --"
    const inserido = banco.prepare('INSERT INTO diagnostico (texto) VALUES (?)').run(malicioso)
    const id = Number(inserido.lastInsertRowid)
    assert.deepEqual(banco.prepare('SELECT id, texto FROM diagnostico WHERE id = ?').get(id), { id, texto: malicioso })
    assert.equal(banco.prepare('UPDATE diagnostico SET texto = ? WHERE id = ?').run('atualizado', id).changes, 1)
    const reverter = banco.transaction(() => {
      banco.prepare('UPDATE diagnostico SET texto = ? WHERE id = ?').run('reverter', id)
      throw new Error('rollback esperado')
    })
    assert.throws(reverter, /rollback esperado/)
    banco.close()
    banco = new Database(arquivo)
    assert.equal(banco.prepare('SELECT texto FROM diagnostico WHERE id = ?').get(id).texto, 'atualizado')
    assert.equal(banco.prepare('DELETE FROM diagnostico WHERE id = ?').run(id).changes, 1)
    assert.equal(banco.prepare('SELECT COUNT(*) AS total FROM diagnostico').get().total, 0)
  } finally {
    banco?.close()
    rmSync(pasta, { recursive: true, force: true })
  }
})
