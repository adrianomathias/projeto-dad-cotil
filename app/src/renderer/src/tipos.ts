import type { ListaPaginada, Perfil } from '@biblioteca/shared'

export type Secao =
  | 'inicio'
  | 'acervo'
  | 'autores'
  | 'editoras'
  | 'categorias'
  | 'leitores'
  | 'usuarios'
  | 'emprestimos'
  | 'reservas'
  | 'agendamentos'
  | 'multas'
  | 'configuracoes'
  | 'notificacoes'

export type NomeIcone =
  | 'home'
  | 'book'
  | 'users'
  | 'user'
  | 'building'
  | 'tag'
  | 'loan'
  | 'queue'
  | 'calendar'
  | 'money'
  | 'settings'
  | 'bell'
  | 'search'
  | 'plus'
  | 'close'
  | 'check'
  | 'arrow'
  | 'clock'
  | 'edit'
  | 'trash'
  | 'logout'
  | 'warning'
  | 'info'
  | 'refresh'
  | 'package'
  | 'send'
  | 'eye'
  | 'eyeOff'

export type TomMensagem = 'sucesso' | 'erro' | 'info'
export type TomEtiqueta = 'neutro' | 'sucesso' | 'atencao' | 'perigo' | 'info'

export interface Mensagem {
  texto: string
  tom: TomMensagem
}

export interface PedidoConfirmacao {
  titulo: string
  mensagem: string
  detalhes?: string[]
  confirmarTexto?: string
  cancelarTexto?: string
  perigo?: boolean
  /** URL HTTPS da capa, exibida para conferência antes de confirmar. */
  imagemUrl?: string | null
  /** Título do livro para o texto alternativo da capa (quando diferente do título do diálogo). */
  imagemTitulo?: string
}

export interface ItemNavegacao {
  id: Secao
  rotulo: string
  icone: NomeIcone
  grupo: 'Principal' | 'Acervo' | 'Pessoas' | 'Operação' | 'Sistema'
}

export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  { id: 'inicio', rotulo: 'Visão geral', icone: 'home', grupo: 'Principal' },
  { id: 'acervo', rotulo: 'Acervo', icone: 'book', grupo: 'Acervo' },
  { id: 'autores', rotulo: 'Autores', icone: 'user', grupo: 'Acervo' },
  { id: 'editoras', rotulo: 'Editoras', icone: 'building', grupo: 'Acervo' },
  { id: 'categorias', rotulo: 'Categorias', icone: 'tag', grupo: 'Acervo' },
  { id: 'leitores', rotulo: 'Leitores', icone: 'users', grupo: 'Pessoas' },
  { id: 'usuarios', rotulo: 'Usuários', icone: 'user', grupo: 'Pessoas' },
  { id: 'emprestimos', rotulo: 'Empréstimos', icone: 'loan', grupo: 'Operação' },
  { id: 'reservas', rotulo: 'Reservas', icone: 'queue', grupo: 'Operação' },
  { id: 'agendamentos', rotulo: 'Agendamentos', icone: 'calendar', grupo: 'Operação' },
  { id: 'multas', rotulo: 'Multas', icone: 'money', grupo: 'Operação' },
  { id: 'configuracoes', rotulo: 'Configurações', icone: 'settings', grupo: 'Sistema' },
  { id: 'notificacoes', rotulo: 'Notificações', icone: 'bell', grupo: 'Sistema' }
]

export const SECOES_POR_PERFIL: Record<Perfil, readonly Secao[]> = {
  ADMIN: ITENS_NAVEGACAO.map((item) => item.id),
  LEITOR: ['inicio', 'reservas', 'agendamentos']
}

export const TITULOS_SECOES: Record<Secao, { titulo: string; descricao: string }> = {
  inicio: { titulo: 'Visão geral', descricao: 'Um resumo do que está acontecendo na biblioteca.' },
  acervo: { titulo: 'Acervo', descricao: 'Consulte, cadastre e organize os livros da biblioteca.' },
  autores: { titulo: 'Autores', descricao: 'Cadastre e mantenha os autores das obras.' },
  editoras: { titulo: 'Editoras', descricao: 'Cadastre e mantenha as editoras do acervo.' },
  categorias: { titulo: 'Categorias', descricao: 'Organize os livros por categoria.' },
  leitores: { titulo: 'Leitores', descricao: 'Consulte e cadastre as pessoas da comunidade.' },
  usuarios: { titulo: 'Usuários', descricao: 'Gerencie quem pode acessar o sistema e seus perfis.' },
  emprestimos: { titulo: 'Empréstimos', descricao: 'Acompanhe retiradas, prazos, renovações e devoluções.' },
  reservas: { titulo: 'Reservas', descricao: 'Acompanhe a fila de espera e o prazo de retirada.' },
  agendamentos: { titulo: 'Agendamentos', descricao: 'Agende a retirada de um exemplar disponível.' },
  multas: { titulo: 'Multas', descricao: 'Consulte cobranças e registre pagamentos.' },
  configuracoes: { titulo: 'Configurações', descricao: 'Ajuste as regras de empréstimo, reserva e multas.' },
  notificacoes: { titulo: 'Notificações', descricao: 'Histórico de avisos enviados aos leitores.' }
}

