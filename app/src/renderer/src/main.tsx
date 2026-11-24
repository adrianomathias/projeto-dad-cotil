import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { UsuarioLogado } from '@biblioteca/shared'
import { api, mensagemErro } from './api'
import { CadastroEquipe, CadastroLeitor } from './cadastro'
import { Aviso, AvisoToast, Botao, CampoTexto, DialogoConfirmacao, Icone } from './componentes'
import { ContextoAplicacao, useAplicacao, type ValorAplicacao } from './contexto'
import {
  PaginaAcervo,
  PaginaAgendamentos,
  PaginaConfiguracoes,
  PaginaEmprestimos,
  PaginaEntidadeSimples,
  PaginaLeitores,
  PaginaMultas,
  PaginaNotificacoes,
  PaginaReservas,
  PaginaUsuarios,
  PaginaVisaoGeral
} from './paginas'
import {
  ITENS_NAVEGACAO,
  SECOES_POR_PERFIL,
  TITULOS_SECOES,
  somenteDigitos,
  type Mensagem,
  type PedidoConfirmacao,
  type Secao,
  type TomMensagem
} from './tipos'
import './styles.css'

type ConfirmacaoPendente = PedidoConfirmacao & { resolver: (resposta: boolean) => void }

const GRUPOS_MENU = ['Principal', 'Acervo', 'Pessoas', 'Operação', 'Sistema'] as const

function App(): ReactNode {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null)
  const [secao, setSecao] = useState<Secao>('inicio')
  const [versao, setVersao] = useState(0)
  const [mensagem, setMensagem] = useState<Mensagem | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(null)
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null)
  const confirmacaoRef = useRef<ConfirmacaoPendente | null>(null)
  const avisoTemporizador = useRef<number | null>(null)

  const notificar = useCallback((texto: string, tom: TomMensagem = 'sucesso') => {
    setMensagem({ texto, tom })
    if (avisoTemporizador.current !== null) window.clearTimeout(avisoTemporizador.current)
    avisoTemporizador.current = window.setTimeout(() => setMensagem(null), 5500)
  }, [])

  useEffect(() => () => {
    if (avisoTemporizador.current !== null) window.clearTimeout(avisoTemporizador.current)
  }, [])

  const confirmar = useCallback((pedido: PedidoConfirmacao): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const pendente: ConfirmacaoPendente = { ...pedido, resolver: resolve }
      confirmacaoRef.current = pendente
      setConfirmacao(pendente)
    })
  }, [])

  const responderConfirmacao = useCallback((resposta: boolean) => {
    const pendente = confirmacaoRef.current
    confirmacaoRef.current = null
    setConfirmacao(null)
    pendente?.resolver(resposta)
  }, [])

  const invalidar = useCallback(() => setVersao((atual) => atual + 1), [])

  const permitidas: readonly Secao[] = usuario === null ? [] : SECOES_POR_PERFIL[usuario.perfil]
  const navegar = useCallback((destino: Secao) => {
    if (permitidas.includes(destino)) setSecao(destino)
  }, [permitidas])

  const sair = useCallback((mensagemParaLogin?: string) => {
    api.limparToken()
    setUsuario(null)
    setSecao('inicio')
    setMensagem(null)
    setAvisoLogin(mensagemParaLogin ?? null)
  }, [])

  const valorContexto = useMemo<ValorAplicacao | null>(() => {
    if (usuario === null) return null
    return {
      api,
      usuario,
      secao,
      versao,
      navegar,
      notificar,
      confirmar,
      invalidar,
      sair
    }
  }, [usuario, secao, versao, navegar, notificar, confirmar, invalidar, sair])

  function entrar(usuarioLogado: UsuarioLogado): void {
    setAvisoLogin(null)
    setUsuario(usuarioLogado)
    setSecao('inicio')
  }

  if (valorContexto === null) {
    return <TelaLogin aoEntrar={entrar} aviso={avisoLogin} />
  }

  return (
    <ContextoAplicacao.Provider value={valorContexto}>
      <Layout secao={secao} />
      {mensagem === null ? null : (
        <AvisoToast mensagem={mensagem} aoFechar={() => setMensagem(null)} />
      )}
      {confirmacao === null ? null : (
        <DialogoConfirmacao
          key={`${confirmacao.titulo}-${confirmacao.mensagem}`}
          pedido={confirmacao}
          aoResponder={responderConfirmacao}
        />
      )}
    </ContextoAplicacao.Provider>
  )
}

type ModoLogin = 'equipe' | 'leitor'

