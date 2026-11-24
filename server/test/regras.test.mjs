import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { after, test } from 'node:test'
import express from 'express'
import { ConexaoBanco } from '../dist/banco/conexao.js'
import { FabricanteRepositorios } from '../dist/banco/repositorios.js'
import { CarteiraServicos } from '../dist/servicos/carteira.js'
import { adicionarDias, hoje, proximoDiaUtil } from '../dist/servicos/datas.js'
import { Agendador } from '../dist/agendador.js'
import { autenticar } from '../dist/http/autenticacao.js'
import { Notificador } from '../dist/integracoes/notificador.js'
import { tratarErros } from '../dist/erros.js'
import { cifrarTexto, hashCpf, mascararCpf, somenteDigitos } from '../dist/seguranca/cpf.js'
import { ServicoSenha } from '../dist/seguranca/senha.js'
import { ServicoToken } from '../dist/seguranca/token.js'
import { Validador } from '../dist/servicos/validacao.js'

const conexao = new ConexaoBanco(':memory:')
const chaves = { cpfCriptografia: randomBytes(32), cpfHmac: randomBytes(32) }
const gerarHash = (senha) => new ServicoSenha().gerarHash(senha)

/** Gera CPFs válidos para os testes, sem depender de números decorados. */
function gerarCpf(base9) {
  const digito = (base, pesoInicial) => {
    const soma = Array.from(base, (caractere, indice) => Number(caractere) * (pesoInicial - indice))
      .reduce((total, parcela) => total + parcela, 0)
    const resto = (soma * 10) % 11
    return String(resto === 10 ? 0 : resto)
  }
  const comPrimeiro = base9 + digito(base9, 10)
  return comPrimeiro + digito(comPrimeiro, 11)
}

conexao.aplicarSeed({
  adminEmail: 'admin@teste.local',
  adminSenha: 'Senha@123',
  gerarHash,
  cifrar: (texto) => cifrarTexto(texto, chaves.cpfCriptografia),
  hashCpf: (cpf) => hashCpf(cpf, chaves.cpfHmac),
  mascarar: mascararCpf,
  incluirExemplos: false
})

test('seed preenche a capa dos livros de exemplo a partir do ISBN', () => {
  const dbCapas = new ConexaoBanco(':memory:')
  dbCapas.aplicarSeed({
    adminEmail: 'admin@capas.local',
    adminSenha: 'Senha@123',
    gerarHash,
    cifrar: (texto) => cifrarTexto(texto, chaves.cpfCriptografia),
    hashCpf: (cpf) => hashCpf(cpf, chaves.cpfHmac),
    mascarar: mascararCpf,
    incluirExemplos: true
  })
  const livros = dbCapas.db.prepare('SELECT isbn13, capa_url FROM livros ORDER BY id').all()
  assert.equal(livros.length, 3)
  for (const livro of livros) {
    assert.equal(
      livro.capa_url,
      `https://books.google.com/books/content?vid=ISBN${livro.isbn13}&printsec=frontcover&img=1&zoom=1&source=gbs_api`
    )
  }

  // Livros inativados também precisam de capa quando aparecem em consultas históricas.
  const primeiro = livros[0]
  dbCapas.db.prepare('UPDATE livros SET capa_url = NULL, deleted_at = ? WHERE isbn13 = ?').run(new Date().toISOString(), primeiro.isbn13)
  dbCapas.aplicarSeed({
    adminEmail: 'admin@capas.local',
    adminSenha: 'Senha@123',
    gerarHash,
    cifrar: (texto) => cifrarTexto(texto, chaves.cpfCriptografia),
    hashCpf: (cpf) => hashCpf(cpf, chaves.cpfHmac),
    mascarar: mascararCpf,
    incluirExemplos: true
  })
  const restaurado = dbCapas.db.prepare('SELECT capa_url FROM livros WHERE isbn13 = ?').get(primeiro.isbn13)
  assert.equal(restaurado.capa_url, primeiro.capa_url)
  dbCapas.fechar()
})

const consultasCpf = []
const cpfInexistente = gerarCpf('777888999')
const consultaCpf = {
  consultar: async (cpf) => {
    const digitos = somenteDigitos(cpf)
    consultasCpf.push(digitos)
    return { existe: digitos !== cpfInexistente, situacao: 'Regular', fonte: 'brasilapi' }
  }
}
const opcoesBase = {
  chavesCpf: chaves,
  gerarHashSenha: gerarHash,
  token: new ServicoToken('chave-de-teste-com-mais-de-dezesseis-caracteres'),
  notificador: new Notificador({ modoSimulado: true }),
  brasilApi: { feriados: async () => [] },
  consultaCpf,
  validarCpfExterno: true
}
const criarServicos = (opcoes = {}) => new CarteiraServicos(
  conexao.db, new FabricanteRepositorios(conexao.db), { ...opcoesBase, ...opcoes }
)
const servicos = criarServicos()
const admin = servicos.pessoas.usuarioPorEmail('admin@teste.local')
const TELEFONE_TESTE = '+5511999998888'

function criarLeitor(nome, cpf, email) {
  return servicos.pessoas.criarLeitor({ nome, cpf, email, telefone: TELEFONE_TESTE })
}

function criarLivro(titulo, isbn, totalExemplares) {
  const livro = servicos.catalogo.criarLivro({ titulo, isbn13: isbn })
  const exemplares = []
  for (let indice = 1; indice <= totalExemplares; indice += 1) {
    exemplares.push(servicos.catalogo.criarExemplar({
      livroId: livro.id,
      codigoTombamento: `${isbn}-${indice}`,
      estadoConservacao: 'bom'
    }))
  }
  return { livro, exemplares }
}

