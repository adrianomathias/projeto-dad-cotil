import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const entrada = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const ambiente = { ...process.env, CORS_ORIGIN: 'http://localhost:5173' }

test('configuração inválida encerra o processo com código 1 e mensagem clara', () => {
  const resultado = spawnSync(process.execPath, [entrada], {
    env: { ...ambiente, PORT: '3000abc' }, encoding: 'utf8', timeout: 5_000, windowsHide: true
  })
  assert.equal(resultado.status, 1)
  assert.match(resultado.stderr, /PORT deve ser um inteiro/)
  assert.equal(resultado.stdout, '')
})

test('porta ocupada encerra o processo com código 1 e mensagem clara', async (t) => {
  const ocupado = createServer().listen(0)
  await once(ocupado, 'listening')
  t.after(() => new Promise((resolve) => ocupado.close(resolve)))
  const resultado = spawnSync(process.execPath, [entrada], {
    env: { ...ambiente, PORT: String(ocupado.address().port) },
    encoding: 'utf8', timeout: 5_000, windowsHide: true
  })
  assert.equal(resultado.status, 1)
  assert.match(resultado.stderr, /já está em uso/)
})

test('servidor compilado atende HTTP e executa o encerramento registrado', async (t) => {
  const reserva = createServer().listen(0)
  await once(reserva, 'listening')
  const porta = reserva.address().port
  await new Promise((resolve) => reserva.close(resolve))
  // No Windows, child.kill não entrega SIGTERM como no POSIX.
  // O IPC apenas aciona o listener de produção; não existe no servidor entregue.
  const bootstrap = `await import(${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)}); process.on('message', () => { process.emit('SIGTERM'); process.disconnect() })`
  const filho = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
    env: { ...ambiente, PORT: String(porta) }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  const encerrado = once(filho, 'exit')
  t.after(() => { if (filho.exitCode === null && !filho.killed) filho.kill() })
  let saida = ''
  let erros = ''
  filho.stdout.on('data', (dados) => { saida += dados })
  filho.stderr.on('data', (dados) => { erros += dados })
  await new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error(`Servidor não iniciou: ${erros}`)), 5_000)
    filho.stdout.on('data', () => {
      if (saida.includes('Servidor ouvindo')) { clearTimeout(limite); resolve() }
    })
  })
  const resposta = await fetch(`http://127.0.0.1:${porta}/health`)
  assert.deepEqual(await resposta.json(), { status: 'ok' })
  filho.send('encerrar')
  const [codigo, sinal] = await encerrado
  assert.equal(codigo, 0)
  assert.equal(sinal, null)
  assert.equal(erros, '')
})