function TelaLogin({
  aoEntrar,
  aviso
}: {
  aoEntrar: (usuario: UsuarioLogado) => void
  aviso: string | null
}): ReactNode {
  const [modo, setModo] = useState<ModoLogin>('equipe')
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [cadastro, setCadastro] = useState<'leitor' | 'equipe' | null>(null)

  function trocarModo(proximo: ModoLogin): void {
    setModo(proximo)
    setIdentificador('')
    setSenha('')
    setErro(null)
  }

  async function entrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const valor = identificador.trim()
    if (valor === '' || senha === '') {
      setErro(modo === 'leitor'
        ? 'Informe seu CPF e sua senha para continuar.'
        : 'Informe seu e-mail e sua senha para continuar.')
      return
    }
    const cpf = modo === 'leitor' ? somenteDigitos(valor) : ''
    if (modo === 'leitor' && cpf.length !== 11) {
      setErro('Informe o CPF com 11 dígitos.')
      return
    }
    setEntrando(true)
    setErro(null)
    try {
      const resposta = modo === 'leitor'
        ? await api.loginLeitor(cpf, senha)
        : await api.login(valor, senha)
      if (modo === 'leitor' && resposta.usuario.perfil !== 'LEITOR') {
        api.limparToken()
        setErro('Esta área é exclusiva para contas de leitor.')
        return
      }
      let usuarioLogado = resposta.usuario
      try {
        usuarioLogado = await api.me()
      } catch {
        // Se /auth/me não estiver disponível, usamos os dados devolvidos no login.
      }
      aoEntrar(usuarioLogado)
    } catch (erroCapturado) {
      setErro(mensagemErro(erroCapturado))
    } finally {
      setEntrando(false)
    }
  }

  const ehLeitor = modo === 'leitor'

  if (cadastro === 'leitor') {
    return <CadastroLeitor aoConcluir={aoEntrar} aoVoltar={() => setCadastro(null)} />
  }
  if (cadastro === 'equipe') {
    return <CadastroEquipe aoConcluir={aoEntrar} aoVoltar={() => setCadastro(null)} />
  }

  return (
    <main className="tela-login">
      <section className="cartao-login" aria-labelledby="titulo-login">
        <div className="login-abas" role="group" aria-label="Tipo de acesso">
          <button
            type="button"
            className={ehLeitor ? '' : 'ativo'}
            aria-pressed={!ehLeitor}
            onClick={() => trocarModo('equipe')}
          >
            <Icone nome="users" />
            <span>Administrador</span>
          </button>
          <button
            type="button"
            className={ehLeitor ? 'ativo' : ''}
            aria-pressed={ehLeitor}
            onClick={() => trocarModo('leitor')}
          >
            <Icone nome="user" />
            <span>Sou leitor</span>
          </button>
        </div>

        <div className="login-cabecalho">
          <span className="login-marca"><Icone nome="book" /></span>
          <p className="login-overline">Biblioteca Comunitária</p>
          <h1 id="titulo-login">Bem-vindo de volta</h1>
          <p>
            {ehLeitor
              ? 'Entre com seu CPF para acompanhar empréstimos, reservas e agendamentos.'
              : 'Entre com sua conta de administrador para gerenciar a biblioteca.'}
          </p>
        </div>

        {aviso === null ? null : (
          <Aviso tom="sucesso" titulo="Conta atualizada">{aviso}</Aviso>
        )}

        <form className="login-formulario" onSubmit={(evento) => { void entrar(evento) }}>
          <CampoTexto
            rotulo={ehLeitor ? 'CPF' : 'E-mail'}
            valor={identificador}
            aoAlterar={setIdentificador}
            tipo={ehLeitor ? 'text' : 'email'}
            autoComplete={ehLeitor ? 'off' : 'username'}
            inputMode={ehLeitor ? 'numeric' : undefined}
            obrigatorio
            placeholder={ehLeitor ? '000.000.000-00' : 'seu.email@exemplo.com'}
            ajuda={ehLeitor ? 'Use o CPF cadastrado na biblioteca, com ou sem pontos.' : undefined}
          />
          <CampoTexto
            rotulo="Senha"
            valor={senha}
            aoAlterar={setSenha}
            tipo="password"
            autoComplete="current-password"
            obrigatorio
            comOlho
            placeholder="Digite sua senha"
          />
          {erro === null ? null : (
            <p className="login-erro" role="alert">
              <Icone nome="warning" /> {erro}
            </p>
          )}
          <Botao variante="primario" type="submit" carregando={entrando} icone="check">
            {entrando ? 'Entrando...' : ehLeitor ? 'Entrar como leitor' : 'Entrar'}
          </Botao>
        </form>
        <div className="login-cadastro-acoes">
          {ehLeitor ? (
            <button type="button" onClick={() => { setErro(null); setCadastro('leitor') }}>
              <Icone nome="user" /> Cadastrar leitor
            </button>
          ) : (
            <button type="button" onClick={() => { setErro(null); setCadastro('equipe') }}>
              <Icone nome="users" /> Cadastrar administrador
            </button>
          )}
        </div>
        <p className="login-rodape">
          <Icone nome="info" />
          {ehLeitor
            ? 'Seu CPF é usado somente para localizar sua conta. Em caso de dúvida, fale com a equipe da biblioteca.'
            : 'Em caso de dúvida sobre seu acesso, fale com a equipe da biblioteca.'}
        </p>
      </section>
    </main>
  )
}