after(() => conexao.fechar())

test('senha nunca fica em texto puro e a conferência funciona', () => {
  const hash = gerarHash('Senha@123')
  assert.ok(!hash.includes('Senha@123'))
  assert.match(hash, /^scrypt\$/)
  assert.equal(new ServicoSenha().conferir('Senha@123', hash), true)
  assert.equal(new ServicoSenha().conferir('errada', hash), false)
})

test('CPF é cifrado, indexado por HMAC e exibido somente mascarado', () => {
  const leitor = criarLeitor('Leitor Teste', '52998224725', 'leitor@teste.local')
  const linha = conexao.db.prepare('SELECT cpf_cifrado, cpf_hash, cpf_mascara FROM leitores WHERE id = ?').get(leitor.id)
  assert.ok(Buffer.isBuffer(linha.cpf_cifrado))
  assert.ok(!linha.cpf_cifrado.toString('utf8').includes('52998224725'))
  assert.equal(linha.cpf_hash.length, 32)
  assert.ok(!linha.cpf_hash.equals(Buffer.from(somenteDigitos('52998224725'))))
  assert.equal(linha.cpf_mascara, '***.982.247-**')
  assert.equal(leitor.cpfMascara, '***.982.247-**')
  const encontrados = servicos.pessoas.listarLeitores('52998224725')
  assert.equal(encontrados.total, 1)
  assert.equal(encontrados.itens[0].id, leitor.id)
})

test('limite de empréstimos, atraso, multa e pagamento parcial', async () => {
  const leitor = criarLeitor('Leitor Limite', '16899535009', 'limite@teste.local')
  const { exemplares } = criarLivro('Livro do Limite', '9780000000001', 4)
  const criados = exemplares.slice(0, 3).map((exemplar) =>
    servicos.emprestimos.criar({ leitorId: leitor.id, exemplarId: exemplar.id }, admin.id))
  assert.equal(criados.length, 3)
  assert.throws(
    () => servicos.emprestimos.criar({ leitorId: leitor.id, exemplarId: exemplares[3].id }, admin.id),
    /limite de 3 exemplares/
  )

  conexao.db.prepare(`UPDATE emprestimos
    SET data_emprestimo = date('now', '-19 days'), data_devolucao_prevista = date('now', '-5 days')
    WHERE id = ?`).run(criados[0].id)
  await servicos.emprestimos.devolver(criados[0].id, admin.id)
  const multas = servicos.emprestimos.listarMultas({ leitorId: leitor.id })
  assert.equal(multas.total, 1)
  assert.equal(multas.itens[0].diasAtraso, 5)
  assert.equal(multas.itens[0].valorCentavos, 250)
  assert.equal(multas.itens[0].status, 'pendente')

  const multaId = multas.itens[0].id
  servicos.emprestimos.pagarMulta({ multaId, valorCentavos: 100, forma: 'pix' }, admin.id)
  assert.equal(servicos.emprestimos.multaPorId(multaId).status, 'pendente')
  servicos.emprestimos.pagarMulta({ multaId, valorCentavos: 150, forma: 'dinheiro' }, admin.id)
  assert.equal(servicos.emprestimos.multaPorId(multaId).status, 'paga')
})

test('uma renovação, bloqueio por fila e teto da multa', () => {
  const leitor = criarLeitor('Leitor Renovação', '11144477735', 'renovacao@teste.local')
  const { exemplares } = criarLivro('Livro da Renovação', '9780000000002', 1)
  const emprestimo = servicos.emprestimos.criar({ leitorId: leitor.id, exemplarId: exemplares[0].id }, admin.id)
  const renovado = servicos.emprestimos.renovar(emprestimo.id)
  assert.equal(renovado.renovacoes, 1)
  assert.throws(() => servicos.emprestimos.renovar(emprestimo.id), /já usou a renovação/)

  const outro = criarLeitor('Outro Leitor', '10000000019', 'outro@teste.local')
  const reserva = servicos.reservas.criar({ leitorId: outro.id, livroId: exemplares[0].livroId }, admin.id)
  assert.equal(reserva.status, 'aguardando')
  assert.throws(() => servicos.emprestimos.renovar(emprestimo.id), /leitores aguardando/)
  servicos.reservas.cancelar(reserva.id)
})

test('fila FIFO: devolução notifica o primeiro e a retirada gera empréstimo', async () => {
  const titular = criarLeitor('Titular da Fila', '12345678909', 'titular@teste.local')
  const primeiro = criarLeitor('Primeiro da Fila', '98765432100', 'primeiro@teste.local')
  const segundo = criarLeitor('Segundo da Fila', '11122233396', 'segundo@teste.local')
  const { livro, exemplares } = criarLivro('Livro da Fila', '9780000000003', 1)
  const emprestimo = servicos.emprestimos.criar({ leitorId: titular.id, exemplarId: exemplares[0].id }, admin.id)
  const primeira = servicos.reservas.criar({ leitorId: primeiro.id, livroId: livro.id }, admin.id)
  servicos.reservas.criar({ leitorId: segundo.id, livroId: livro.id }, admin.id)

  await servicos.emprestimos.devolver(emprestimo.id, admin.id)
  const promovida = servicos.reservas.reservaPorId(primeira.id)
  assert.equal(promovida.status, 'disponivel_para_retirada')
  assert.ok(promovida.prazoRetiradaFim)
  assert.equal(promovida.posicao, 1)
  const avisos = servicos.notificacoes.listar({ leitorId: primeiro.id })
  assert.equal(avisos.total, 1)
  assert.equal(avisos.itens[0].tipo, 'reserva_disponivel')
  assert.equal(avisos.itens[0].status, 'enviada')

  const retirada = servicos.reservas.registrarRetirada(primeira.id, admin.id)
  assert.equal(retirada.status, 'retirado')
  assert.ok(retirada.emprestimoId)
  const fila = servicos.reservas.listar({ livroId: livro.id, fila: true })
  assert.equal(fila.itens.length, 1)
  assert.equal(fila.itens[0].leitorId, segundo.id)
  assert.equal(fila.itens[0].posicao, 1)
})

