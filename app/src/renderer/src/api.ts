import type {
  CadastroResposta, Convite, ConviteCriado, ErroApi, LivroImportado, LivroSugerido, LoginResposta,
  TrocaAdministradorResposta
} from '@biblioteca/shared'

export type ParametrosConsulta = Record<string, string | number | boolean | undefined>

class FalhaApi extends Error {
  readonly codigo: string
  readonly mensagem: string
  readonly detalhes: Record<string, string>
  readonly status: number

  constructor(codigo: string, mensagem: string, detalhes: Record<string, string> = {}, status = 0) {
    super(mensagem)
    this.name = 'FalhaApi'
    this.codigo = codigo
    this.mensagem = mensagem
    this.detalhes = detalhes
    this.status = status
  }
}

const FALLBACK_POR_STATUS: Record<number, { codigo: string; mensagem: string }> = {
  400: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Confira os dados informados e tente novamente.' },
  401: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sua sessão expirou. Entre novamente para continuar.' },
  403: { codigo: 'SEM_PERMISSAO', mensagem: 'Você não tem permissão para realizar esta operação.' },
  404: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não foi possível encontrar o registro solicitado.' },
  409: { codigo: 'CONFLITO', mensagem: 'Esta operação não pode ser concluída com os dados atuais.' },
  422: { codigo: 'DADOS_INVALIDOS', mensagem: 'Alguns campos precisam ser corrigidos antes de continuar.' },
  429: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas em sequência. Aguarde um momento e tente de novo.' },
  500: { codigo: 'ERRO_INTERNO', mensagem: 'O servidor não conseguiu concluir a operação. Tente novamente.' },
  502: { codigo: 'SERVIDOR_INDISPONIVEL', mensagem: 'O servidor está indisponível no momento. Tente novamente mais tarde.' },
  503: { codigo: 'SERVIDOR_INDISPONIVEL', mensagem: 'O servidor está indisponível no momento. Tente novamente mais tarde.' }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function detalhesTexto(valor: unknown): Record<string, string> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const resultado: Record<string, string> = {}
  for (const [chave, bruto] of Object.entries(valor)) {
    const textoCampo = texto(bruto)
    if (textoCampo !== null) resultado[chave] = textoCampo
  }
  return resultado
}

function eErroApi(corpo: unknown): corpo is ErroApi {
  if (corpo === null || typeof corpo !== 'object') return false
  const possivel = corpo as { erro?: unknown }
  if (possivel.erro === null || typeof possivel.erro !== 'object') return false
  const interno = possivel.erro as { codigo?: unknown; mensagem?: unknown }
  return typeof interno.codigo === 'string' && typeof interno.mensagem === 'string'
}

function extrairErro(corpo: unknown): ErroApi['erro'] | null {
  if (eErroApi(corpo)) return corpo.erro
  if (corpo === null || typeof corpo !== 'object') return null
  const possivel = corpo as { erro?: unknown }
  if (possivel.erro !== null && typeof possivel.erro === 'object') return possivel.erro as ErroApi['erro']
  return null
}

const ROTULOS_CAMPO: Record<string, string> = {
  nome: 'Nome',
  titulo: 'Título',
  email: 'E-mail',
  cpf: 'CPF',
  senha: 'Senha',
  cep: 'CEP',
  leitorId: 'Leitor',
  exemplarId: 'Exemplar',
  livroId: 'Livro',
  dataAgendada: 'Data do agendamento',
  valorCentavos: 'Valor',
  forma: 'Forma de pagamento',
  vinculos: 'Vínculos'
}

function rotuloCampo(campo: string): string {
  return ROTULOS_CAMPO[campo] ?? campo
}

/** Traduz falhas da API para uma mensagem única, incluindo detalhes por campo. */
export function mensagemErro(erro: unknown): string {
  if (erro instanceof FalhaApi) {
    const detalhes = Object.entries(erro.detalhes)
      .map(([campo, motivo]) => `${rotuloCampo(campo)}: ${motivo}`)
      .join('; ')
    return detalhes === '' ? erro.mensagem : `${erro.mensagem} ${detalhes}`
  }
  if (erro instanceof Error && erro.message.trim() !== '') return erro.message
  return 'Ocorreu um problema inesperado. Tente novamente.'
}

interface OpcoesRequisicao {
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  caminho: string
  params?: ParametrosConsulta
  corpo?: object
  autenticar?: boolean
}

/** Cliente HTTP da API REST usado pelo renderer. */
export class ApiCliente {
  private token: string | null = null
  private readonly baseUrl: string

