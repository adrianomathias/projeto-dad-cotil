import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import express from 'express'
import { createApp } from '../dist/app.js'
import { tratarErros } from '../dist/erros.js'

let servidor
let base

before(async () => {
  servidor = createApp({ origemCors: 'http://localhost:5173' }).listen(0, '127.0.0.1')
  await once(servidor, 'listening')
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()))
})

test('GET /health preserva o contrato e omite a assinatura do Express', async () => {
  const resposta = await fetch(`${base}/health`)
  assert.equal(resposta.status, 200)
  assert.match(resposta.headers.get('content-type'), /application\/json/)
  assert.equal(resposta.headers.get('x-powered-by'), null)
  assert.deepEqual(await resposta.json(), { status: 'ok' })
})

test('HEAD /health retorna os cabeçalhos sem corpo', async () => {
  const resposta = await fetch(`${base}/health`, { method: 'HEAD' })
  assert.equal(resposta.status, 200)
  assert.equal(await resposta.text(), '')
})

test('rotas ausentes e métodos de negócio não implementados retornam 404 JSON', async () => {
  for (const [caminho, method] of [['/ausente', 'GET'], ['/api/health', 'GET'], ['/health', 'POST'], ['/health', 'PUT'], ['/health', 'PATCH'], ['/health', 'DELETE']]) {
    const resposta = await fetch(`${base}${caminho}`, { method })
    assert.equal(resposta.status, 404)
    assert.deepEqual(await resposta.json(), {
      erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' }
    })
  }
})

test('JSON inválido retorna 400 sem refletir corpo ou stack', async () => {
  const resposta = await fetch(`${base}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"segredo":'
  })
  assert.equal(resposta.status, 400)
  assert.deepEqual(await resposta.json(), {
    erro: { codigo: 'JSON_INVALIDO', mensagem: 'O corpo deve conter JSON válido.' }
  })
})

test('JSON acima de 100 KB retorna 413', async () => {
  const resposta = await fetch(`${base}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: 'a'.repeat(102_400) })
  })
  assert.equal(resposta.status, 413)
  assert.equal((await resposta.json()).erro.codigo, 'CORPO_MUITO_GRANDE')
})

test('charset e compressão não suportados retornam 415 JSON', async () => {
  for (const headers of [
    { 'Content-Type': 'application/json; charset=iso-8859-1' },
    { 'Content-Type': 'application/json', 'Content-Encoding': 'desconhecido' }
  ]) {
    const resposta = await fetch(`${base}/health`, { method: 'POST', headers, body: '{}' })
    assert.equal(resposta.status, 415)
    assert.equal((await resposta.json()).erro.codigo, 'CODIFICACAO_NAO_SUPORTADA')
  }
})

test('CORS libera somente a origem configurada, inclusive nas respostas de erro', async () => {
  for (const caminho of ['/health', '/ausente']) {
    const resposta = await fetch(`${base}${caminho}`, { headers: { Origin: 'http://localhost:5173' } })
    assert.equal(resposta.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.match(resposta.headers.get('vary'), /Origin/)
    await resposta.text()
  }
  for (const origem of ['https://outro.example', 'http://localhost:5173.evil.example', 'null']) {
    const resposta = await fetch(`${base}/health`, { headers: { Origin: origem } })
    assert.equal(resposta.headers.get('access-control-allow-origin'), null)
    assert.equal(resposta.status, 200) // CORS controla a leitura no navegador, não é autenticação.
    await resposta.text()
  }
})

test('CORS aceita a origem opaca null quando configurada para o Electron empacotado', async (t) => {
  const local = createApp({ origemCors: 'null' }).listen(0, '127.0.0.1')
  await once(local, 'listening')
  t.after(() => new Promise((resolve) => local.close(resolve)))
  const url = `http://127.0.0.1:${local.address().port}/health`

  const opaca = await fetch(url, { headers: { Origin: 'null' } })
  assert.equal(opaca.headers.get('access-control-allow-origin'), 'null')
  await opaca.text()

  const outra = await fetch(url, { headers: { Origin: 'http://localhost:5173' } })
  assert.equal(outra.headers.get('access-control-allow-origin'), null)
  await outra.text()
})

test('corpo gzip corrompido retorna 400 em vez de erro interno', async () => {
  const resposta = await fetch(`${base}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body: 'isto não é gzip'
  })
  assert.equal(resposta.status, 400)
  assert.equal((await resposta.json()).erro.codigo, 'REQUISICAO_INVALIDA')
})

test('preflight informa apenas os métodos e cabeçalhos atuais', async () => {
  const resposta = await fetch(`${base}/health`, {
    method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type'
    }
  })
  assert.equal(resposta.status, 204)
  assert.equal(resposta.headers.get('access-control-allow-methods'), 'GET,POST,PATCH,DELETE,OPTIONS')
  assert.equal(resposta.headers.get('access-control-allow-headers'), 'Content-Type,Authorization')
  assert.equal(await resposta.text(), '')
})

test('sem configuração CORS nenhuma origem recebe permissão', async (t) => {
  const local = createApp().listen(0, '127.0.0.1')
  await once(local, 'listening')
  t.after(() => new Promise((resolve) => local.close(resolve)))
  const resposta = await fetch(`http://127.0.0.1:${local.address().port}/health`, {
    headers: { Origin: 'http://localhost:5173' }
  })
  assert.equal(resposta.headers.get('access-control-allow-origin'), null)
  await resposta.text()
})

test('Express 5 encaminha rejeições assíncronas ao erro JSON 500 sem vazamento', async (t) => {
  // Aplicação exclusiva do teste; não adiciona endpoint ao servidor real.
  const app = express()
  app.get('/falha', async () => { throw new Error('segredo-interno') })
  app.use(tratarErros)
  const local = app.listen(0, '127.0.0.1')
  await once(local, 'listening')
  t.after(() => new Promise((resolve) => local.close(resolve)))
  const resposta = await fetch(`http://127.0.0.1:${local.address().port}/falha`)
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), {
    erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.' }
  })
})

test('erros após o envio dos cabeçalhos são delegados ao Express', () => {
  const erro = new Error('falha após cabeçalhos')
  let delegado
  tratarErros(erro, {}, { headersSent: true }, (recebido) => { delegado = recebido })
  assert.equal(delegado, erro)
})
