import type { Banco } from '../banco/conexao.js'
import type { FabricanteRepositorios } from '../banco/repositorios.js'
import type { ChavesPessoas } from './pessoas.js'
import type { Notificador } from '../integracoes/notificador.js'
import type { ServicoToken } from '../seguranca/token.js'
import { ServicoCatalogo } from './catalogo.js'
import { ServicoConfiguracoes } from './configuracoes.js'
import { ServicoConsultas, type ConsultaLivros } from './consultas.js'
import { ServicoDashboard } from './dashboard.js'
import { ServicoEmprestimos, type AposDevolucao } from './emprestimos.js'
import { ServicoExclusaoFisica } from './exclusao-fisica.js'
import { ServicoNotificacoes } from './notificacoes.js'
import { ServicoPessoas } from './pessoas.js'
import { ServicoReservas, type ConsultaFeriados } from './reservas.js'
import {
  ServicoBrasilApi, ServicoConsultaCpf, ServicoGoogleBooks, ServicoOpenLibrary, ServicoViaCep,
  type ConsultaCpfExterno
} from '../integracoes/index.js'

interface OpcoesCarteira {
  chavesCpf: ChavesPessoas
  gerarHashSenha: (senha: string) => string
  token: ServicoToken
  notificador: Notificador
  googleBooksApiKey?: string
  openLibrary?: ConsultaLivros
  brasilApi?: ConsultaFeriados
  consultaCpf?: ConsultaCpfExterno
  validarCpfExterno?: boolean
}

/** Agrega os objetos de regras de negócio; mantém as classes desacopladas entre si. */
export class CarteiraServicos {
  readonly configuracoes: ServicoConfiguracoes
  readonly catalogo: ServicoCatalogo
  readonly pessoas: ServicoPessoas
  readonly notificacoes: ServicoNotificacoes
  readonly dashboard: ServicoDashboard
  readonly consultas: ServicoConsultas
  readonly emprestimos: ServicoEmprestimos
  readonly reservas: ServicoReservas
  readonly exclusaoFisica: ServicoExclusaoFisica
  readonly token: ServicoToken

  constructor(
    db: Banco,
    repos: FabricanteRepositorios,
    opcoes: OpcoesCarteira
  ) {
    this.configuracoes = new ServicoConfiguracoes(db)
    this.catalogo = new ServicoCatalogo(db, repos)
    this.token = opcoes.token
    this.pessoas = new ServicoPessoas(db, repos, {
      chaves: opcoes.chavesCpf,
      gerarHashSenha: opcoes.gerarHashSenha,
      consultaCpf: opcoes.consultaCpf ?? new ServicoConsultaCpf(),
      validarCpfExterno: opcoes.validarCpfExterno ?? true
    })
    this.notificacoes = new ServicoNotificacoes(db, repos, opcoes.notificador, opcoes.chavesCpf.cpfCriptografia)
    this.dashboard = new ServicoDashboard(db)
    this.exclusaoFisica = new ServicoExclusaoFisica(db)
    const brasilApi = opcoes.brasilApi ?? new ServicoBrasilApi()
    this.consultas = new ServicoConsultas(
      new ServicoGoogleBooks(undefined, opcoes.googleBooksApiKey ?? ''),
      new ServicoViaCep(),
      brasilApi,
      opcoes.openLibrary ?? new ServicoOpenLibrary()
    )

    const aposDevolucao: AposDevolucao = async (resultado) => {
      await this.reservas.promoverAposDevolucao(resultado)
      if (resultado.multaId !== null) {
        const leitor = db.prepare('SELECT email, nome FROM leitores WHERE id = ?')
          .get(resultado.leitorId) as { email: string | null; nome: string } | undefined
        if (leitor?.email !== null && leitor?.email !== undefined && leitor.email !== '') {
          await this.notificacoes.registrar({
            leitorId: resultado.leitorId,
            tipo: 'multa',
            destinatario: leitor.email,
            assunto: 'Multa registrada pela biblioteca',
            mensagem: `Olá, ${leitor.nome}. Foi registrada uma multa de R$ ${(resultado.valorMultaCentavos / 100).toFixed(2)} pela devolução com atraso.`,
            chaveIdempotencia: `multa-${resultado.multaId}`,
            emprestimoId: resultado.emprestimoId,
            multaId: resultado.multaId
          })
        }
      }
    }

    this.emprestimos = new ServicoEmprestimos(db, repos, this.configuracoes, aposDevolucao)
    this.reservas = new ServicoReservas(db, repos, this.configuracoes, this.notificacoes, brasilApi)
  }
}
