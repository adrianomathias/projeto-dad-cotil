// Tipos compartilhados entre servidor e aplicativo desktop.
// Nenhuma senha, CPF completo ou segredo trafega nestes tipos.

export type Perfil = 'ADMIN' | 'LEITOR'

export interface UsuarioLogado {
  id: number
  nome: string
  email: string
  perfil: Perfil
  leitorId: number | null
  /** Conta de demonstração: pode consultar, mas nunca alterar dados. */
  somenteLeitura: boolean
}

export interface LoginResposta {
  token: string
  usuario: UsuarioLogado
}

/** Domínios aceitos no cadastro público. Edite esta lista para adicionar outros. */
export const DOMINIOS_EMAIL_PERMITIDOS = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'uol.com.br',
  'bol.com.br'
])

export const MENSAGEM_EMAIL_INVALIDO = 'Use um e-mail Gmail, Outlook, Hotmail, Yahoo ou similar.'

/** Normaliza o e-mail e exige exatamente um @, local não vazio e domínio da lista. */
export function validarEmailPermitido(valor: unknown): string {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  const partes = email.split('@')
  const local = partes[0] ?? ''
  const dominio = partes[1] ?? ''

  if (
    partes.length !== 2 ||
    local.length === 0 ||
    !/^[^\s@]+$/.test(local) ||
    !DOMINIOS_EMAIL_PERMITIDOS.has(dominio)
  ) {
    throw new Error(MENSAGEM_EMAIL_INVALIDO)
  }

  return email
}

/** Cadastro público já cria a conta ativa e inicia a sessão. */
export interface CadastroResposta extends LoginResposta {
  mensagem: string
}

export interface TrocaAdministradorResposta {
  usuario: Usuario
  inativado: { id: number; nome: string; email: string }
}

export interface ErroApi {
  erro: {
    codigo: string
    mensagem: string
    detalhes?: Record<string, string>
  }
}

export interface Autor {
  id: number
  nome: string
  deletedAt: string | null
}

export interface Editora {
  id: number
  nome: string
  deletedAt: string | null
}

export interface Categoria {
  id: number
  nome: string
  deletedAt: string | null
}

export interface Livro {
  id: number
  titulo: string
  subtitulo: string | null
  isbn10: string | null
  isbn13: string | null
  editoraId: number | null
  anoPublicacao: number | null
  descricaoCurta: string | null
  capaUrl: string | null
  idioma: string
  autores: Autor[]
  categorias: Categoria[]
  totalExemplares: number
  exemplaresDisponiveis: number
  deletedAt: string | null
}

/** Filtro de listagem: por padrão todos os registros, inclusive inativos. */
export type SituacaoRegistro = 'todos' | 'ativos' | 'inativos'

export type EstadoExemplar = 'novo' | 'bom' | 'regular' | 'danificado'
export type StatusExemplar = 'disponivel' | 'emprestado' | 'reservado' | 'agendado' | 'em_manutencao' | 'inativo'

export interface Exemplar {
  id: number
  livroId: number
  tituloLivro?: string
  codigoTombamento: string
  estadoConservacao: EstadoExemplar
  status: StatusExemplar
  localizacao: string | null
  adquiridoEm: string | null
  deletedAt: string | null
}

export interface Endereco {
  id: number
  leitorId: number
  cep: string
  logradouro: string
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string
  uf: string
}

export interface Leitor {
  id: number
  nome: string
  cpfMascara: string
  email: string | null
  telefone: string | null
  ativo: boolean
  endereco: Endereco | null
  emprestimosAtivos: number
  reservasAtivas: number
  multaEmAbertoCentavos: number
  deletedAt: string | null
  excluidoEm: string | null
}

export interface Usuario {
  id: number
  leitorId: number | null
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  somenteLeitura: boolean
  ultimoLoginEm: string | null
  deletedAt: string | null
}

/** Convite de uso único para cadastro de equipe; nunca expõe o código completo. */
export interface Convite {
  id: number
  perfil: Exclude<Perfil, 'LEITOR'>
  email: string | null
  codigoMascara: string
  criadoPorUsuarioId: number
  criadoEm: string
  expiraEm: string
  usadoEm: string | null
  revogadoEm: string | null
  ativo: boolean
}

/** Resposta da criação de convite: o código claro só aparece aqui, uma vez. */
export interface ConviteCriado {
  codigo: string
  convite: Convite
}

export type StatusEmprestimo = 'aberto' | 'devolvido' | 'cancelado'

