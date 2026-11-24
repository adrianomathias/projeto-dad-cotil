import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createApp } from '../dist/app.js'
import { ConexaoBanco } from '../dist/banco/conexao.js'
import { FabricanteRepositorios } from '../dist/banco/repositorios.js'
import { Notificador } from '../dist/integracoes/notificador.js'
import { cifrarTexto, hashCpf, mascararCpf } from '../dist/seguranca/cpf.js'
import { ServicoSenha } from '../dist/seguranca/senha.js'
import { ServicoToken } from '../dist/seguranca/token.js'
import { CarteiraServicos } from '../dist/servicos/carteira.js'
import { ServicoConsultas } from '../dist/servicos/consultas.js'

const conexao = new ConexaoBanco(':memory:')
const chaves = { cpfCriptografia: randomBytes(32), cpfHmac: randomBytes(32) }
const gerarHash = (senha) => new ServicoSenha().gerarHash(senha)
const opcoesSeed = {
  adminEmail: 'admin@teste.local',
  adminSenha: 'Senha@123',
  gerarHash,
  cifrar: (texto) => cifrarTexto(texto, chaves.cpfCriptografia),
  hashCpf: (cpf) => hashCpf(cpf, chaves.cpfHmac),
  mascarar: mascararCpf,
  incluirExemplos: false
}

conexao.aplicarSeed(opcoesSeed)

const servicos = new CarteiraServicos(conexao.db, new FabricanteRepositorios(conexao.db), {
  chavesCpf: chaves,
  gerarHashSenha: gerarHash,
  token: new ServicoToken('chave-de-teste-com-mais-de-dezesseis-caracteres'),
  notificador: new Notificador({ modoSimulado: true })
})
const leitor = servicos.pessoas.criarLeitor({
  nome: 'Cliente de Teste',
  cpf: '52998224725',
  email: 'cliente@teste.local',
  telefone: '+5511999998888'
})

// A segunda execução do seed cria a conta do leitor sem apagar a anterior.
conexao.aplicarSeed({ ...opcoesSeed, senhaInicialLeitor: 'Leitor@123' })

let servidor
let base

before(async () => {
  servidor = createApp({ servicos }).listen(0, '127.0.0.1')
  await once(servidor, 'listening')
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()))
  conexao.fechar()
})

async function post(caminho, corpo, token) {
  const cabecalhos = { 'Content-Type': 'application/json' }
  if (token !== undefined) cabecalhos.Authorization = `Bearer ${token}`
  return fetch(`${base}/api${caminho}`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo)
  })
}

test('login do cliente usa CPF formatado e devolve perfil LEITOR', async () => {
  const resposta = await post('/auth/login-leitor', { cpf: '529.982.247-25', senha: 'Leitor@123' })
  assert.equal(resposta.status, 200)
  const corpo = await resposta.json()
  assert.ok(typeof corpo.token === 'string' && corpo.token.length > 0)
  assert.equal(corpo.usuario.perfil, 'LEITOR')
  assert.equal(corpo.usuario.leitorId, leitor.id)
  assert.equal(corpo.usuario.email, 'cliente@teste.local')

  const invalida = await post('/auth/login-leitor', { cpf: '52998224725', senha: 'senha-errada' })
  assert.equal(invalida.status, 401)
  assert.equal((await invalida.json()).erro.codigo, 'CREDENCIAIS_INVALIDAS')
})

test('cadastro de leitor pela API cria a conta ativa e já devolve a sessão', async () => {
  const email = 'cadastro-http@gmail.com'
  const resposta = await post('/auth/cadastro-leitor', {
    nome: 'Cadastro pela API',
    cpf: '11144477735',
    email,
    telefone: '+5511999998888',
    senha: 'Leitor@Forte123'
  })
  assert.equal(resposta.status, 201)
  const corpo = await resposta.json()
  assert.match(corpo.mensagem, /acesso já está ativo/)
  assert.ok(typeof corpo.token === 'string' && corpo.token.length > 0)
  assert.equal(corpo.usuario.perfil, 'LEITOR')
  assert.equal(corpo.usuario.email, email)
  assert.equal(servicos.pessoas.usuarioPorEmail(email)?.id, corpo.usuario.id)

  const login = await post('/auth/login', { email: 'admin@teste.local', senha: 'Senha@123' })
  const token = (await login.json()).token
  const antiga = await post('/auth/reenviar-verificacao', { email }, token)
  assert.equal(antiga.status, 404)
})

