import { useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { capaUrlPorIsbn, type Categoria, type Editora, type Livro } from '@biblioteca/shared'
import { normalizarTexto, type Mensagem, type NomeIcone, type PedidoConfirmacao, type TomEtiqueta } from './tipos'

const CAMINHOS_ICONE: Record<NomeIcone, ReactNode> = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z" /><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  loan: <><path d="M7 7h13l-3-3M17 17H4l3 3" /><path d="M20 7v5M4 17v-5" /></>,
  queue: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  money: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9H6m12 6h-1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.53 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88L4.3 6.96l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.53a1.7 1.7 0 0 0 1.03-1.56H14v.1A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.47 9v.1a1.7 1.7 0 0 0 1.56 1.03H21v4h-.1A1.7 1.7 0 0 0 19.4 15z" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  warning: <><path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 6.7" /><path d="M20 4v7h-7" /></>,
  package: <><path d="m12 2 9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c4.7 0 7.9 4.3 9.3 6a14.6 14.6 0 0 1-2.2 2.7M6.6 7.7A14.6 14.6 0 0 0 2.7 12c1.4 1.7 4.6 6 9.3 6a9.8 9.8 0 0 0 3-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
}

export function Icone({ nome, className }: { nome: NomeIcone; className?: string }): ReactNode {
  const caminho: ReactNode | undefined = CAMINHOS_ICONE[nome]
  if (caminho === undefined) return null
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className === undefined ? 'icone' : `icone ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {caminho}
    </svg>
  )
}

type VarianteBotao = 'primario' | 'secundario' | 'claro' | 'perigo'

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao
  icone?: NomeIcone
  pequeno?: boolean
  carregando?: boolean
  children: ReactNode
}

export function Botao({
  variante = 'secundario',
  icone,
  pequeno = false,
  carregando = false,
  disabled,
  className,
  children,
  type = 'button',
  ...resto
}: BotaoProps): ReactNode {
  const classes = ['botao', `botao-${variante}`, pequeno ? 'botao-pequeno' : '', className ?? '']
    .filter((parte) => parte !== '')
    .join(' ')
  return (
    <button
      {...resto}
      type={type}
      className={classes}
      disabled={disabled === true || carregando}
      aria-busy={carregando || undefined}
    >
      {carregando ? <Icone nome="refresh" className="girando" /> : icone === undefined ? null : <Icone nome={icone} />}
      <span>{children}</span>
    </button>
  )
}

export function Etiqueta({ tom = 'neutro', children }: { tom?: TomEtiqueta; children: ReactNode }): ReactNode {
  return <span className={`etiqueta etiqueta-${tom}`}>{children}</span>
}

export function Aviso({
  tom = 'info',
  titulo,
  children
}: {
  tom?: 'info' | 'sucesso' | 'atencao' | 'erro'
  titulo?: string
  children: ReactNode
}): ReactNode {
  const icone: NomeIcone = tom === 'erro' || tom === 'atencao' ? 'warning' : tom === 'sucesso' ? 'check' : 'info'
  return (
    <div className={`aviso aviso-${tom}`} role={tom === 'erro' ? 'alert' : undefined}>
      <Icone nome={icone} />
      <div>
        {titulo === undefined ? null : <strong>{titulo}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Capa de livro com substituto acessível quando a URL não existe ou a imagem falha. */
export function CapaLivro({
  url,
  titulo,
  className
}: {
  url?: string | null
  titulo: string
  className?: string
}): ReactNode {
  const [falhou, setFalhou] = useState(false)
  useEffect(() => setFalhou(false), [url])

  const classes = ['capa-livro', className ?? ''].filter((parte) => parte !== '').join(' ')
  const semImagem = url === null || url === undefined || url.trim() === '' || falhou

  if (semImagem) {
    return (
      <span className={`${classes} capa-livro-vazia`} role="img" aria-label={`Sem capa disponível para ${titulo}`}>
        <Icone nome="book" />
      </span>
    )
  }

  return (
    <img
      className={classes}
      src={url}
      alt={`Capa de ${titulo}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
    />
  )
}