export interface Emprestimo {
  id: number
  exemplarId: number
  leitorId: number
  registradoPorUsuarioId: number
  dataEmprestimo: string
  dataDevolucaoPrevista: string
  dataDevolucaoReal: string | null
  renovacoes: number
  status: StatusEmprestimo
  observacao: string | null
  tituloLivro?: string
  nomeLeitor?: string
  codigoTombamento?: string
  diasAtraso: number
  valorMultaCentavos: number
}

export type StatusReserva = 'aguardando' | 'disponivel_para_retirada' | 'retirado' | 'expirado' | 'cancelado'

export interface Reserva {
  id: number
  livroId: number
  leitorId: number
  entradaEm: string
  status: StatusReserva
  notificadoEm: string | null
  prazoRetiradaInicio: string | null
  prazoRetiradaFim: string | null
  exemplarDestinadoId: number | null
  emprestimoId: number | null
  tituloLivro?: string
  nomeLeitor?: string
  posicao?: number
}

export type StatusAgendamento = 'ativo' | 'retirado' | 'expirado' | 'cancelado'

export interface Agendamento {
  id: number
  exemplarId: number
  leitorId: number
  dataAgendada: string
  validadeAte: string
  status: StatusAgendamento
  tituloLivro?: string
  nomeLeitor?: string
}

export type StatusMulta = 'pendente' | 'paga' | 'perdoada' | 'estornada'

export interface Multa {
  id: number
  emprestimoId: number
  leitorId: number
  diasAtraso: number
  valorCentavos: number
  status: StatusMulta
  registradaEm: string
  nomeLeitor?: string
  tituloLivro?: string
}

export interface PagamentoMulta {
  id: number
  multaId: number
  valorCentavos: number
  forma: 'dinheiro' | 'pix' | 'cartao' | 'outro'
  registradoPorUsuarioId: number
  registradoEm: string
}

export interface Configuracoes {
  prazoEmprestimoDias: number
  limiteExemplaresPorLeitor: number
  prazoRenovacaoDias: number
  limiteReservasAtivas: number
  prazoRetiradaHoras: number
  antecedenciaAvisoDias: number
  horaAvisoAtraso: string
  valorDiarioMultaCentavos: number
  tetoMultaCentavos: number
  diasMaxAgendamento: number
  timezone: string
}

export type TipoNotificacao = 'ativacao' | 'lembrete_vencimento' | 'atraso' | 'reserva_disponivel' | 'multa' | 'expiracao_reserva'
export type CanalNotificacao = 'email' | 'whatsapp'
export type StatusNotificacao = 'pendente' | 'enviada' | 'falhou' | 'reenviada'

export interface Notificacao {
  id: number
  leitorId: number
  tipo: TipoNotificacao
  canal: CanalNotificacao
  status: StatusNotificacao
  destinatarioMascara: string
  criadoEm: string
  enviadoEm: string | null
  tentativas: number
}

export interface LivroSugerido {
  titulo: string
  subtitulo?: string | null
  autores: string[]
  editora: string | null
  isbn10: string | null
  isbn13: string | null
  anoPublicacao: number | null
  descricaoCurta: string | null
  capaUrl: string | null
  categorias?: string[]
  fonte: 'google-books' | 'open-library'
}

/**
 * URL pública de capa do Google Books montada a partir do ISBN catalogado.
 * Usada quando o registro local não trouxe `capaUrl` da consulta externa.
 */
export function capaUrlPorIsbn(livro: Pick<Livro, 'isbn10' | 'isbn13'>): string | null {
  const isbn = [livro.isbn13, livro.isbn10]
    .map((valor) => (typeof valor === 'string' ? valor.trim() : ''))
    .find((valor) => valor !== '')
  if (isbn === undefined) return null
  return `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(isbn)}&printsec=frontcover&img=1&zoom=1&source=gbs_api`
}

/** Resultado da importação automática de metadados para o catálogo local. */
export interface LivroImportado {
  livro: Livro
  jaExistia: boolean
  autoresCriados: number
  categoriasCriadas: number
  editoraCriada: boolean
}

export interface EnderecoConsultado {
  cep: string
  logradouro: string
  bairro: string | null
  cidade: string
  uf: string
}

export interface Feriado {
  data: string
  nome: string
}

export interface ResumoDashboard {
  totalTitulos: number
  totalExemplares: number
  leitoresAtivos: number
  emprestimosAtivos: number
  emprestimosAtrasados: number
  emprestimosVencendo: number
  reservasAguardando: number
  reservasParaRetirada: number
  multasAbertasCentavos: number
}

export interface ListaPaginada<T> {
  itens: T[]
  total: number
  pagina: number
  porPagina: number
}