test('agendamento respeita o limite de 3 dias e devolve o exemplar ao cancelar', () => {
  const leitor = criarLeitor('Leitor Agendamento', '12345678062', 'agendamento@teste.local')
  const { exemplares } = criarLivro('Livro do Agendamento', '9780000000004', 1)
  const exemplar = exemplares[0]
  const dados = { leitorId: leitor.id, exemplarId: exemplar.id }

  assert.throws(
    () => servicos.reservas.criarAgendamento({ ...dados, dataAgendada: adicionarDias(hoje(), 4) }, admin.id),
    /entre hoje e/
  )

  const agendamento = servicos.reservas.criarAgendamento({
    ...dados, dataAgendada: adicionarDias(hoje(), 3)
  }, admin.id)
  assert.equal(agendamento.status, 'ativo')
  assert.equal(servicos.catalogo.exemplarPorId(exemplar.id).status, 'agendado')

  servicos.reservas.cancelarAgendamento(agendamento.id)
  assert.equal(servicos.catalogo.exemplarPorId(exemplar.id).status, 'disponivel')
})

test('retirada vencida volta para a fila e avisa o próximo leitor', async () => {
  const titular = criarLeitor('Titular Expiração', '23456789092', 'expiracao-titular@teste.local')
  const primeiro = criarLeitor('Primeiro Expiração', '34567890175', 'expiracao-primeiro@teste.local')
  const segundo = criarLeitor('Segundo Expiração', '45678901249', 'expiracao-segundo@teste.local')
  const { livro, exemplares } = criarLivro('Livro da Expiração', '9780000000005', 1)
  const emprestimo = servicos.emprestimos.criar({ leitorId: titular.id, exemplarId: exemplares[0].id }, admin.id)
  const primeira = servicos.reservas.criar({ leitorId: primeiro.id, livroId: livro.id }, admin.id)
  const segunda = servicos.reservas.criar({ leitorId: segundo.id, livroId: livro.id }, admin.id)

  await servicos.emprestimos.devolver(emprestimo.id, admin.id)
  conexao.db.prepare(`UPDATE reservas
    SET prazo_retirada_inicio = datetime('now', '-2 hours'), prazo_retirada_fim = datetime('now', '-1 hour')
    WHERE id = ?`).run(primeira.id)

  await servicos.reservas.expirarVencidas()
  assert.equal(servicos.reservas.reservaPorId(primeira.id).status, 'expirado')
  const promovida = servicos.reservas.reservaPorId(segunda.id)
  assert.equal(promovida.status, 'disponivel_para_retirada')
  assert.equal(promovida.posicao, 1)
  assert.equal(servicos.catalogo.exemplarPorId(exemplares[0].id).status, 'reservado')

  const avisosPrimeiro = servicos.notificacoes.listar({ leitorId: primeiro.id })
  assert.ok(avisosPrimeiro.itens.some((aviso) => aviso.tipo === 'expiracao_reserva'))
  const avisosSegundo = servicos.notificacoes.listar({ leitorId: segundo.id })
  assert.ok(avisosSegundo.itens.some((aviso) => aviso.tipo === 'reserva_disponivel'))
})

test('prazo de 24 horas termina no próximo dia útil', () => {
  assert.equal(proximoDiaUtil('2026-11-21'), '2026-11-23')
  assert.equal(proximoDiaUtil('2026-11-22'), '2026-11-23')
  assert.equal(proximoDiaUtil('2026-11-25', ['2026-11-25']), '2026-11-26')
  assert.equal(proximoDiaUtil('2026-11-23'), '2026-11-23')
})

test('agendador cria lembrete de vencimento uma única vez', async () => {
  const leitor = criarLeitor('Leitor Lembrete', '56789012303', 'lembrete@teste.local')
  const { exemplares } = criarLivro('Livro do Lembrete', '9780000000006', 1)
  const emprestimo = servicos.emprestimos.criar({ leitorId: leitor.id, exemplarId: exemplares[0].id }, admin.id)
  conexao.db.prepare("UPDATE emprestimos SET data_devolucao_prevista = date('now', '+1 day') WHERE id = ?")
    .run(emprestimo.id)

  const agendador = new Agendador(servicos)
  await agendador.executar()
  assert.equal(servicos.notificacoes.listar({ leitorId: leitor.id, tipo: 'lembrete_vencimento' }).total, 1)

  await agendador.executar()
  assert.equal(servicos.notificacoes.listar({ leitorId: leitor.id, tipo: 'lembrete_vencimento' }).total, 1)
})