test('cadastro de administrador pela API consome o convite e devolve a sessão', async () => {
  const login = await post('/auth/login', { email: 'admin@teste.local', senha: 'Senha@123' })
  const tokenAdmin = (await login.json()).token
  const conviteResposta = await post('/convites', {
    perfil: 'ADMIN', email: 'equipe-http@gmail.com'
  }, tokenAdmin)
  assert.equal(conviteResposta.status, 201)
  const convite = await conviteResposta.json()

  const resposta = await post('/auth/cadastro-equipe', {
    codigo: convite.codigo,
    nome: 'Equipe pela API',
    email: 'equipe-http@gmail.com',
    senha: 'Equipe@Forte123'
  })
  assert.equal(resposta.status, 201)
  const corpo = await resposta.json()
  assert.ok(typeof corpo.token === 'string' && corpo.token.length > 0)
  assert.equal(corpo.usuario.perfil, 'ADMIN')
  assert.equal(servicos.pessoas.convitePorId(convite.convite.id).usadoEm !== null, true)
})

test('API rejeita o perfil ATENDENTE que não existe mais', async () => {
  const login = await post('/auth/login', { email: 'admin@teste.local', senha: 'Senha@123' })
  const tokenAdmin = (await login.json()).token
  const resposta = await post('/convites', { perfil: 'ATENDENTE' }, tokenAdmin)
  assert.equal(resposta.status, 400)
  const corpo = await resposta.json()
  assert.equal(corpo.erro.codigo, 'DADOS_INVALIDOS')
  assert.match(corpo.erro.detalhes.perfil, /ADMIN/)
})

