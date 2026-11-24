import { Router, type Response } from 'express'
import type { Perfil, UsuarioLogado } from '@biblioteca/shared'
import { ErroDeDominio } from './erros.js'
import { somenteDigitos } from './seguranca/cpf.js'
import { ServicoSenha } from './seguranca/senha.js'
import type { CarteiraServicos } from './servicos/carteira.js'
import {
  assync, autenticar, booleanoDaConsulta, corpo, garantirLeitor, idDaRota,
  numeroDaConsulta, permitir, situacaoDaConsulta, textoDaConsulta, usuarioAtual
} from './http/autenticacao.js'

const TODOS: Perfil[] = ['ADMIN', 'LEITOR']
const ADMIN: Perfil[] = ['ADMIN']

interface ListaSimples<T> {
  itens: T[]
  total: number
  pagina: number
  porPagina: number
}

function pagina<T>(itens: T[], total: number, numero = 1, tamanho = itens.length): ListaSimples<T> {
  return { itens, total, pagina: numero, porPagina: tamanho }
}

function senhaDoCorpo(corpoRequisicao: Record<string, unknown>): string {
  const valor = corpoRequisicao['senha'] ?? corpoRequisicao['novaSenha']
  if (typeof valor !== 'string') throw ErroDeDominio.validacao('Informe a senha.', { senha: 'Obrigatório.' })
  return valor
}

function responderLogin(
  servicos: CarteiraServicos,
  usuario: Record<string, unknown>,
  resposta: Response,
  mensagemCredenciais: string
): void {
  if (typeof usuario.senha_hash !== 'string' || usuario.senha_hash === '') {
    throw new ErroDeDominio(401, 'CREDENCIAIS_INVALIDAS', mensagemCredenciais)
  }
  servicos.pessoas.registrarLogin(Number(usuario.id))
  const logado: UsuarioLogado = {
    id: Number(usuario.id),
    nome: String(usuario.nome),
    email: String(usuario.email),
    perfil: String(usuario.perfil) as UsuarioLogado['perfil'],
    leitorId: usuario.leitor_id === null || usuario.leitor_id === undefined ? null : Number(usuario.leitor_id),
    somenteLeitura: usuario.somente_leitura === 1
  }
  resposta.json({ token: servicos.token.emitir(logado), usuario: logado })
}

/** Cadastro concluído devolve a mesma sessão do login, já com token. */
function responderCadastro(
  servicos: CarteiraServicos,
  cadastro: { mensagem: string; usuario: UsuarioLogado },
  resposta: Response
): void {
  servicos.pessoas.registrarLogin(cadastro.usuario.id)
  resposta.status(201).json({
    mensagem: cadastro.mensagem,
    token: servicos.token.emitir(cadastro.usuario),
    usuario: cadastro.usuario
  })
}