test('ativação troca o código por senha com hash', () => {
  const leitor = criarLeitor('Leitor Ativação', '67890123469', 'ativacao@teste.local')
  const email = 'usuario-ativacao@teste.local'
  const resultado = servicos.pessoas.criarUsuario({
    nome: 'Usuário Ativação', email, perfil: 'LEITOR', leitorId: leitor.id
  })
  assert.ok(resultado.codigoAtivacao)

  servicos.pessoas.ativarUsuario(email, resultado.codigoAtivacao ?? '', 'SenhaNova@123')
  const usuario = servicos.pessoas.usuarioPorEmail(email)
  assert.equal(new ServicoSenha().conferir('SenhaNova@123', String(usuario?.senha_hash)), true)
  assert.equal(new ServicoSenha().conferir('Senha@123', String(usuario?.senha_hash)), false)
})

test('conta de leitor é localizada pelo CPF cifrado para o login do cliente', () => {
  const leitor = criarLeitor('Leitor Login', '70000000078', 'login-cliente@teste.local')
  servicos.pessoas.criarUsuario({
    nome: 'Cliente da Biblioteca',
    email: 'conta-cliente@teste.local',
    perfil: 'LEITOR',
    leitorId: leitor.id,
    senha: 'Leitor@123'
  })

  const usuario = servicos.pessoas.usuarioPorCpf('700.000.000-78')
  assert.ok(usuario)
  assert.equal(usuario.perfil, 'LEITOR')
  assert.equal(usuario.leitor_id, leitor.id)
  assert.equal(new ServicoSenha().conferir('Leitor@123', String(usuario.senha_hash)), true)
  assert.equal(servicos.pessoas.usuarioPorCpf('123'), undefined)
})

test('importação de metadados grava autor, editora, categoria e livro sem duplicar', () => {
  const sugestao = {
    titulo: 'Livro Importado da API',
    subtitulo: 'Um subtítulo veio da API',
    autores: ['Autora Importada'],
    editora: 'Editora Importada',
    isbn13: '9780000000099',
    anoPublicacao: 2024,
    descricaoCurta: 'Sinopse curta obtida da consulta externa.',
    capaUrl: 'https://books.example.com/capa.jpg',
    categorias: ['Ficção'],
    fonte: 'google-books'
  }

  const importado = servicos.catalogo.importarLivro(sugestao)
  assert.equal(importado.jaExistia, false)
  assert.equal(importado.autoresCriados, 1)
  assert.equal(importado.categoriasCriadas, 1)
  assert.equal(importado.editoraCriada, true)
  assert.equal(importado.livro.titulo, sugestao.titulo)
  assert.equal(importado.livro.subtitulo, sugestao.subtitulo)
  assert.equal(importado.livro.autores.length, 1)
  assert.equal(importado.livro.categorias.length, 1)
  assert.equal(importado.livro.editoraId !== null, true)

  const repetido = servicos.catalogo.importarLivro(sugestao)
  assert.equal(repetido.jaExistia, true)
  assert.equal(repetido.livro.id, importado.livro.id)
  assert.equal(servicos.catalogo.listarAutores('Autora Importada').length, 1)
  assert.equal(servicos.catalogo.listarEditoras('Editora Importada').length, 1)
})