function Layout({ secao }: { secao: Secao }): ReactNode {
  const { usuario, sair, navegar } = useAplicacao()
  const titulo = TITULOS_SECOES[secao]
  const permitidas: readonly Secao[] = SECOES_POR_PERFIL[usuario.perfil]
  const itens = ITENS_NAVEGACAO.filter((item) => permitidas.includes(item.id))
  const papel = usuario.perfil === 'ADMIN' ? 'Administrador' : 'Leitor'

  return (
    <div className={usuario.somenteLeitura ? 'estrutura-aplicacao somente-leitura' : 'estrutura-aplicacao'}>
      <aside className="menu-lateral" aria-label="Menu principal">
        <div className="marca">
          <span className="marca-simbolo"><Icone nome="book" /></span>
          <div>
            <strong>Biblioteca</strong>
            <span>Comunitária</span>
          </div>
        </div>

        <label className="menu-mobile">
          <span>Seção</span>
          <select value={secao} onChange={(evento) => navegar(evento.target.value as Secao)}>
            {GRUPOS_MENU.map((grupo) => {
              const itensGrupo = itens.filter((item) => item.grupo === grupo)
              if (itensGrupo.length === 0) return null
              return (
                <optgroup label={grupo} key={grupo}>
                  {itensGrupo.map((item) => (
                    <option value={item.id} key={item.id}>{item.rotulo}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </label>

        <nav className="menu-navegacao" aria-label="Seções do sistema">
          {GRUPOS_MENU.map((grupo) => {
            const itensGrupo = itens.filter((item) => item.grupo === grupo)
            if (itensGrupo.length === 0) return null
            return (
              <div className="grupo-menu" key={grupo}>
                <p className="grupo-menu-titulo">{grupo}</p>
                <ul>
                  {itensGrupo.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={item.id === secao ? 'item-menu selecionado' : 'item-menu'}
                        onClick={() => navegar(item.id)}
                        aria-current={item.id === secao ? 'page' : undefined}
                      >
                        <span className="item-menu-icone"><Icone nome={item.icone} /></span>
                        <span>{item.rotulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>

        <div className="menu-rodape">
          <div className="cartao-usuario">
            <span className="avatar-usuario" aria-hidden="true">{usuario.nome.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{usuario.nome}</strong>
              <span>{papel}</span>
            </div>
          </div>
          <Botao icone="logout" onClick={() => sair()} className="botao-sair">Sair da conta</Botao>
        </div>
      </aside>

      <div className="area-principal">
        <header className="barra-superior">
          <div className="migalhas">
            <span>Biblioteca</span>
            <span aria-hidden="true">/</span>
            <strong>{titulo.titulo}</strong>
          </div>
          <div className="sessao-usuario">
            <span className="ponto-sessao" aria-hidden="true" />
            <span>Conectado à API</span>
          </div>
        </header>
        <main className="conteudo-principal">
          <div className="cabecalho-pagina">
            <div>
              <h1>{titulo.titulo}</h1>
              <p>{titulo.descricao}</p>
            </div>
          </div>
          {usuario.somenteLeitura ? (
            <Aviso tom="info" titulo="Conta somente para visualização">
              Você pode navegar e consultar todos os dados. Operações de criação, edição e exclusão estão bloqueadas.
            </Aviso>
          ) : null}
          <ConteudoSecao secao={secao} />
          <footer className="rodape-pagina">
            Biblioteca Comunitária <span aria-hidden="true">•</span> Dados carregados da API REST
          </footer>
        </main>
      </div>
    </div>
  )
}

function ConteudoSecao({ secao }: { secao: Secao }): ReactNode {
  switch (secao) {
    case 'inicio': return <PaginaVisaoGeral />
    case 'acervo': return <PaginaAcervo />
    case 'autores': return <PaginaEntidadeSimples secao="autores" caminho="/autores" nomeEntidade="Autor" nomePlural="Autores" />
    case 'editoras': return <PaginaEntidadeSimples secao="editoras" caminho="/editoras" nomeEntidade="Editora" nomePlural="Editoras" />
    case 'categorias': return <PaginaEntidadeSimples secao="categorias" caminho="/categorias" nomeEntidade="Categoria" nomePlural="Categorias" />
    case 'leitores': return <PaginaLeitores />
    case 'usuarios': return <PaginaUsuarios />
    case 'emprestimos': return <PaginaEmprestimos />
    case 'reservas': return <PaginaReservas />
    case 'agendamentos': return <PaginaAgendamentos />
    case 'multas': return <PaginaMultas />
    case 'configuracoes': return <PaginaConfiguracoes />
    case 'notificacoes': return <PaginaNotificacoes />
    default: return null
  }
}

const elemento = document.getElementById('root')
if (elemento === null) throw new Error('Elemento #root não encontrado.')

createRoot(elemento).render(<StrictMode><App /></StrictMode>)