export function criarRotas(servicos: CarteiraServicos): Router {
  const rotas = Router()
  const auth = autenticar(servicos)

  rotas.post('/auth/login', assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const email = dados['email']
    const senha = senhaDoCorpo(dados)
    if (typeof email !== 'string' || email === '') {
      throw ErroDeDominio.validacao('Informe o e-mail.', { email: 'Obrigatório.' })
    }
    const usuario = servicos.pessoas.usuarioPorEmail(email.toLowerCase())
    const mensagem = 'E-mail ou senha incorretos.'
    if (usuario === undefined) throw new ErroDeDominio(401, 'CREDENCIAIS_INVALIDAS', mensagem)
    if (!new ServicoSenha().conferir(senha, String(usuario.senha_hash ?? ''))) {
      throw new ErroDeDominio(401, 'CREDENCIAIS_INVALIDAS', mensagem)
    }
    responderLogin(servicos, usuario, resposta, mensagem)
  }))

  rotas.post('/auth/login-leitor', assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const identificador = dados['cpf'] ?? dados['identificador']
    const cpf = typeof identificador === 'string' ? somenteDigitos(identificador) : ''
    if (cpf.length !== 11) {
      throw ErroDeDominio.validacao('Informe o CPF com 11 dígitos.', { cpf: 'Digite os 11 números do CPF.' })
    }
    const senha = senhaDoCorpo(dados)
    const usuario = servicos.pessoas.usuarioPorCpf(cpf)
    const mensagem = 'CPF ou senha incorretos.'
    if (usuario === undefined) throw new ErroDeDominio(401, 'CREDENCIAIS_INVALIDAS', mensagem)
    if (!new ServicoSenha().conferir(senha, String(usuario.senha_hash ?? ''))) {
      throw new ErroDeDominio(401, 'CREDENCIAIS_INVALIDAS', mensagem)
    }
    responderLogin(servicos, usuario, resposta, mensagem)
  }))

  // Cadastros públicos: a conta já nasce ativa. O e-mail precisa estar na
  // lista de provedores permitidos e a equipe depende de convite de uso único.
  rotas.post('/auth/cadastro-leitor', assync(async (requisicao, resposta) => {
    responderCadastro(servicos, await servicos.pessoas.cadastrarLeitor(corpo(requisicao)), resposta)
  }))

  rotas.post('/auth/cadastro-equipe', assync(async (requisicao, resposta) => {
    responderCadastro(servicos, await servicos.pessoas.cadastrarEquipe(corpo(requisicao)), resposta)
  }))

  rotas.post('/auth/ativar', assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const email = dados['email']
    const codigo = dados['codigo']
    if (typeof email !== 'string' || typeof codigo !== 'string') {
      throw ErroDeDominio.validacao('Informe e-mail e código de ativação.')
    }
    servicos.pessoas.ativarUsuario(email, codigo, senhaDoCorpo(dados))
    resposta.json({ mensagem: 'Senha definida. Você já pode entrar.' })
  }))

  rotas.use(auth)

  rotas.get('/auth/me', (requisicao, resposta) => {
    resposta.json(usuarioAtual(requisicao))
  })

  // --------------------------- Catálogo ---------------------------

  const catalogoSimples = [
    { caminho: 'autores', listar: servicos.catalogo.listarAutores.bind(servicos.catalogo), porId: servicos.catalogo.autorPorId.bind(servicos.catalogo), criar: servicos.catalogo.criarAutor.bind(servicos.catalogo), atualizar: servicos.catalogo.atualizarAutor.bind(servicos.catalogo), inativar: servicos.catalogo.inativarAutor.bind(servicos.catalogo) },
    { caminho: 'editoras', listar: servicos.catalogo.listarEditoras.bind(servicos.catalogo), porId: servicos.catalogo.editoraPorId.bind(servicos.catalogo), criar: servicos.catalogo.criarEditora.bind(servicos.catalogo), atualizar: servicos.catalogo.atualizarEditora.bind(servicos.catalogo), inativar: servicos.catalogo.inativarEditora.bind(servicos.catalogo) },
    { caminho: 'categorias', listar: servicos.catalogo.listarCategorias.bind(servicos.catalogo), porId: servicos.catalogo.categoriaPorId.bind(servicos.catalogo), criar: servicos.catalogo.criarCategoria.bind(servicos.catalogo), atualizar: servicos.catalogo.atualizarCategoria.bind(servicos.catalogo), inativar: servicos.catalogo.inativarCategoria.bind(servicos.catalogo) }
  ] as const

  for (const entidade of catalogoSimples) {
    rotas.get(`/${entidade.caminho}`, permitir(...TODOS), assync((requisicao, resposta) => {
      const itens = entidade.listar(textoDaConsulta(requisicao, 'q'), situacaoDaConsulta(requisicao))
      resposta.json(pagina(itens, itens.length))
    }))
    rotas.get(`/${entidade.caminho}/:id`, permitir(...TODOS), assync((requisicao, resposta) => {
      resposta.json(entidade.porId(idDaRota(requisicao, 'id')))
    }))
    rotas.post(`/${entidade.caminho}`, permitir(...ADMIN), assync((requisicao, resposta) => {
      resposta.status(201).json(entidade.criar({ nome: corpo(requisicao)['nome'] }))
    }))
    rotas.patch(`/${entidade.caminho}/:id`, permitir(...ADMIN), assync((requisicao, resposta) => {
      resposta.json(entidade.atualizar(idDaRota(requisicao, 'id'), { nome: corpo(requisicao)['nome'] }))
    }))
    rotas.delete(`/${entidade.caminho}/:id`, permitir(...ADMIN), assync((requisicao, resposta) => {
      entidade.inativar(idDaRota(requisicao, 'id'))
      resposta.status(204).end()
    }))
  }

  rotas.get('/livros', permitir(...TODOS), assync((requisicao, resposta) => {
    const numero = numeroDaConsulta(requisicao, 'pagina', 1) ?? 1
    const tamanho = numeroDaConsulta(requisicao, 'porPagina', 50) ?? 50
    const resultado = servicos.catalogo.listarLivros({
      q: textoDaConsulta(requisicao, 'q'),
      situacao: situacaoDaConsulta(requisicao),
      autorId: numeroDaConsulta(requisicao, 'autorId'),
      editoraId: numeroDaConsulta(requisicao, 'editoraId'),
      categoriaId: numeroDaConsulta(requisicao, 'categoriaId'),
      disponivel: booleanoDaConsulta(requisicao, 'disponivel'),
      pagina: numero,
      porPagina: tamanho
    })
    resposta.json({ ...resultado, pagina: numero, porPagina: tamanho })
  }))
  rotas.get('/livros/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    resposta.json(servicos.catalogo.livroPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/livros', permitir(...ADMIN), assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    resposta.status(201).json(servicos.catalogo.criarLivro({
      ...dados,
      quantidadeExemplares: dados['quantidadeExemplares'] ?? 1
    }))
  }))
  rotas.patch('/livros/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.catalogo.atualizarLivro(idDaRota(requisicao, 'id'), corpo(requisicao)))
  }))
  rotas.delete('/livros/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.catalogo.inativarLivro(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.get('/exemplares', permitir(...TODOS), assync((requisicao, resposta) => {
    const itens = servicos.catalogo.listarExemplares(
      textoDaConsulta(requisicao, 'q'),
      numeroDaConsulta(requisicao, 'livroId'),
      situacaoDaConsulta(requisicao)
    )
    resposta.json(pagina(itens, itens.length))
  }))
  rotas.get('/exemplares/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    resposta.json(servicos.catalogo.exemplarPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/exemplares', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.catalogo.criarExemplar(corpo(requisicao)))
  }))
  rotas.patch('/exemplares/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.catalogo.atualizarExemplar(idDaRota(requisicao, 'id'), corpo(requisicao)))
  }))
  rotas.delete('/exemplares/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.catalogo.inativarExemplar(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  // --------------------------- Pessoas ---------------------------

  rotas.get('/leitores', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.listarLeitores(
      textoDaConsulta(requisicao, 'q'),
      situacaoDaConsulta(requisicao),
      numeroDaConsulta(requisicao, 'pagina', 1),
      numeroDaConsulta(requisicao, 'porPagina', 50)
    ))
  }))
  rotas.get('/leitores/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.leitorPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/leitores', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.pessoas.criarLeitor(corpo(requisicao)))
  }))
  rotas.patch('/leitores/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.atualizarLeitor(idDaRota(requisicao, 'id'), corpo(requisicao)))
  }))
  rotas.delete('/leitores/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.pessoas.inativarLeitor(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))
  rotas.delete('/leitores/:id/definitivo', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.pessoas.excluirDefinitivamente(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.get('/usuarios', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.listarUsuarios(
      textoDaConsulta(requisicao, 'q'),
      numeroDaConsulta(requisicao, 'pagina', 1),
      numeroDaConsulta(requisicao, 'porPagina', 50),
      situacaoDaConsulta(requisicao)
    ))
  }))
  rotas.get('/usuarios/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.usuarioPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/usuarios', permitir(...ADMIN), assync((requisicao, resposta) => {
    const resultado = servicos.pessoas.criarUsuario(corpo(requisicao))
    resposta.status(201).json({
      usuario: resultado.usuario,
      ...(resultado.codigoAtivacao === undefined ? {} : { codigoAtivacao: resultado.codigoAtivacao })
    })
  }))
  rotas.patch('/usuarios/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.atualizarUsuario(idDaRota(requisicao, 'id'), corpo(requisicao)))
  }))
  rotas.delete('/usuarios/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.pessoas.inativarUsuario(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.get('/convites', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json({ itens: servicos.pessoas.listarConvites(situacaoDaConsulta(requisicao)) })
  }))
  rotas.post('/convites', permitir(...ADMIN), assync((requisicao, resposta) => {
    const resultado = servicos.pessoas.criarConvite({
      ...corpo(requisicao),
      criadoPorUsuarioId: usuarioAtual(requisicao).id
    })
    resposta.status(201).json(resultado)
  }))
  rotas.delete('/convites/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.pessoas.revogarConvite(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.post('/admin/trocar-administrador', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.trocarAdministrador(corpo(requisicao), usuarioAtual(requisicao).id))
  }))

  rotas.get('/enderecos', permitir(...ADMIN), (req, resposta: Response) => {
    const itens = servicos.pessoas.listarEnderecos()
    resposta.json(pagina(itens, itens.length))
  })
  rotas.get('/enderecos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.enderecoPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/enderecos', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.pessoas.criarEndereco(corpo(requisicao)))
  }))
  rotas.patch('/enderecos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.atualizarEndereco(idDaRota(requisicao, 'id'), corpo(requisicao)))
  }))
  rotas.delete('/enderecos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.pessoas.removerEndereco(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  // --------------------------- Operações ---------------------------

  rotas.get('/emprestimos', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.listar({
      status: textoDaConsulta(requisicao, 'status'),
      situacao: situacaoDaConsulta(requisicao),
      q: textoDaConsulta(requisicao, 'q'),
      leitorId: numeroDaConsulta(requisicao, 'leitorId'),
      atrasados: booleanoDaConsulta(requisicao, 'atrasados'),
      vencendo: booleanoDaConsulta(requisicao, 'vencendo'),
      pagina: numeroDaConsulta(requisicao, 'pagina', 1),
      porPagina: numeroDaConsulta(requisicao, 'porPagina', 50)
    }))
  }))
  rotas.get('/emprestimos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.emprestimoPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/emprestimos', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.emprestimos.criar(corpo(requisicao), usuarioAtual(requisicao).id))
  }))
  rotas.patch('/emprestimos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.atualizarObservacao(idDaRota(requisicao, 'id'), corpo(requisicao)['observacao']))
  }))
  rotas.delete('/emprestimos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.emprestimos.cancelar(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))
  rotas.post('/emprestimos/:id/devolucao', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    resposta.json(await servicos.emprestimos.devolver(idDaRota(requisicao, 'id'), usuarioAtual(requisicao).id))
  }))
  rotas.post('/emprestimos/:id/renovacao', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.renovar(idDaRota(requisicao, 'id')))
  }))

  rotas.get('/reservas', permitir(...TODOS), assync((requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    const filtroLeitor = numeroDaConsulta(requisicao, 'leitorId')
    const leitorId = usuario.perfil === 'LEITOR' ? usuario.leitorId : filtroLeitor
    if (usuario.perfil === 'LEITOR' && leitorId === null) {
      throw ErroDeDominio.naoAutorizado('Sua conta não possui leitor vinculado.')
    }
    resposta.json(servicos.reservas.listar({
      livroId: numeroDaConsulta(requisicao, 'livroId'),
      leitorId: leitorId ?? undefined,
      situacao: situacaoDaConsulta(requisicao),
      status: textoDaConsulta(requisicao, 'status'),
      fila: booleanoDaConsulta(requisicao, 'fila'),
      pagina: numeroDaConsulta(requisicao, 'pagina', 1),
      porPagina: numeroDaConsulta(requisicao, 'porPagina', 100)
    }))
  }))
  rotas.get('/reservas/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const reserva = servicos.reservas.reservaPorId(idDaRota(requisicao, 'id'))
    garantirLeitor(requisicao, reserva.leitorId)
    resposta.json(reserva)
  }))
  rotas.post('/reservas', permitir(...TODOS), assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const usuario = usuarioAtual(requisicao)
    const leitorId = numeroDaConsultaFake(dados['leitorId'], 'leitorId')
    if (usuario.perfil === 'LEITOR') garantirLeitor(requisicao, leitorId)
    resposta.status(201).json(servicos.reservas.criar({ leitorId, livroId: dados['livroId'] }, usuario.id))
  }))
  rotas.patch('/reservas/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    const status = corpo(requisicao)['status']
    if (status !== 'cancelado') throw ErroDeDominio.validacao('Use status "cancelado" para cancelar a reserva.')
    garantirLeitor(requisicao, servicos.reservas.reservaPorId(id).leitorId)
    servicos.reservas.cancelar(id)
    resposta.json(servicos.reservas.reservaPorId(id))
  }))
  rotas.delete('/reservas/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.reservas.cancelar(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))
  rotas.post('/reservas/:id/retirada', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.reservas.registrarRetirada(idDaRota(requisicao, 'id'), usuarioAtual(requisicao).id))
  }))

  rotas.get('/agendamentos', permitir(...TODOS), assync((requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    const leitorId = usuario.perfil === 'LEITOR' ? usuario.leitorId : numeroDaConsulta(requisicao, 'leitorId')
    if (usuario.perfil === 'LEITOR' && leitorId === null) {
      throw ErroDeDominio.naoAutorizado('Sua conta não possui leitor vinculado.')
    }
    const itens = servicos.reservas.listarAgendamentos({
      leitorId: leitorId ?? undefined,
      exemplarId: numeroDaConsulta(requisicao, 'exemplarId'),
      situacao: situacaoDaConsulta(requisicao)
    })
    resposta.json(pagina(itens, itens.length))
  }))
  rotas.get('/agendamentos/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const agendamento = servicos.reservas.agendamentoPorId(idDaRota(requisicao, 'id'))
    garantirLeitor(requisicao, agendamento.leitorId)
    resposta.json(agendamento)
  }))
  rotas.post('/agendamentos', permitir(...TODOS), assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const usuario = usuarioAtual(requisicao)
    const leitorId = numeroDaConsultaFake(dados['leitorId'], 'leitorId')
    if (usuario.perfil === 'LEITOR') garantirLeitor(requisicao, leitorId)
    resposta.status(201).json(servicos.reservas.criarAgendamento({
      leitorId, exemplarId: dados['exemplarId'], dataAgendada: dados['dataAgendada']
    }, usuario.id))
  }))
  rotas.patch('/agendamentos/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    const status = corpo(requisicao)['status']
    if (status !== 'cancelado') throw ErroDeDominio.validacao('Use status "cancelado" para cancelar o agendamento.')
    garantirLeitor(requisicao, servicos.reservas.agendamentoPorId(id).leitorId)
    servicos.reservas.cancelarAgendamento(id)
    resposta.json(servicos.reservas.agendamentoPorId(id))
  }))
  rotas.post('/agendamentos/:id/retirada', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.reservas.retirarAgendamento(idDaRota(requisicao, 'id'), usuarioAtual(requisicao).id))
  }))
  rotas.delete('/agendamentos/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.reservas.cancelarAgendamento(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  // --------------------------- Multas ---------------------------

  rotas.get('/multas', permitir(...ADMIN), assync((requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    const leitorId = usuario.perfil === 'LEITOR' ? usuario.leitorId : numeroDaConsulta(requisicao, 'leitorId')
    resposta.json(servicos.emprestimos.listarMultas({
      leitorId: leitorId ?? undefined,
      situacao: situacaoDaConsulta(requisicao),
      status: textoDaConsulta(requisicao, 'status'),
      pagina: numeroDaConsulta(requisicao, 'pagina', 1),
      porPagina: numeroDaConsulta(requisicao, 'porPagina', 50)
    }))
  }))
  rotas.get('/multas/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.multaPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/multas', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.emprestimos.criarMulta(corpo(requisicao)))
  }))
  rotas.patch('/multas/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    const dados = corpo(requisicao)
    const status = dados['status']
    if (status === 'perdoada') {
      resposta.json(servicos.emprestimos.perdoarMulta(id, dados['perdaoMotivo'], usuarioAtual(requisicao).id))
    } else if (status === 'estornada') {
      servicos.emprestimos.estornarMulta(id)
      resposta.json(servicos.emprestimos.multaPorId(id))
    } else {
      throw ErroDeDominio.validacao('Use status "perdoada" ou "estornada".')
    }
  }))
  rotas.delete('/multas/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.emprestimos.estornarMulta(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.get('/pagamentos-multa', permitir(...ADMIN), (req, resposta: Response) => {
    const itens = servicos.emprestimos.listarPagamentos()
    resposta.json(pagina(itens, itens.length))
  })
  rotas.get('/pagamentos-multa/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.pagamentoPorId(idDaRota(requisicao, 'id')))
  }))
  rotas.post('/pagamentos-multa', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.status(201).json(servicos.emprestimos.pagarMulta(corpo(requisicao), usuarioAtual(requisicao).id))
  }))
  rotas.patch('/pagamentos-multa/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.emprestimos.atualizarPagamento(idDaRota(requisicao, 'id'), corpo(requisicao)['comprovante']))
  }))
  rotas.delete('/pagamentos-multa/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.emprestimos.estornarPagamento(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  // --------------------------- Configuração ---------------------------

  rotas.get('/configuracoes', permitir(...TODOS), (req, resposta: Response) => {
    resposta.json(servicos.configuracoes.obter())
  })
  rotas.patch('/configuracoes', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.configuracoes.atualizar(corpo(requisicao), usuarioAtual(requisicao).id))
  }))

  rotas.get('/auditoria-configuracoes', permitir(...ADMIN), assync((req, resposta) => {
    const itens = servicos.pessoas.listarAuditoria()
    resposta.json(pagina(itens, itens.length))
  }))
  rotas.get('/auditoria-configuracoes/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    resposta.json(servicos.pessoas.auditoriaPorId(idDaRota(requisicao, 'id')))
  }))

  // --------------------------- Notificações ---------------------------

  rotas.get('/notificacoes', permitir(...TODOS), assync((requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    const leitorId = usuario.perfil === 'LEITOR' ? usuario.leitorId : numeroDaConsulta(requisicao, 'leitorId')
    resposta.json(servicos.notificacoes.listar({
      leitorId: leitorId ?? undefined,
      situacao: situacaoDaConsulta(requisicao),
      status: textoDaConsulta(requisicao, 'status'),
      tipo: textoDaConsulta(requisicao, 'tipo'),
      pagina: numeroDaConsulta(requisicao, 'pagina', 1),
      porPagina: numeroDaConsulta(requisicao, 'porPagina', 50)
    }))
  }))
  rotas.get('/notificacoes/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const notificacao = servicos.notificacoes.notificacaoPorId(idDaRota(requisicao, 'id'))
    garantirLeitor(requisicao, notificacao.leitorId)
    resposta.json(notificacao)
  }))
  rotas.post('/notificacoes', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    resposta.status(201).json(await servicos.notificacoes.criarManual(corpo(requisicao)))
  }))
  rotas.patch('/notificacoes/:id', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    const status = corpo(requisicao)['status']
    if (status !== 'pendente') throw ErroDeDominio.validacao('Use status "pendente" para reenviar.')
    resposta.json(await servicos.notificacoes.reenviar(id))
  }))
  rotas.delete('/notificacoes/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    servicos.notificacoes.cancelar(idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  rotas.get('/consentimentos-whatsapp', permitir(...TODOS), assync((requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    const itens = servicos.pessoas.listarConsentimentos(situacaoDaConsulta(requisicao)).filter((linha) =>
      usuario.perfil !== 'LEITOR' || Number(linha.leitor_id) === usuario.leitorId)
    resposta.json(pagina(itens, itens.length))
  }))
  rotas.get('/consentimentos-whatsapp/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const linha = servicos.pessoas.consentimentoPorId(idDaRota(requisicao, 'id'))
    garantirLeitor(requisicao, Number(linha.leitor_id))
    resposta.json(linha)
  }))
  rotas.post('/consentimentos-whatsapp', permitir(...TODOS), assync((requisicao, resposta) => {
    const dados = corpo(requisicao)
    const usuario = usuarioAtual(requisicao)
    const leitorId = numeroDaConsultaFake(dados['leitorId'], 'leitorId')
    if (usuario.perfil === 'LEITOR') garantirLeitor(requisicao, leitorId)
    const id = servicos.pessoas.criarConsentimento({ ...dados, leitorId })
    resposta.status(201).json(servicos.pessoas.consentimentoPorId(id))
  }))
  rotas.patch('/consentimentos-whatsapp/:id', permitir(...TODOS), assync((requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    const linha = servicos.pessoas.consentimentoPorId(id)
    garantirLeitor(requisicao, Number(linha.leitor_id))
    const dados = corpo(requisicao)
    if (dados['consentimento'] !== false) {
      throw ErroDeDominio.validacao('Use consentimento: false para revogar.')
    }
    servicos.pessoas.revogarConsentimento(id)
    resposta.json(servicos.pessoas.consentimentoPorId(id))
  }))
  rotas.delete('/consentimentos-whatsapp/:id', permitir(...ADMIN), assync((requisicao, resposta) => {
    const id = idDaRota(requisicao, 'id')
    servicos.pessoas.revogarConsentimento(id)
    resposta.status(204).end()
  }))

  // Exclusão física: somente registros já inativos e sem vínculo histórico.
  rotas.delete('/:recurso/:id/exclusao-fisica', permitir(...ADMIN), assync((requisicao, resposta) => {
    const recurso = requisicao.params['recurso']
    if (typeof recurso !== 'string') throw ErroDeDominio.validacao('Recurso inválido.')
    servicos.exclusaoFisica.excluir(recurso, idDaRota(requisicao, 'id'))
    resposta.status(204).end()
  }))

  // --------------------------- Integrações ---------------------------

  rotas.get('/consulta/livros', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    const itens = await servicos.consultas.buscarLivros(
      textoDaConsulta(requisicao, 'q'), numeroDaConsulta(requisicao, 'limite')
    )
    resposta.json({ itens })
  }))
  rotas.post('/consulta/livros/importar', permitir(...ADMIN), assync((requisicao, resposta) => {
    const resultado = servicos.catalogo.importarLivro(corpo(requisicao))
    resposta.status(resultado.jaExistia ? 200 : 201).json(resultado)
  }))
  rotas.get('/consulta/cep', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    resposta.json(await servicos.consultas.buscarCep(textoDaConsulta(requisicao, 'cep')))
  }))
  rotas.get('/consulta/feriados', permitir(...ADMIN), assync(async (requisicao, resposta) => {
    const itens = await servicos.consultas.buscarFeriados(numeroDaConsulta(requisicao, 'ano'))
    resposta.json({ itens })
  }))

  // --------------------------- Resumo ---------------------------

  rotas.get('/dashboard', permitir(...ADMIN), (req, resposta: Response) => {
    resposta.json(servicos.dashboard.resumo())
  })
  rotas.get('/dashboard/me', permitir(...TODOS), (requisicao, resposta) => {
    const usuario = usuarioAtual(requisicao)
    if (usuario.leitorId === null) {
      throw ErroDeDominio.naoAutorizado('Sua conta não possui leitor vinculado.')
    }
    resposta.json(servicos.dashboard.resumoLeitor(usuario.leitorId))
  })

  return rotas
}

function numeroDaConsultaFake(valor: unknown, campo: string): number {
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isInteger(numero) || numero < 1) {
    throw ErroDeDominio.validacao('Informe um código válido.', { [campo]: 'Somente números.' })
  }
  return numero
}