test('inativar leitor remove vínculos ativos, oculta o nome e derruba sessões antigas', async () => {
  const leitor = criarLeitor('Leitor Inativacao', '39053344705', 'inativacao@teste.local')
  const outro = criarLeitor('Outro Leitor', '55544433380', 'outro-inativacao@teste.local')
  const { usuario } = servicos.pessoas.criarUsuario({
    nome: 'Leitor Inativacao',
    email: 'inativacao@teste.local',
    perfil: 'LEITOR',
    leitorId: leitor.id,
    senha: 'Senha@123'
  })
  const token = servicos.token.emitir({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: 'LEITOR',
    leitorId: leitor.id
  })

  const historico = criarLivro('Livro do Historico', '9780000000105', 1)
  const emprestimo = servicos.emprestimos.criar(
    { leitorId: leitor.id, exemplarId: historico.exemplares[0].id }, admin.id
  )
  await servicos.emprestimos.devolver(emprestimo.id, admin.id)

  const daFila = criarLivro('Livro da Fila', '9780000000112', 1)
  servicos.emprestimos.criar({ leitorId: outro.id, exemplarId: daFila.exemplares[0].id }, admin.id)
  const reserva = servicos.reservas.criar({ leitorId: leitor.id, livroId: daFila.livro.id }, admin.id)

  const agendado = criarLivro('Livro Agendado', '9780000000129', 1)
  const agendamento = servicos.reservas.criarAgendamento({
    leitorId: leitor.id, exemplarId: agendado.exemplares[0].id, dataAgendada: hoje()
  }, admin.id)

  const consentimentoId = servicos.pessoas.criarConsentimento({
    leitorId: leitor.id, telefone: '11999999999', consentimento: true, origem: 'formulario'
  })
  await servicos.notificacoes.registrar({
    leitorId: leitor.id,
    tipo: 'lembrete_vencimento',
    destinatario: 'inativacao@teste.local',
    assunto: 'Aviso para Leitor Inativacao',
    mensagem: 'Olá, Leitor Inativacao! Seu livro vence em breve.',
    chaveIdempotencia: `inativacao-${leitor.id}`
  })

  assert.equal(servicos.pessoas.usuarioPorCpf('39053344705')?.id, usuario.id)
  assert.equal(servicos.pessoas.listarLeitores('39053344705').total, 1)

  servicos.pessoas.inativarLeitor(leitor.id)

  assert.equal(servicos.pessoas.usuarioEstaAtivo(usuario.id), false)
  assert.equal(servicos.pessoas.usuarioPorCpf('39053344705'), undefined)
  assert.equal(servicos.pessoas.listarLeitores('39053344705', 'ativos').total, 0)
  assert.equal(servicos.pessoas.listarLeitores('39053344705', 'inativos').total, 1)
  assert.equal(servicos.pessoas.listarUsuarios('inativacao@teste.local', 1, 50, 'ativos').total, 0)
  assert.equal(servicos.pessoas.listarUsuarios('inativacao@teste.local', 1, 50, 'inativos').total >= 1, true)
  assert.equal(servicos.reservas.reservaPorId(reserva.id).status, 'cancelado')
  assert.equal(servicos.reservas.agendamentoPorId(agendamento.id).status, 'cancelado')
  assert.equal(conexao.db.prepare('SELECT status FROM exemplares WHERE id = ?').get(agendado.exemplares[0].id).status, 'disponivel')
  assert.equal(conexao.db.prepare('SELECT status FROM exemplares WHERE id = ?').get(daFila.exemplares[0].id).status, 'emprestado')

  const consentimento = servicos.pessoas.consentimentoPorId(consentimentoId)
  assert.equal(Number(consentimento.consentimento), 0)
  assert.equal(consentimento.nome_leitor, 'Leitor inativo')
  assert.equal(servicos.pessoas.listarConsentimentos().find((item) => item.id === consentimentoId).nome_leitor, 'Leitor inativo')

  const notificacao = servicos.notificacoes.listar({ leitorId: leitor.id }).itens[0]
  assert.ok(notificacao)
  assert.ok(!notificacao.destinatarioMascara.includes('inativacao'))
  assert.equal(servicos.emprestimos.listar({ leitorId: leitor.id }).itens[0].nomeLeitor, 'Leitor inativo')
  assert.throws(
    () => servicos.reservas.criar({ leitorId: leitor.id, livroId: daFila.livro.id }, admin.id),
    /não está ativo/
  )

  const aplicacao = express()
  aplicacao.use(autenticar(servicos))
  aplicacao.get('/prova', (_requisicao, resposta) => resposta.json({ ok: true }))
  aplicacao.use(tratarErros)
  const servidor = aplicacao.listen(0, '127.0.0.1')
  await once(servidor, 'listening')
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/prova`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    assert.equal(resposta.status, 401)
    assert.match((await resposta.json()).erro.mensagem, /desativada/i)
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()))
  }
})

test('Validador.telefone aceita máscara, DDI explícito e DDD 55, e recusa números curtos', () => {
  assert.equal(Validador.telefone('(11) 99999-8888'), '+5511999998888')
  assert.equal(Validador.telefone('11999998888'), '+5511999998888')
  assert.equal(Validador.telefone('+55 (21) 98888-7777'), '+5521988887777')
  assert.equal(Validador.telefone('55999998888'), '+5555999998888')
  assert.equal(Validador.telefone('+1 202 555 0123'), '+12025550123')
  assert.equal(Validador.telefone(''), undefined)
  assert.throws(
    () => Validador.telefone('123'),
    (erro) => typeof erro.detalhes?.telefone === 'string'
  )
})

function erroTelefone(erro) {
  return erro.codigo === 'DADOS_INVALIDOS' && typeof erro.detalhes?.telefone === 'string'
}

test('telefone é obrigatório e digitado com máscara é normalizado no cadastro público e no administrativo', async () => {
  const cpf = gerarCpf('999888777')
  const email = 'telefone-mascara@gmail.com'
  const totalLeitores = conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total
  const publico = await servicos.pessoas.cadastrarLeitor({
    nome: 'Telefone Mascarado', cpf, email,
    telefone: '(11) 99999-8888', senha: 'Leitor@Forte123'
  })
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total, totalLeitores + 1)
  assert.equal(typeof publico.usuario.leitorId, 'number')
  assert.equal(
    conexao.db.prepare('SELECT telefone FROM leitores WHERE id = ?').get(publico.usuario.leitorId).telefone,
    '+5511999998888'
  )

  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({
      nome: 'Sem Telefone Público', cpf: gerarCpf('999888780'),
      email: 'sem-telefone-publico@gmail.com', senha: 'Leitor@Forte123'
    }),
    erroTelefone
  )

  const administrativo = servicos.pessoas.criarLeitor({
    nome: 'Telefone Administrativo', cpf: gerarCpf('999888778'), telefone: '+55 (21) 98888-7777'
  })
  assert.equal(
    conexao.db.prepare('SELECT telefone FROM leitores WHERE id = ?').get(administrativo.id).telefone,
    '+5521988887777'
  )
  assert.throws(
    () => servicos.pessoas.criarLeitor({
      nome: 'Sem Telefone Administrativo', cpf: gerarCpf('999888781'), email: 'sem-telefone-admin@teste.local'
    }),
    erroTelefone
  )
  assert.throws(
    () => servicos.pessoas.criarLeitor({ nome: 'Telefone Curto', cpf: gerarCpf('999888779'), telefone: '123' }),
    (erro) => typeof erro.detalhes?.telefone === 'string'
  )
})

test('cadastro público de leitor valida CPF externo e cria a conta ativa imediatamente', async () => {
  const cpf = gerarCpf('222333444')
  const email = 'cadastro-publico@gmail.com'
  const senha = 'Leitor@Forte123'
  const antes = consultasCpf.length
  const { mensagem, usuario } = await servicos.pessoas.cadastrarLeitor({
    nome: 'Leitor do Cadastro Público',
    cpf,
    email,
    telefone: TELEFONE_TESTE,
    senha
  })

  assert.equal(consultasCpf.length, antes + 1)
  assert.equal(consultasCpf.at(-1), cpf)
  assert.match(mensagem, /acesso já está ativo/)
  assert.equal(usuario.perfil, 'LEITOR')
  assert.equal(conexao.db.prepare('SELECT ativo FROM usuarios WHERE id = ?').get(usuario.id).ativo, 1)
  assert.equal(typeof usuario.leitorId, 'number')
  assert.equal(servicos.pessoas.usuarioPorCpf(cpf)?.id, usuario.id)
  const linhaUsuario = conexao.db.prepare('SELECT senha_hash, email_verificado_em FROM usuarios WHERE id = ?').get(usuario.id)
  const linhaLeitor = conexao.db.prepare('SELECT cpf_cifrado FROM leitores WHERE id = ?').get(usuario.leitorId)
  assert.ok(!linhaUsuario.senha_hash.includes(senha))
  assert.equal(new ServicoSenha().conferir(senha, linhaUsuario.senha_hash), true)
  assert.ok(linhaUsuario.email_verificado_em)
  assert.ok(!linhaLeitor.cpf_cifrado.toString('utf8').includes(cpf))

  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({
      nome: 'CPF Repetido', cpf, email: 'outro-cadastro@gmail.com', senha, telefone: TELEFONE_TESTE
    }),
    /Já existe um cadastro ativo com este CPF/
  )
  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({
      nome: 'E-mail Repetido', cpf: gerarCpf('222333445'), email, senha, telefone: TELEFONE_TESTE
    }),
    /Já existe uma conta com este e-mail/
  )
  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({
      nome: 'Senha Fraca', cpf: gerarCpf('222333446'), email: 'senha-fraca@gmail.com',
      senha: 'fraca123', telefone: TELEFONE_TESTE
    }),
    (erro) => erro.detalhes?.senha?.includes('10 caracteres') === true
  )
  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({
      nome: 'CPF Inexistente', cpf: cpfInexistente, email: 'cpf-inexistente@gmail.com',
      senha, telefone: TELEFONE_TESTE
    }),
    /Não encontramos este CPF/
  )
})

test('cadastro público aceita os provedores da lista e normaliza maiúsculas e espaços', async () => {
  const dominios = [
    'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
    'yahoo.com.br', 'icloud.com', 'uol.com.br', 'bol.com.br'
  ]
  for (const [indice, dominio] of dominios.entries()) {
    const email = `  Leitor${indice}@${dominio.toUpperCase()}  `
    const cpf = gerarCpf(`101010${String(indice).padStart(3, '0')}`)
    const { usuario } = await servicos.pessoas.cadastrarLeitor({
      nome: `Leitor ${dominio}`, cpf, email,
      telefone: TELEFONE_TESTE, senha: 'Leitor@Forte123'
    })
    assert.equal(usuario.email, `leitor${indice}@${dominio}`)
    assert.equal(conexao.db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(usuario.email) !== undefined, true)
  }
})

test('cadastro público recusa domínios fora da lista com mensagem orientadora', async () => {
  const emailsInvalidos = [
    'fora@exemplo.com',
    'gadf@uol.com',
    'semarroba.gmail.com',
    'dois@@gmail.com',
    '@gmail.com',
    ' usuario@gmail.com.extra '
  ]
  const totalUsuarios = conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total
  const totalLeitores = conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total

  for (const email of emailsInvalidos) {
    await assert.rejects(
      servicos.pessoas.cadastrarLeitor({
        nome: 'E-mail Fora da Lista', cpf: gerarCpf('222555666'), email,
        telefone: TELEFONE_TESTE, senha: 'Leitor@Forte123'
      }),
      (erro) => erro.codigo === 'DADOS_INVALIDOS'
        && erro.detalhes?.email === 'Use um e-mail Gmail, Outlook, Hotmail, Yahoo ou similar.'
    )
  }
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, totalUsuarios)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total, totalLeitores)
})

test('cadastro público não deixa registro parcial quando a validação falha', async () => {
  const totalUsuarios = conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total
  const totalLeitores = conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total
  const dados = {
    nome: 'Validação Sem Registro', cpf: gerarCpf('333444555'),
    email: 'validacao-parcial@outlook.com', telefone: TELEFONE_TESTE, senha: 'Leitor@Forte123'
  }

  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({ ...dados, senha: 'fraca123' }),
    (erro) => typeof erro.detalhes?.senha === 'string'
  )
  await assert.rejects(
    servicos.pessoas.cadastrarLeitor({ ...dados, cpf: cpfInexistente }),
    /Não encontramos este CPF/
  )
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, totalUsuarios)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total, totalLeitores)

  await servicos.pessoas.cadastrarLeitor(dados)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, totalUsuarios + 1)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores').get().total, totalLeitores + 1)
})

test('convite de administrador é individual, cifrado, de uso único e revogável', async () => {
  const senha = 'Equipe@Forte123'
  assert.throws(
    () => servicos.pessoas.criarConvite({ perfil: 'ATENDENTE', criadoPorUsuarioId: admin.id }),
    (erro) => erro?.codigo === 'DADOS_INVALIDOS' &&
      String(erro?.detalhes?.perfil ?? '').includes('ADMIN')
  )
  const convite = servicos.pessoas.criarConvite({
    perfil: 'ADMIN',
    email: 'convidado@gmail.com',
    criadoPorUsuarioId: admin.id
  })

  assert.equal(convite.codigo.length, 12)
  assert.match(convite.convite.codigoMascara, /^[A-Z2-9]{4}••••••••$/)
  const linha = conexao.db.prepare('SELECT codigo_hash FROM convites WHERE id = ?').get(convite.convite.id)
  assert.equal(linha.codigo_hash.length, 64)
  assert.ok(!linha.codigo_hash.includes(convite.codigo))

  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: 'ZZZZZZZZZZZZ', nome: 'Sem Convite', email: 'sem-convite@gmail.com', senha
    }),
    /Convite inválido/
  )
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: convite.codigo, nome: 'Outro E-mail', email: 'outro-convite@gmail.com', senha
    }),
    /emitido para outro e-mail/
  )

  const criado = await servicos.pessoas.cadastrarEquipe({
    codigo: convite.codigo,
    nome: 'Administrador Convidado',
    email: 'convidado@gmail.com',
    senha
  })
  assert.equal(criado.usuario.perfil, 'ADMIN')
  assert.equal(conexao.db.prepare('SELECT ativo FROM usuarios WHERE id = ?').get(criado.usuario.id).ativo, 1)
  assert.equal(servicos.pessoas.convitePorId(convite.convite.id).usadoEm !== null, true)
  const hashEquipe = conexao.db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(criado.usuario.id).senha_hash
  assert.equal(new ServicoSenha().conferir(senha, hashEquipe), true)
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: convite.codigo, nome: 'Segundo Uso', email: 'segundo-uso@gmail.com', senha
    }),
    /foi usado/
  )
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: convite.codigo, nome: 'Domínio Fora da Lista', email: 'fora@exemplo.com', senha
    }),
    /Use um e-mail Gmail/
  )

  const revogado = servicos.pessoas.criarConvite({ perfil: 'ADMIN', criadoPorUsuarioId: admin.id })
  servicos.pessoas.revogarConvite(revogado.convite.id)
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: revogado.codigo, nome: 'Convite Revogado', email: 'revogado@gmail.com', senha
    }),
    /revogado/
  )

  const expirado = servicos.pessoas.criarConvite({ perfil: 'ADMIN', criadoPorUsuarioId: admin.id })
  conexao.db.prepare('UPDATE convites SET expira_em = ? WHERE id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), expirado.convite.id)
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: expirado.codigo, nome: 'Convite Vencido', email: 'vencido@gmail.com', senha
    }),
    /venceu/
  )

  const fraco = servicos.pessoas.criarConvite({ perfil: 'ADMIN', criadoPorUsuarioId: admin.id })
  await assert.rejects(
    servicos.pessoas.cadastrarEquipe({
      codigo: fraco.codigo, nome: 'Senha Fraca', email: 'fraca-equipe@gmail.com', senha: 'curta1'
    }),
    (erro) => erro.detalhes?.senha?.includes('10 caracteres') === true
  )
})

test('administrador do cliente substitui o administrador local sem apagar histórico', () => {
  const email = 'admin-cliente@teste.local'
  const senha = 'Cliente@Forte123'
  const antes = conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total
  const troca = servicos.pessoas.trocarAdministrador({
    nome: 'Administrador do Cliente', email, senha
  }, admin.id)

  assert.equal(troca.usuario.perfil, 'ADMIN')
  assert.equal(troca.usuario.ativo, true)
  assert.equal(troca.usuario.email, email)
  assert.equal(troca.inativado.id, admin.id)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, antes + 1)
  const antigo = conexao.db.prepare('SELECT ativo, deleted_at FROM usuarios WHERE id = ?').get(admin.id)
  assert.equal(antigo.ativo, 0)
  assert.equal(antigo.deleted_at, null)
  const hash = conexao.db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(troca.usuario.id).senha_hash
  assert.equal(new ServicoSenha().conferir(senha, hash), true)
  assert.equal(servicos.pessoas.usuarioPorEmail(email)?.id, troca.usuario.id)
  assert.equal(servicos.pessoas.usuarioPorEmail(admin.email), undefined)
  assert.throws(
    () => servicos.pessoas.trocarAdministrador({
      nome: 'Outro Administrador', email: 'outro-admin@teste.local', senha
    }, troca.usuario.id + 9999),
    /administrador ativo/
  )
})

test('edição de usuário persiste nome, situação e vínculo com leitor', () => {
  const usuario = servicos.pessoas.usuarioPorEmail('convidado@gmail.com')
  const leitor = servicos.pessoas.listarLeitores().itens[0]
  const alterado = servicos.pessoas.atualizarUsuario(usuario.id, {
    nome: 'Administrador Atualizado',
    ativo: false,
    leitorId: leitor.id
  })
  assert.equal(alterado.nome, 'Administrador Atualizado')
  assert.equal(alterado.ativo, false)
  assert.equal(alterado.leitorId, leitor.id)
  const reativado = servicos.pessoas.atualizarUsuario(usuario.id, { ativo: true })
  assert.equal(reativado.ativo, true)
  assert.equal(reativado.leitorId, leitor.id)
})

test('CPF inativado pode ser cadastrado novamente e inativar usuário também inativa o leitor', async () => {
  const cpf = gerarCpf('666777888')
  const antigo = servicos.pessoas.criarLeitor({
    nome: 'Leitor Antigo', cpf, email: 'antigo@teste.local', telefone: TELEFONE_TESTE
  })
  assert.throws(
    () => servicos.pessoas.criarLeitor({
      nome: 'Duplicado', cpf, email: 'duplicado@teste.local', telefone: TELEFONE_TESTE
    }),
    /CPF/
  )
  servicos.pessoas.inativarLeitor(antigo.id)

  const hash = hashCpf(cpf, chaves.cpfHmac)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores WHERE cpf_hash = ?').get(hash).total, 1)
  const { usuario } = await servicos.pessoas.cadastrarLeitor({
    nome: 'Leitor Novo', cpf, email: 'reaproveitado@gmail.com',
    senha: 'Leitor@Forte123', telefone: TELEFONE_TESTE
  })
  assert.notEqual(usuario.leitorId, antigo.id)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM leitores WHERE cpf_hash = ?').get(hash).total, 2)

  servicos.pessoas.inativarUsuario(usuario.id)
  const leitorInativado = conexao.db.prepare('SELECT deleted_at, ativo FROM leitores WHERE id = ?').get(usuario.leitorId)
  assert.ok(leitorInativado.deleted_at)
  assert.equal(leitorInativado.ativo, 0)
})

test('exclusão definitiva remove dados pessoais e oculta o leitor das listagens', () => {
  const cpf = gerarCpf('888999000')
  const leitor = servicos.pessoas.criarLeitor({
    nome: 'Leitor Para Excluir', cpf, email: 'excluir@teste.local', telefone: TELEFONE_TESTE
  })

  assert.throws(
    () => servicos.pessoas.excluirDefinitivamente(leitor.id),
    /Inative o leitor antes/
  )
  servicos.pessoas.inativarLeitor(leitor.id)
  servicos.pessoas.excluirDefinitivamente(leitor.id)

  const visiveis = servicos.pessoas.listarLeitores(undefined, true).itens
  assert.equal(visiveis.some((item) => item.id === leitor.id), false)
  assert.throws(() => servicos.pessoas.leitorPorId(leitor.id), /não encontrado/)
  assert.throws(() => servicos.pessoas.excluirDefinitivamente(leitor.id), /não encontrado/)

  const linha = conexao.db.prepare('SELECT nome, cpf_mascara, email, telefone, excluido_em FROM leitores WHERE id = ?').get(leitor.id)
  assert.equal(linha.nome, 'Leitor removido')
  assert.equal(linha.cpf_mascara, '***.***.***-**')
  assert.equal(linha.email, null)
  assert.equal(linha.telefone, null)
  assert.ok(linha.excluido_em)
})

test('inativos ficam visíveis por padrão e podem ser separados por situacao', () => {
  const autor = servicos.catalogo.criarAutor({ nome: 'Autor Situação' })
  const { livro } = criarLivro('Livro Situação', '9780000000201', 1)
  servicos.catalogo.inativarAutor(autor.id)
  servicos.catalogo.inativarLivro(livro.id)

  assert.equal(servicos.catalogo.listarAutores('Autor Situação').some((item) => item.id === autor.id), true)
  assert.equal(servicos.catalogo.listarAutores('Autor Situação', 'ativos').some((item) => item.id === autor.id), false)
  assert.equal(servicos.catalogo.listarAutores('Autor Situação', 'inativos').some((item) => item.id === autor.id), true)

  assert.equal(servicos.catalogo.listarLivros({ q: 'Livro Situação' }).itens.some((item) => item.id === livro.id), true)
  assert.equal(servicos.catalogo.listarLivros({ q: 'Livro Situação', situacao: 'ativos' }).total, 0)
  assert.equal(servicos.catalogo.listarLivros({ q: 'Livro Situação', situacao: 'inativos' }).total, 1)

  const exemplares = servicos.catalogo.listarExemplares(undefined, livro.id)
  assert.equal(exemplares.some((item) => item.livroId === livro.id), true)
})

test('exclusão física apaga apenas inativos sem vínculo e bloqueia histórico', () => {
  const autorLivre = servicos.catalogo.criarAutor({ nome: 'Autor Sem Vínculo' })
  assert.throws(() => servicos.exclusaoFisica.excluir('autores', autorLivre.id), /Inative o registro/)
  servicos.catalogo.inativarAutor(autorLivre.id)
  servicos.exclusaoFisica.excluir('autores', autorLivre.id)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM autores WHERE id = ?').get(autorLivre.id).total, 0)

  const autorVinculado = servicos.catalogo.criarAutor({ nome: 'Autor Com Vínculo' })
  const { livro } = criarLivro('Livro Do Autor Vinculado', '9780000000202', 1)
  conexao.db.prepare('INSERT INTO livro_autores (livro_id, autor_id, ordem) VALUES (?, ?, 1)').run(livro.id, autorVinculado.id)
  conexao.db.prepare('UPDATE autores SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), autorVinculado.id)
  assert.throws(
    () => servicos.exclusaoFisica.excluir('autores', autorVinculado.id),
    (erro) => erro.status === 409 && /livros vinculados/.test(erro.detalhes?.vinculos ?? '')
  )

  const { livro: livroLivre } = criarLivro('Livro Sem Histórico', '9780000000203', 1)
  assert.throws(() => servicos.exclusaoFisica.excluir('livros', livroLivre.id), /Inative o registro/)
  servicos.catalogo.inativarLivro(livroLivre.id)
  servicos.exclusaoFisica.excluir('livros', livroLivre.id)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM livros WHERE id = ?').get(livroLivre.id).total, 0)
  assert.equal(conexao.db.prepare('SELECT COUNT(*) AS total FROM exemplares WHERE livro_id = ?').get(livroLivre.id).total, 0)
})
