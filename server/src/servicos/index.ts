import { ConexaoBanco } from '../banco/conexao.js'
import { FabricanteRepositorios } from '../banco/repositorios.js'
import { carregarConfiguracao } from '../config.js'
import { Notificador } from '../integracoes/notificador.js'
import { cifrarTexto, hashCpf, mascararCpf } from '../seguranca/cpf.js'
import { carregarChaves } from '../seguranca/chaves.js'
import { ServicoSenha } from '../seguranca/senha.js'
import { ServicoToken } from '../seguranca/token.js'
import { CarteiraServicos } from './carteira.js'

export interface ContextoServicos {
  servicos: CarteiraServicos
  conexao: ConexaoBanco
  executarAgendador: boolean
}

/** Monta banco, chaves, integrações e serviços uma única vez na inicialização. */
export function criarContexto(): ContextoServicos {
  const config = carregarConfiguracao()
  const conexao = new ConexaoBanco(config.caminhoBanco)
  const chaves = carregarChaves(process.env, config.caminhoChaves)
  const gerarHash = (senha: string): string => new ServicoSenha().gerarHash(senha)

  conexao.aplicarSeed({
    adminEmail: config.adminEmail,
    adminSenha: config.adminSenha,
    senhaInicialLeitor: config.senhaInicialLeitor,
    gerarHash,
    cifrar: (texto) => cifrarTexto(texto, chaves.cpfCriptografia),
    hashCpf: (cpf) => hashCpf(cpf, chaves.cpfHmac),
    mascarar: mascararCpf,
    incluirExemplos: config.ambiente !== 'production'
  })

  const repos = new FabricanteRepositorios(conexao.db)
 const notificador = new Notificador({
    apiKey: config.emailApiKey,
    remetente: config.emailRemetente,
    host: config.smtpHost,
    port: config.smtpPorta,
    user: config.smtpUsuario,
    password: config.smtpSenha,
    modoSimulado: config.modoSimuladoEmail
  })
  const servicos = new CarteiraServicos(conexao.db, repos, {
    chavesCpf: { cpfCriptografia: chaves.cpfCriptografia, cpfHmac: chaves.cpfHmac },
    gerarHashSenha: gerarHash,
    token: new ServicoToken(chaves.jwt),
    notificador,
    googleBooksApiKey: config.googleBooksApiKey,
    validarCpfExterno: config.validarCpfExterno
  })

  return { servicos, conexao, executarAgendador: config.executarAgendador }
}