test('conta somente leitura consulta dados, mas não altera', async () => {
  const email = 'visualizador@teste.local'
  const agora = new Date().toISOString()
  conexao.db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, somente_leitura, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'ADMIN', 1, 1, ?, ?)
  `).run('Visitante', email, gerarHash('Visualizar@123'), agora, agora)

  const login = await post('/auth/login', { email, senha: 'Visualizar@123' })
  assert.equal(login.status, 200)
  const corpo = await login.json()
  assert.equal(corpo.usuario.perfil, 'ADMIN')
  assert.equal(corpo.usuario.somenteLeitura, true)

  const consulta = await fetch(`${base}/api/livros`, {
    headers: { Authorization: `Bearer ${corpo.token}` }
  })
  assert.equal(consulta.status, 200)

  const escrita = await post('/livros', { titulo: 'Livro não permitido' }, corpo.token)
  assert.equal(escrita.status, 403)
  assert.equal((await escrita.json()).erro.codigo, 'SEM_PERMISSAO')
})

test('importação grava a sugestão no catálogo e não duplica ISBN repetido', async () => {
  const login = await post('/auth/login', { email: 'admin@teste.local', senha: 'Senha@123' })
  const token = (await login.json()).token
  const sugestao = {
    titulo: 'Livro da API HTTP',
    subtitulo: 'Importado pelo cliente',
    autores: ['Autora HTTP'],
    editora: 'Editora HTTP',
    isbn13: '9780000000202',
    anoPublicacao: 2025,
    descricaoCurta: 'Sinopse de teste.',
    capaUrl: 'https://books.example.com/capa.jpg',
    categorias: ['Ficção'],
    fonte: 'google-books'
  }

  const primeira = await post('/consulta/livros/importar', sugestao, token)
  assert.equal(primeira.status, 201)
  const criado = await primeira.json()
  assert.equal(criado.jaExistia, false)
  assert.equal(criado.autoresCriados, 1)
  assert.equal(criado.categoriasCriadas, 1)
  assert.equal(criado.editoraCriada, true)
  assert.equal(servicos.catalogo.listarLivros({ q: 'Livro da API HTTP' }).total, 1)

  const repetida = await post('/consulta/livros/importar', sugestao, token)
  assert.equal(repetida.status, 200)
  const repetido = await repetida.json()
  assert.equal(repetido.jaExistia, true)
  assert.equal(repetido.livro.id, criado.livro.id)
  assert.equal(servicos.catalogo.listarLivros({ q: 'Livro da API HTTP' }).total, 1)
})

test('busca por nome prefere Open Library e usa Google Books como fallback', async () => {
  const sugestao = {
    titulo: 'Livro da Open Library',
    autores: ['Autora Reserva'],
    editora: null,
    isbn10: null,
    isbn13: null,
    anoPublicacao: 2024,
    descricaoCurta: null,
    capaUrl: null,
    categorias: ['Ficção'],
    fonte: 'open-library'
  }
  const viaCep = { buscar: async () => { throw new Error('não usado') } }
  const brasilApi = { feriados: async () => [] }
  const googleFalha = { buscar: async () => { throw new Error('429') } }
  const googleVazio = { buscar: async () => [] }
  const openLibrary = { buscar: async () => [sugestao] }

  const comFallback = new ServicoConsultas(googleFalha, viaCep, brasilApi, openLibrary)
  assert.deepEqual(await comFallback.buscarLivros('Livro da Open Library', 5), [sugestao])

  const comVazio = new ServicoConsultas(googleVazio, viaCep, brasilApi, openLibrary)
  assert.deepEqual(await comVazio.buscarLivros('Livro da Open Library', 5), [sugestao])

  const preferencia = new ServicoConsultas(
    { buscar: async () => [{ ...sugestao, titulo: 'Google Books', fonte: 'google-books' }] },
    viaCep,
    brasilApi,
    { buscar: async () => [{ ...sugestao, titulo: 'Open Library', fonte: 'open-library' }] }
  )
  const escolhidos = await preferencia.buscarLivros('Livro da Open Library', 5)
  assert.equal(escolhidos[0].fonte, 'open-library')

  const semFontes = new ServicoConsultas(googleFalha, viaCep, brasilApi, {
    buscar: async () => { throw new Error('offline') }
  })
  await assert.rejects(
    () => semFontes.buscarLivros('Livro da Open Library', 5),
    (erro) => erro.status === 503 && erro.codigo === 'SERVICO_INDISPONIVEL'
  )
})

test('filtro situacao e exclusao-fisica funcionam pela API', async () => {
  const login = await post('/auth/login', { email: 'admin@teste.local', senha: 'Senha@123' })
  const { token } = await login.json()
  const cabecalhos = { Authorization: `Bearer ${token}` }
  const autor = servicos.catalogo.criarAutor({ nome: 'Autor Rotas Exclusao' })

  const semFiltro = await fetch(`${base}/api/autores`, { headers: cabecalhos })
  assert.equal(semFiltro.status, 200)

  const listar = async (situacao) => {
    const consulta = situacao === undefined ? '' : `&situacao=${situacao}`
    const resposta = await fetch(`${base}/api/autores?q=Autor%20Rotas%20Exclusao${consulta}`, { headers: cabecalhos })
    assert.equal(resposta.status, 200)
    return (await resposta.json()).itens
  }

  assert.equal((await listar()).length, 1)
  assert.equal((await listar('ativos')).length, 1)
  assert.equal((await listar('inativos')).length, 0)

  const invalida = await fetch(`${base}/api/autores?situacao=errado`, { headers: cabecalhos })
  assert.equal(invalida.status, 400)
  assert.equal((await invalida.json()).erro.codigo, 'DADOS_INVALIDOS')

  const excluir = (id = autor.id) => fetch(`${base}/api/autores/${id}/exclusao-fisica`, {
    method: 'DELETE', headers: cabecalhos
  })

  assert.equal((await excluir()).status, 400)
  servicos.catalogo.inativarAutor(autor.id)
  assert.equal((await listar()).length, 1)
  assert.equal((await listar('ativos')).length, 0)
  assert.equal((await listar('inativos')).length, 1)
  const legado = await fetch(`${base}/api/autores?q=Autor%20Rotas%20Exclusao&inativos=true`, { headers: cabecalhos })
  assert.equal(legado.status, 200)
  assert.equal((await legado.json()).itens.length, 1)
  assert.equal((await excluir()).status, 204)
  assert.equal((await listar('inativos')).length, 0)

  const vinculado = servicos.catalogo.criarAutor({ nome: 'Autor Com Historico Rotas' })
  const livro = servicos.catalogo.criarLivro({
    titulo: 'Livro Do Autor Com Historico', isbn13: '9789999999999', quantidadeExemplares: 1
  })
  conexao.db.prepare('INSERT INTO livro_autores (livro_id, autor_id, ordem) VALUES (?, ?, 1)').run(livro.id, vinculado.id)
  conexao.db.prepare('UPDATE autores SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), vinculado.id)
  const bloqueado = await excluir(vinculado.id)
  assert.equal(bloqueado.status, 409)
  const corpo = await bloqueado.json()
  assert.equal(corpo.erro.codigo, 'CONFLITO')
  assert.match(corpo.erro.detalhes.vinculos, /livros vinculados/)
})