  constructor(baseUrl = (window as Window & { biblioteca?: { apiUrl: string } }).biblioteca?.apiUrl
    ?? 'http://localhost:3000/api') {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  get autenticado(): boolean {
    return this.token !== null
  }

  definirToken(token: string): void {
    this.token = token
  }

  limparToken(): void {
    this.token = null
  }

  async login(email: string, senha: string): Promise<LoginResposta> {
    const resposta = await this.post<LoginResposta>('/auth/login', { email, senha }, false)
    return this.guardarSessao(resposta)
  }

  /** Login do cliente/leitor usando CPF (com ou sem pontuação) e senha. */
  async loginLeitor(cpf: string, senha: string): Promise<LoginResposta> {
    const resposta = await this.post<LoginResposta>('/auth/login-leitor', { cpf, senha }, false)
    return this.guardarSessao(resposta)
  }

  /** Cadastro público de leitor: cria a conta ativa e já inicia a sessão. */
  async cadastrarLeitor(dados: {
    nome: string
    cpf: string
    email: string
    telefone: string
    senha: string
  }): Promise<CadastroResposta> {
    const resposta = await this.post<CadastroResposta>('/auth/cadastro-leitor', dados, false)
    this.guardarSessao(resposta)
    return resposta
  }

  /** Cadastro de equipe com convite de uso único gerado por um administrador. */
  async cadastrarEquipe(dados: {
    codigo: string
    nome: string
    email: string
    senha: string
  }): Promise<CadastroResposta> {
    const resposta = await this.post<CadastroResposta>('/auth/cadastro-equipe', dados, false)
    this.guardarSessao(resposta)
    return resposta
  }

  /** Cria o administrador do cliente e inativa a conta local. */
  async trocarAdministrador(dados: object): Promise<TrocaAdministradorResposta> {
    return this.post<TrocaAdministradorResposta>('/admin/trocar-administrador', dados)
  }

  async listarConvites(): Promise<{ itens: Convite[]; total: number }> {
    return this.get('/convites')
  }

  async criarConvite(dados: { perfil: string; email?: string }): Promise<ConviteCriado> {
    return this.post('/convites', dados)
  }

  async revogarConvite(id: number): Promise<void> {
    await this.del(`/convites/${id}`)
  }

  async inativarLeitor(id: number): Promise<void> {
    await this.del(`/leitores/${id}`)
  }

  async excluirLeitorDefinitivamente(id: number): Promise<void> {
    await this.del(`/leitores/${id}/definitivo`)
  }

  /** Apaga do banco somente um registro já inativo e sem vínculo histórico. */
  async excluirRegistroFisico(recurso: string, id: number): Promise<void> {
    await this.del(`/${recurso}/${id}/exclusao-fisica`)
  }

  /** Importa metadados já consultados na API externa para o catálogo local. */
  async importarLivro(sugestao: LivroSugerido): Promise<LivroImportado> {
    return this.post('/consulta/livros/importar', sugestao)
  }

  private guardarSessao(resposta: LoginResposta): LoginResposta {
    if (texto(resposta.token) === null) {
      throw new FalhaApi('LOGIN_INVALIDO', 'O servidor não devolveu os dados de acesso. Tente novamente.')
    }
    this.token = resposta.token
    return resposta
  }

  async me<T = import('@biblioteca/shared').UsuarioLogado>(): Promise<T> {
    return this.get<T>('/auth/me')
  }

  async get<T>(caminho: string, params?: ParametrosConsulta): Promise<T> {
    return this.requisitar<T>({ metodo: 'GET', caminho, params })
  }

  async post<T>(caminho: string, corpo?: object, autenticar = true): Promise<T> {
    return this.requisitar<T>({ metodo: 'POST', caminho, corpo, autenticar })
  }

  async patch<T>(caminho: string, corpo: object): Promise<T> {
    return this.requisitar<T>({ metodo: 'PATCH', caminho, corpo })
  }

  async del(caminho: string): Promise<void> {
    await this.requisitar<void>({ metodo: 'DELETE', caminho })
  }

  private montarUrl(caminho: string, params?: ParametrosConsulta): string {
    const url = new URL(`${this.baseUrl}/${caminho.replace(/^\/+/, '')}`)
    if (params !== undefined) {
      for (const [chave, valor] of Object.entries(params)) {
        if (valor === undefined || valor === null || valor === '') continue
        url.searchParams.set(chave, String(valor))
      }
    }
    return url.toString()
  }

  private async lancarErro(resposta: Response): Promise<never> {
    const fallback = FALLBACK_POR_STATUS[resposta.status] ?? {
      codigo: 'ERRO_DESCONHECIDO',
      mensagem: 'Não foi possível concluir a operação. Tente novamente.'
    }
    let corpo: unknown = null
    try {
      corpo = JSON.parse(await resposta.text())
    } catch {
      /* resposta sem corpo JSON */
    }
    const erro = extrairErro(corpo)
    const codigo = texto(erro?.codigo) ?? fallback.codigo
    const mensagemServer = texto(erro?.mensagem)
    const mensagem = mensagemServer ?? fallback.mensagem
    const detalhes = detalhesTexto(erro?.detalhes)
    throw new FalhaApi(codigo, mensagem, detalhes, resposta.status)
  }

  private async requisitar<T>(opcoes: OpcoesRequisicao): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opcoes.corpo !== undefined) headers['Content-Type'] = 'application/json'
    if (opcoes.autenticar !== false && this.token !== null) {
      headers.Authorization = `Bearer ${this.token}`
    }
    let resposta: Response
    try {
      resposta = await fetch(this.montarUrl(opcoes.caminho, opcoes.params), {
        method: opcoes.metodo,
        headers,
        body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo)
      })
    } catch {
      throw new FalhaApi(
        'FALHA_REDE',
        'Não foi possível conectar à API. Verifique se o servidor está ligado e tente novamente.'
      )
    }
    if (!resposta.ok) await this.lancarErro(resposta)
    if (resposta.status === 204) return undefined as T
    const conteudo = await resposta.text()
    if (conteudo === '') return undefined as T
    let dados: unknown
    try {
      dados = JSON.parse(conteudo)
    } catch {
      throw new FalhaApi('RESPOSTA_INVALIDA', 'O servidor enviou uma resposta inesperada. Tente novamente.')
    }
    return dados as T
  }
}

export const api = new ApiCliente()