export type RespostaLista<T> = ListaPaginada<T> | T[]

export function itensDaLista<T>(resposta: RespostaLista<T> | null): T[] {
  if (resposta === null) return []
  if (Array.isArray(resposta)) return resposta
  return Array.isArray(resposta.itens) ? resposta.itens : []
}

export function totalDaLista<T>(resposta: RespostaLista<T> | null): number | undefined {
  if (resposta === null) return undefined
  if (Array.isArray(resposta)) return resposta.length
  return typeof resposta.total === 'number' ? resposta.total : undefined
}

export function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

export function textoEm(valor: unknown, chave: string): string | undefined {
  const objeto = comoObjeto(valor)
  const encontrado = objeto?.[chave]
  return typeof encontrado === 'string' ? encontrado : undefined
}

export function numeroEm(valor: unknown, chave: string): number | undefined {
  const objeto = comoObjeto(valor)
  const encontrado = objeto?.[chave]
  return typeof encontrado === 'number' ? encontrado : undefined
}

export function opcional(valor: string): string | undefined {
  const limpo = valor.trim()
  return limpo === '' ? undefined : limpo
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * Formata o telefone enquanto o usuário digita. Quem informa DDD (10/11 dígitos)
 * recebe o +55 automaticamente; quem começa com "+" mantém o próprio DDI.
 */
export function formatarTelefone(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 15)
  if (digitos === '') return ''
  const comMais = valor.trimStart().startsWith('+')

  if (comMais && !digitos.startsWith('55')) return `+${digitos}`
  const brasileiro = digitos.startsWith('55') && digitos.length >= 12
    ? digitos
    : (!comMais && (digitos.length <= 11 || digitos.startsWith('55')))
      ? `55${digitos}`
      : digitos

  if (!brasileiro.startsWith('55')) return `+${brasileiro}`

  const numero = brasileiro.slice(2)
  if (numero.length === 0) return '+55'
  if (numero.length <= 2) return `+55 (${numero}`
  const ddd = numero.slice(0, 2)
  const restante = numero.slice(2)
  if (restante.length === 0) return `+55 (${ddd})`
  if (restante.length <= 4) return `+55 (${ddd}) ${restante}`
  if (restante.length <= 8) return `+55 (${ddd}) ${restante.slice(0, 4)}-${restante.slice(4)}`
  return `+55 (${ddd}) ${restante.slice(0, 5)}-${restante.slice(5, 9)}`
}

/** Remove acentos e caixa para comparações de busca. */
export function normalizarTexto(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

/** Envia sempre +DDI+DDD+número, sem máscara, para qualquer cliente da API. */
export function normalizarTelefone(valor: string): string | undefined {
  const digitos = somenteDigitos(valor)
  return digitos === '' ? undefined : `+${digitos}`
}

export function telefoneValido(valor: string): boolean {
  const digitos = somenteDigitos(valor)
  return digitos.length >= 10 && digitos.length <= 15
}

export function formatarData(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor.trim() === '') return '—'
  const data = new Date(`${valor.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(data.getTime())) return valor
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(data)
}

export function formatarDataHora(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor.trim() === '') return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data)
}

export function formatarDinheiro(centavos: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format((centavos ?? 0) / 100)
}

export function hojeISO(): string {
  const agora = new Date()
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T12:00:00`)
  data.setDate(data.getDate() + dias)
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function mascararCep(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 8)
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos
}

export function mascararCpf(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11)
  return digitos
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export const ROTULOS_STATUS: Record<string, string> = {
  aberto: 'Em andamento',
  devolvido: 'Devolvido',
  cancelado: 'Cancelado',
  aguardando: 'Na fila',
  disponivel_para_retirada: 'Pronto para retirada',
  retirado: 'Retirado',
  expirado: 'Expirado',
  ativo: 'Ativo',
  pendente: 'Pendente',
  paga: 'Paga',
  perdoada: 'Perdoada',
  estornada: 'Estornada',
  enviada: 'Enviada',
  falhou: 'Falhou',
  reenviada: 'Reenviada',
  disponivel: 'Disponível',
  emprestado: 'Emprestado',
  reservado: 'Reservado',
  agendado: 'Agendado',
  em_manutencao: 'Em manutenção',
  inativo: 'Inativo'
}

export function rotuloStatus(status: string): string {
  return ROTULOS_STATUS[status] ?? status
}