export function Painel({
  titulo,
  descricao,
  acoes,
  children,
  className
}: {
  titulo: string
  descricao?: string
  acoes?: ReactNode
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <section className={className === undefined ? 'painel' : `painel ${className}`}>
      <div className="painel-cabecalho">
        <div>
          <h2>{titulo}</h2>
          {descricao === undefined ? null : <p>{descricao}</p>}
        </div>
        {acoes === undefined ? null : <div className="painel-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

export function BarraBusca({
  valor,
  aoAlterar,
  rotulo,
  placeholder,
  desabilitado
}: {
  valor: string
  aoAlterar: (valor: string) => void
  rotulo: string
  placeholder?: string
  desabilitado?: boolean
}): ReactNode {
  const id = useId()
  return (
    <div className="campo-busca">
      <Icone nome="search" />
      <label className="somente-leitor" htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="search"
        value={valor}
        onChange={(evento) => aoAlterar(evento.currentTarget.value)}
        placeholder={placeholder ?? rotulo}
        disabled={desabilitado}
      />
    </div>
  )
}

interface CampoBase {
  rotulo: string
  valor: string
  aoAlterar: (valor: string) => void
  nome?: string
  obrigatorio?: boolean
  desabilitado?: boolean
  ajuda?: string
  compacto?: boolean
  id?: string
}

export interface CampoTextoProps extends CampoBase {
  tipo?: 'text' | 'email' | 'password' | 'date' | 'time' | 'number' | 'url' | 'tel'
  /** Exibe o botão de mostrar/ocultar senha quando o tipo é password. */
  comOlho?: boolean
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search' | 'none'
  min?: string | number
  max?: string | number
  step?: string | number
  minLength?: number
  maxLength?: number
  autoFocus?: boolean
  aoPerderFoco?: () => void
}

export function CampoTexto({
  rotulo,
  valor,
  aoAlterar,
  nome,
  obrigatorio = false,
  desabilitado = false,
  ajuda,
  compacto = false,
  id,
  tipo = 'text',
  placeholder,
  autoComplete,
  inputMode,
  min,
  max,
  step,
  minLength,
  maxLength,
  autoFocus,
  aoPerderFoco,
  comOlho = false
}: CampoTextoProps): ReactNode {
  const gerado = useId()
  const campoId = id ?? gerado
  const ajudaId = ajuda === undefined ? undefined : `${campoId}-ajuda`
  const [mostrandoSenha, setMostrandoSenha] = useState(false)
  const tipoEfetivo = tipo === 'password' && mostrandoSenha ? 'text' : tipo
  return (
    <div className={`${compacto ? 'campo campo-compacto' : 'campo'}${comOlho && tipo === 'password' ? ' campo-senha' : ''}`}>
      <label htmlFor={campoId}>
        {rotulo}
        {obrigatorio ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className={comOlho && tipo === 'password' ? 'campo-input-com-olho' : undefined}>
        <input
          id={campoId}
          name={nome}
          type={tipoEfetivo}
          value={valor}
          onChange={(evento) => aoAlterar(evento.currentTarget.value)}
          onBlur={aoPerderFoco}
          required={obrigatorio}
          disabled={desabilitado}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          minLength={minLength}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-describedby={ajudaId}
        />
        {comOlho && tipo === 'password' ? (
          <button
            type="button"
            className="botao-olho"
            onClick={() => setMostrandoSenha((valor) => !valor)}
            aria-label={mostrandoSenha ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={mostrandoSenha}
            title={mostrandoSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <Icone nome={mostrandoSenha ? 'eyeOff' : 'eye'} />
          </button>
        ) : null}
      </div>
      {ajuda === undefined ? null : <small id={ajudaId}>{ajuda}</small>}
    </div>
  )
}

export interface OpcaoCampo {
  valor: string
  rotulo: string
  desabilitado?: boolean
}

export function CampoSelect({
  rotulo,
  valor,
  aoAlterar,
  opcoes,
  vazio,
  nome,
  obrigatorio = false,
  desabilitado = false,
  ajuda,
  compacto = false,
  id
}: CampoBase & {
  opcoes: readonly OpcaoCampo[]
  vazio?: string
}): ReactNode {
  const gerado = useId()
  const campoId = id ?? gerado
  const ajudaId = ajuda === undefined ? undefined : `${campoId}-ajuda`
  return (
    <div className={compacto ? 'campo campo-compacto' : 'campo'}>
      <label htmlFor={campoId}>
        {rotulo}
        {obrigatorio ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={campoId}
        name={nome}
        value={valor}
        onChange={(evento) => aoAlterar(evento.currentTarget.value)}
        required={obrigatorio}
        disabled={desabilitado}
        aria-describedby={ajudaId}
      >
        {vazio === undefined ? null : <option value="">{vazio}</option>}
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor} disabled={opcao.desabilitado}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
      {ajuda === undefined ? null : <small id={ajudaId}>{ajuda}</small>}
    </div>
  )
}

export function CampoArea({
  rotulo,
  valor,
  aoAlterar,
  nome,
  obrigatorio = false,
  desabilitado = false,
  ajuda,
  linhas = 3,
  placeholder,
  id
}: CampoBase & { linhas?: number; placeholder?: string }): ReactNode {
  const gerado = useId()
  const campoId = id ?? gerado
  return (
    <div className="campo campo-largo">
      <label htmlFor={campoId}>
        {rotulo}
        {obrigatorio ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={campoId}
        name={nome}
        value={valor}
        onChange={(evento) => aoAlterar(evento.currentTarget.value)}
        rows={linhas}
        required={obrigatorio}
        disabled={desabilitado}
        placeholder={placeholder}
      />
      {ajuda === undefined ? null : <small>{ajuda}</small>}
    </div>
  )
}

export function CampoCheck({
  rotulo,
  marcado,
  aoAlterar,
  desabilitado = false,
  ajuda
}: {
  rotulo: string
  marcado: boolean
  aoAlterar: (marcado: boolean) => void
  desabilitado?: boolean
  ajuda?: string
}): ReactNode {
  return (
    <label className="campo-check">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => aoAlterar(evento.currentTarget.checked)}
        disabled={desabilitado}
      />
      <span>{rotulo}</span>
      {ajuda === undefined ? null : <small>{ajuda}</small>}
    </label>
  )
}

export interface Coluna<T> {
  titulo: string
  conteudo: (item: T, indice: number) => ReactNode
  classe?: string
}

export function Tabela<T>({
  colunas,
  itens,
  chave,
  legenda,
  classes
}: {
  colunas: readonly Coluna<T>[]
  itens: readonly T[]
  chave: (item: T, indice: number) => string | number
  legenda: string
  classes?: string
}): ReactNode {
  return (
    <div className="tabela-rolagem">
      <table className={classes}>
        <caption className="somente-leitor">{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna.titulo} scope="col" className={coluna.classe}>
                {coluna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, indice) => (
            <tr key={chave(item, indice)}>
              {colunas.map((coluna) => (
                <td key={coluna.titulo} className={coluna.classe} data-label={coluna.titulo}>
                  {coluna.conteudo(item, indice)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Carregando({ rotulo = 'Carregando informações...' }: { rotulo?: string }): ReactNode {
  return (
    <div className="estado-bloco" role="status">
      <Icone nome="refresh" className="girando" />
      <p>{rotulo}</p>
    </div>
  )
}

export function ErroCarregamento({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }): ReactNode {
  return (
    <Aviso tom="erro" titulo="Não foi possível carregar">
      <p>{mensagem}</p>
      {aoTentar === undefined ? null : (
        <Botao pequeno icone="refresh" onClick={aoTentar} className="botao-tentar">
          Tentar novamente
        </Botao>
      )}
    </Aviso>
  )
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao: string }): ReactNode {
  return (
    <div className="estado-vazio">
      <span className="estado-vazio-icone"><Icone nome="search" /></span>
      <strong>{titulo}</strong>
      <p>{descricao}</p>
    </div>
  )
}

export function ConteudoLista({
  carregando,
  erro,
  aoTentar,
  vazio,
  children
}: {
  carregando: boolean
  erro: string | null
  aoTentar: () => void
  vazio: boolean
  children: ReactNode
}): ReactNode {
  if (carregando) return <Carregando />
  if (erro !== null) return <ErroCarregamento mensagem={erro} aoTentar={aoTentar} />
  if (vazio) return <Vazio titulo="Nenhum resultado encontrado" descricao="Ajuste a busca ou os filtros e tente novamente." />
  return <>{children}</>
}

export function DialogoConfirmacao({
  pedido,
  aoResponder
}: {
  pedido: PedidoConfirmacao
  aoResponder: (resposta: boolean) => void
}): ReactNode {
  const referencia = useRef<HTMLDialogElement>(null)
  const tituloId = useId()

  useEffect(() => {
    const dialogo = referencia.current
    if (dialogo !== null && !dialogo.open) dialogo.showModal()
    return () => {
      if (dialogo !== null && dialogo.open) dialogo.close()
    }
  }, [])

  return (
    <dialog
      ref={referencia}
      className="dialogo-confirmacao"
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault()
        aoResponder(false)
      }}
    >
      <div className="dialogo-conteudo">
        <div className={`dialogo-corpo ${pedido.imagemUrl === undefined || pedido.imagemUrl === null ? '' : 'com-capa'}`}>
          {pedido.imagemUrl === undefined || pedido.imagemUrl === null ? null : (
            <CapaLivro url={pedido.imagemUrl} titulo={pedido.imagemTitulo ?? pedido.titulo} className="capa-dialogo" />
          )}
          <div className="dialogo-texto">
            <span className={`dialogo-icone ${pedido.perigo === true ? 'perigo' : ''}`}>
              <Icone nome={pedido.perigo === true ? 'warning' : 'info'} />
            </span>
            <h2 id={tituloId}>{pedido.titulo}</h2>
            <p>{pedido.mensagem}</p>
            {pedido.detalhes === undefined || pedido.detalhes.length === 0 ? null : (
              <ul className="dialogo-detalhes">
                {pedido.detalhes.map((detalhe) => <li key={detalhe}>{detalhe}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="acoes-formulario">
          <Botao variante="secundario" onClick={() => aoResponder(false)} autoFocus>
            {pedido.cancelarTexto ?? 'Voltar'}
          </Botao>
          <Botao variante={pedido.perigo === true ? 'perigo' : 'primario'} onClick={() => aoResponder(true)}>
            {pedido.confirmarTexto ?? 'Confirmar'}
          </Botao>
        </div>
      </div>
    </dialog>
  )
}

/** Conteúdo catalogado de um livro, reaproveitado pelo modal de reserva e pelo catálogo de agendamentos. */
export function DetalhesLivro({
  livro,
  editoraNome
}: {
  livro: Livro
  editoraNome?: string | null
}): ReactNode {
  const autores = livro.autores.map((autor) => autor.nome).join(', ') || '—'
  const categorias = livro.categorias.map((categoria) => categoria.nome).join(', ') || '—'
  const editora = editoraNome ?? '—'
  const isbn = [livro.isbn13, livro.isbn10].filter((valor) => valor !== null && valor !== '').join(' / ') || '—'

  return (
    <>
      <div className="dialogo-corpo com-capa">
        <CapaLivro
          url={livro.capaUrl ?? capaUrlPorIsbn(livro)}
          titulo={livro.titulo}
          className="capa-dialogo capa-detalhes"
        />
        <div className="dialogo-texto">
          <span className="dialogo-icone"><Icone nome="book" /></span>
          <h2>{livro.titulo}</h2>
          {livro.subtitulo === null ? null : <p className="livro-subtitulo">{livro.subtitulo}</p>}
          <p>{autores}</p>
        </div>
      </div>

      {livro.descricaoCurta === null || livro.descricaoCurta.trim() === '' ? null : (
        <p className="livro-descricao">{livro.descricaoCurta}</p>
      )}

      <dl className="livro-metadados">
        <div><dt>Categorias</dt><dd>{categorias}</dd></div>
        <div><dt>Editora</dt><dd>{editora}</dd></div>
        <div><dt>Ano de publicação</dt><dd>{livro.anoPublicacao ?? '—'}</dd></div>
        <div><dt>ISBN</dt><dd>{isbn}</dd></div>
        <div><dt>Idioma</dt><dd>{livro.idioma || '—'}</dd></div>
        <div>
          <dt>Exemplares</dt>
          <dd>{livro.exemplaresDisponiveis} disponível(is) de {livro.totalExemplares}</dd>
        </div>
      </dl>
    </>
  )
}

/** Janela modal com os dados catalogados de um livro, usada ao escolher uma reserva. */
export function DialogoLivro({
  livro,
  editoraNome,
  aoFechar
}: {
  livro: Livro
  editoraNome?: string | null
  aoFechar: () => void
}): ReactNode {
  const referencia = useRef<HTMLDialogElement>(null)
  const tituloId = useId()

  useEffect(() => {
    const dialogo = referencia.current
    if (dialogo !== null && !dialogo.open) dialogo.showModal()
    return () => {
      if (dialogo !== null && dialogo.open) dialogo.close()
    }
  }, [])

  return (
    <dialog
      ref={referencia}
      className="dialogo-confirmacao dialogo-livro"
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault()
        aoFechar()
      }}
    >
      <div className="dialogo-conteudo">
        <div id={tituloId} className="dialogo-titulo-oculto">{livro.titulo}</div>
        <DetalhesLivro livro={livro} editoraNome={editoraNome} />
        <div className="acoes-formulario">
          <Botao variante="secundario" onClick={aoFechar} autoFocus>Fechar</Botao>
        </div>
      </div>
    </dialog>
  )
}

/** Catálogo pesquisável de livros com filtros e detalhes, usado ao criar um agendamento. */
export function DialogoCatalogoLivros({
  livros,
  editoras,
  categorias,
  aoSelecionar,
  aoFechar
}: {
  livros: readonly Livro[]
  editoras: readonly Editora[]
  categorias: readonly Categoria[]
  aoSelecionar: (livro: Livro) => void
  aoFechar: () => void
}): ReactNode {
  const referencia = useRef<HTMLDialogElement>(null)
  const tituloId = useId()
  const [busca, setBusca] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [editoraId, setEditoraId] = useState('')
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState<number | null>(
    livros.find((livro) => livro.exemplaresDisponiveis > 0)?.id ?? livros[0]?.id ?? null
  )

  useEffect(() => {
    const dialogo = referencia.current
    if (dialogo !== null && !dialogo.open) dialogo.showModal()
    return () => {
      if (dialogo !== null && dialogo.open) dialogo.close()
    }
  }, [])

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca)
    return livros.filter((livro) => {
      if (somenteDisponiveis && livro.exemplaresDisponiveis <= 0) return false
      if (categoriaId !== '' && !livro.categorias.some((item) => String(item.id) === categoriaId)) return false
      if (editoraId !== '' && String(livro.editoraId ?? '') !== editoraId) return false
      if (termo === '') return true
      const nomeEditora = editoras.find((item) => item.id === livro.editoraId)?.nome ?? ''
      const conteudo = [
        livro.titulo,
        livro.subtitulo ?? '',
        livro.isbn10 ?? '',
        livro.isbn13 ?? '',
        nomeEditora,
        ...livro.autores.map((autor) => autor.nome),
        ...livro.categorias.map((categoria) => categoria.nome)
      ].join(' ')
      return normalizarTexto(conteudo).includes(termo)
    })
  }, [livros, editoras, busca, categoriaId, editoraId, somenteDisponiveis])

  const selecionado = filtrados.find((livro) => livro.id === selecionadoId) ?? filtrados[0] ?? null
  const nomeEditora = selecionado === null
    ? null
    : editoras.find((item) => item.id === selecionado.editoraId)?.nome ?? null

  return (
    <dialog
      ref={referencia}
      className="dialogo-confirmacao dialogo-catalogo"
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        evento.preventDefault()
        aoFechar()
      }}
    >
      <div className="dialogo-conteudo">
        <div className="catalogo-cabecalho">
          <span className="dialogo-icone"><Icone nome="book" /></span>
          <div>
            <h2 id={tituloId}>Catálogo de livros</h2>
            <p>Pesquise, filtre e confira os detalhes antes de escolher o exemplar.</p>
          </div>
        </div>

        <div className="catalogo-controles">
          <CampoTexto
            rotulo="Buscar livro"
            valor={busca}
            aoAlterar={setBusca}
            placeholder="Título, autor, ISBN ou editora"
            autoFocus
          />
          <CampoSelect
            rotulo="Categoria"
            valor={categoriaId}
            aoAlterar={setCategoriaId}
            vazio="Todas as categorias"
            opcoes={categorias.map((categoria) => ({ valor: String(categoria.id), rotulo: categoria.nome }))}
          />
          <CampoSelect
            rotulo="Editora"
            valor={editoraId}
            aoAlterar={setEditoraId}
            vazio="Todas as editoras"
            opcoes={editoras.map((editora) => ({ valor: String(editora.id), rotulo: editora.nome }))}
          />
          <CampoCheck
            rotulo="Somente disponíveis"
            marcado={somenteDisponiveis}
            aoAlterar={setSomenteDisponiveis}
          />
        </div>

        <p className="catalogo-contador">{filtrados.length} livro(s) encontrado(s).</p>

        <div className="catalogo-grade">
          <div className="catalogo-lista" role="listbox" aria-label="Livros do catálogo">
            {filtrados.length === 0 ? (
              <Aviso>Nenhum livro corresponde à pesquisa e aos filtros.</Aviso>
            ) : filtrados.map((livro) => {
              const ativo = livro.id === selecionado?.id
              return (
                <button
                  type="button"
                  key={livro.id}
                  role="option"
                  aria-selected={ativo}
                  className={ativo ? 'catalogo-item selecionado' : 'catalogo-item'}
                  onClick={() => setSelecionadoId(livro.id)}
                >
                  <CapaLivro
                    url={livro.capaUrl ?? capaUrlPorIsbn(livro)}
                    titulo={livro.titulo}
                    className="capa-lista"
                  />
                  <span className="catalogo-item-texto">
                    <strong>{livro.titulo}</strong>
                    <small>{livro.autores.map((autor) => autor.nome).join(', ') || 'Autor não informado'}</small>
                    <small>
                      {livro.exemplaresDisponiveis > 0
                        ? `${livro.exemplaresDisponiveis} disponível(is) de ${livro.totalExemplares}`
                        : 'Sem exemplar disponível'}
                    </small>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="catalogo-detalhes">
            {selecionado === null
              ? <Aviso>Selecione um livro para ver os detalhes.</Aviso>
              : <DetalhesLivro livro={selecionado} editoraNome={nomeEditora} />}
          </div>
        </div>

        <div className="acoes-formulario">
          <Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>
          <Botao
            variante="primario"
            icone="check"
            disabled={selecionado === null || selecionado.exemplaresDisponiveis <= 0}
            onClick={() => { if (selecionado !== null) aoSelecionar(selecionado) }}
          >
            Usar este livro
          </Botao>
        </div>
      </div>
    </dialog>
  )
}

export function AvisoToast({ mensagem, aoFechar }: { mensagem: Mensagem; aoFechar: () => void }): ReactNode {
  const icone: NomeIcone = mensagem.tom === 'erro' ? 'warning' : mensagem.tom === 'info' ? 'info' : 'check'
  return (
    <div className={`aviso-flutuante aviso-flutuante-${mensagem.tom}`} role={mensagem.tom === 'erro' ? 'alert' : 'status'}>
      <span className="aviso-flutuante-icone"><Icone nome={icone} /></span>
      <span>{mensagem.texto}</span>
      <button type="button" onClick={aoFechar} aria-label="Fechar aviso">
        <Icone nome="close" />
      </button>
    </div>
  )
}
