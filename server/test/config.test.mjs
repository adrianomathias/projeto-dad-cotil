import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { carregarConfiguracao, lerConfiguracao } from '../dist/config.js'

test('porta padrão e limites válidos', () => {
  const padrao = lerConfiguracao({})
  assert.equal(padrao.porta, 3000)
  assert.equal(padrao.origemCors, undefined)
  for (const porta of ['1', '3000', '65535']) {
    assert.equal(lerConfiguracao({ PORT: porta }).porta, Number(porta))
  }
})

test('senha inicial do leitor tem padrão local e pode ser configurada', () => {
  assert.equal(lerConfiguracao({}).senhaInicialLeitor, 'Leitor@123')
  assert.equal(lerConfiguracao({ LEITOR_SENHA_INICIAL: 'OutraSenha@123' }).senhaInicialLeitor, 'OutraSenha@123')
  assert.throws(
    () => lerConfiguracao({ NODE_ENV: 'production', ADMIN_SENHA: 'SenhaLonga@123', LEITOR_SENHA_INICIAL: 'curta' }),
    /LEITOR_SENHA_INICIAL deve ter ao menos 12 caracteres/
  )
})

test('portas inválidas falham sem conversão parcial', () => {
  for (const porta of ['', ' ', '3000abc', '3000.5', '-1', '0', '65536', '1e3', 'NaN', 'Infinity', ' 3000', '9'.repeat(40)]) {
    assert.throws(() => lerConfiguracao({ PORT: porta }), /PORT deve ser um inteiro/)
  }
})

test('CORS aceita origem exata HTTP/HTTPS e rejeita configurações ambíguas', () => {
  for (const origem of ['http://localhost:5173', 'https://biblioteca.example', 'null']) {
    assert.equal(lerConfiguracao({ CORS_ORIGIN: origem }).origemCors, origem)
  }
  for (const origem of ['', '*', 'file://', 'https://exemplo.test/api', 'https://exemplo.test/', 'https://usuario:senha@exemplo.test', 'https://exemplo.test?x=1', 'https://exemplo.test#x', 'http://um.test,http://dois.test']) {
    assert.throws(() => lerConfiguracao({ CORS_ORIGIN: origem }), /CORS_ORIGIN deve ser/)
  }
})

test('.env opcional, precedência do processo e erro de leitura', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'biblioteca-config-'))
  const anterior = { PORT: process.env.PORT, CORS_ORIGIN: process.env.CORS_ORIGIN }
  t.after(() => {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave]
      else process.env[chave] = valor
    }
    rmSync(pasta, { recursive: true, force: true })
  })
  delete process.env.PORT
  delete process.env.CORS_ORIGIN
  assert.equal(carregarConfiguracao(join(pasta, 'ausente.env')).porta, 3000)
  const arquivo = join(pasta, '.env')
  writeFileSync(arquivo, 'PORT=4321\nCORS_ORIGIN=http://localhost:5173\n')
  const doArquivo = carregarConfiguracao(arquivo)
  assert.equal(doArquivo.porta, 4321)
  assert.equal(doArquivo.origemCors, 'http://localhost:5173')
  process.env.PORT = '5432'
  assert.equal(carregarConfiguracao(arquivo).porta, 5432)
  assert.throws(() => carregarConfiguracao(pasta), /Não foi possível carregar/)
})
