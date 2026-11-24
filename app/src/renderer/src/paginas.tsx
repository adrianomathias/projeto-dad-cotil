import { useMemo, useState, type ReactNode } from 'react'
import type {
  Agendamento,
  Autor,
  Categoria,
  Convite,
  Configuracoes,
  Editora,
  Emprestimo,
  Exemplar,
  Leitor,
  Livro,
  Multa,
  Notificacao,
  PagamentoMulta,
  Reserva,
  ResumoDashboard,
  SituacaoRegistro,
  Usuario
} from '@biblioteca/shared'
import { mensagemErro } from './api'
import {
  Aviso,
  BarraBusca,
  Botao,
  CampoCheck,
  CampoSelect,
  CampoTexto,
  Carregando,
  ConteudoLista,
  ErroCarregamento,
  Etiqueta,
  Icone,
  Painel,
  Tabela,
  type Coluna,
  type OpcaoCampo
} from './componentes'
import { useAplicacao } from './contexto'
import {
  FormularioAdministradorLocal,
  FormularioAgendamento,
  FormularioConfiguracoes,
  FormularioEmprestimo,
  FormularioEntidadeSimples,
  FormularioLeitor,
  FormularioLivro,
  FormularioPagamento,
  FormularioReserva,
  FormularioUsuario
} from './formularios'
import { useBusca, useLista, useRecurso } from './hooks'
import {
  formatarData,
  formatarDataHora,
  formatarDinheiro,
  numeroEm,
  rotuloStatus,
  TITULOS_SECOES,
  textoEm,
  type NomeIcone,
  type Secao,
  type TomEtiqueta
} from './tipos'

function tomStatus(status: string): TomEtiqueta {
  if (['aberto', 'aguardando', 'pendente', 'disponivel', 'ativo'].includes(status)) return 'sucesso'
  if (['disponivel_para_retirada', 'enviada', 'reenviada', 'paga', 'devolvido', 'retirado'].includes(status)) return 'info'
  if (['atencao', 'expirado', 'falhou', 'cancelado', 'estornada', 'inativo'].includes(status)) return 'atencao'
  if (['atrasado', 'perdoada'].includes(status)) return 'neutro'
  return 'neutro'
}

function etiquetaStatus(status: string): ReactNode {
  return <Etiqueta tom={tomStatus(status)}>{rotuloStatus(status)}</Etiqueta>
}

function tituloExemplar(exemplar: Exemplar): string {
  return exemplar.tituloLivro ?? `Livro #${exemplar.livroId}`
}

function opcoesDe<T>(itens: readonly T[], valor: (item: T) => string, rotulo: (item: T) => string): OpcaoCampo[] {
  return itens.map((item) => ({ valor: valor(item), rotulo: rotulo(item) }))
}

const OPCOES_SITUACAO: readonly OpcaoCampo[] = [
  { valor: 'todos', rotulo: 'Todos (inclusive inativos)' },
  { valor: 'ativos', rotulo: 'Somente ativos' },
  { valor: 'inativos', rotulo: 'Somente inativos' }
]

function FiltroSituacao({
  valor,
  aoAlterar
}: {
  valor: SituacaoRegistro
  aoAlterar: (valor: SituacaoRegistro) => void
}): ReactNode {
  return (
    <CampoSelect
      rotulo="Situação"
      valor={valor}
      aoAlterar={(texto) => aoAlterar(texto as SituacaoRegistro)}
      opcoes={OPCOES_SITUACAO}
      compacto
    />
  )
}

interface OpcoesBotaoExclusao {
  /** Chamada para registros ativos: inativa o registro e preserva o histórico. */
  aoInativar?: () => void
  inativarDesabilitado?: boolean
  tituloInativar?: string
}

/** Único botão de ação: "Inativar" para ativos e "Excluir" para inativos. */
function useExclusaoFisica(): {
  excluir: (recurso: string, id: number, nome: string) => Promise<void>
  botao: (recurso: string, id: number, nome: string, inativo: boolean, opcoes?: OpcoesBotaoExclusao) => ReactNode
} {
  const { api, notificar, confirmar, invalidar, usuario } = useAplicacao()

  async function excluir(recurso: string, id: number, nome: string): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Excluir registro do banco?',
      mensagem: 'O registro inativo será apagado do banco de dados. Registros com histórico vinculado serão bloqueados. Esta ação não pode ser desfeita.',
      detalhes: [nome],
      perigo: true,
      confirmarTexto: 'Excluir'
    })
    if (!aceito) return
    try {
      await api.excluirRegistroFisico(recurso, id)
      notificar('Registro excluído do banco com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  return {
    excluir,
    botao: (recurso, id, nome, inativo, opcoes) => {
      if (usuario.perfil !== 'ADMIN') return null
      if (!inativo && opcoes?.aoInativar === undefined) return null
      const desabilitado = inativo ? false : opcoes?.inativarDesabilitado === true
      return (
        <Botao
          pequeno
          variante="perigo"
          icone="trash"
          disabled={desabilitado}
          title={inativo
            ? 'Excluir este registro inativo do banco'
            : (opcoes?.tituloInativar ?? 'Inativar o registro; o histórico será preservado')}
          onClick={() => {
            if (inativo) void excluir(recurso, id, nome)
            else opcoes?.aoInativar?.()
          }}
        >
          {inativo ? 'Excluir' : 'Inativar'}
        </Botao>
      )
    }
  }
}

/** Visão geral: números oficiais da API (ou do próprio leitor). */
export function PaginaVisaoGeral(): ReactNode {
  const { usuario, navegar } = useAplicacao()
  const caminho = usuario.perfil === 'LEITOR' ? '/dashboard/me' : '/dashboard'
  const resumo = useRecurso<Partial<ResumoDashboard>>(caminho)
  const configuracoes = useRecurso<Configuracoes>('/configuracoes')

  if (resumo.carregando) return <Carregando rotulo="Carregando resumo da biblioteca..." />
  if (resumo.erro !== null || resumo.dados === null) {
    return <ErroCarregamento mensagem={resumo.erro ?? 'Nenhum dado foi devolvido pela API.'} aoTentar={resumo.recarregar} />
  }

  const dados = resumo.dados
  const emprestimos = dados.emprestimosAtivos ?? numeroEm(dados, 'emprestimosAtivosProprios')
  const reservas = dados.reservasAguardando ?? numeroEm(dados, 'reservasAtivas')
  const multas = dados.multasAbertasCentavos ?? numeroEm(dados, 'multasEmAbertoCentavos')
  const todasMetricas: { rotulo: string; valor: string | number | undefined; icone: NomeIcone; destino?: Secao }[] = [
    { rotulo: 'Títulos no acervo', valor: dados.totalTitulos, icone: 'book', destino: 'acervo' },
    { rotulo: 'Exemplares', valor: dados.totalExemplares, icone: 'package', destino: 'acervo' },
    { rotulo: 'Leitores ativos', valor: dados.leitoresAtivos, icone: 'users', destino: 'leitores' },
    { rotulo: 'Empréstimos ativos', valor: emprestimos, icone: 'loan', destino: usuario.perfil === 'LEITOR' ? undefined : 'emprestimos' },
    { rotulo: 'Empréstimos em atraso', valor: dados.emprestimosAtrasados, icone: 'clock', destino: usuario.perfil === 'LEITOR' ? undefined : 'emprestimos' },
    { rotulo: 'Vencendo em breve', valor: dados.emprestimosVencendo, icone: 'bell', destino: usuario.perfil === 'LEITOR' ? undefined : 'emprestimos' },
    { rotulo: 'Reservas', valor: reservas, icone: 'queue', destino: 'reservas' },
    { rotulo: 'Reservas para retirada', valor: dados.reservasParaRetirada, icone: 'calendar', destino: 'reservas' },
    { rotulo: 'Multas em aberto', valor: multas === undefined ? undefined : formatarDinheiro(multas), icone: 'money', destino: usuario.perfil === 'LEITOR' ? undefined : 'multas' }
  ]
  const metricas = todasMetricas.filter((metrica) => metrica.valor !== undefined)

  const atalhos = [
    { id: 'acervo' as Secao, rotulo: 'Consultar o acervo', icone: 'book' as NomeIcone },
    { id: 'emprestimos' as Secao, rotulo: 'Ver empréstimos', icone: 'loan' as NomeIcone },
    { id: 'reservas' as Secao, rotulo: 'Acompanhar reservas', icone: 'queue' as NomeIcone },
    { id: 'agendamentos' as Secao, rotulo: 'Agendar retirada', icone: 'calendar' as NomeIcone }
  ].filter((atalho) => {
    const permitidas: readonly Secao[] = usuario.perfil === 'LEITOR' ? ['reservas', 'agendamentos'] : ['acervo', 'emprestimos', 'reservas', 'agendamentos']
    return permitidas.includes(atalho.id)
  })

  return (
    <>
      <section className="banner-boas-vindas">
        <div>
          <span className="banner-icone"><Icone nome="book" /></span>
          <div>
            <h2>Olá, {usuario.nome.split(' ')[0]}!</h2>
            <p>
              {usuario.perfil === 'LEITOR'
                ? 'Acompanhe suas reservas e agendamentos por aqui. Se precisar de ajuda, procure a equipe da biblioteca.'
                : 'Tudo o que acontece na biblioteca está reunido nesta tela. Use o menu para navegar.'}
            </p>
          </div>
        </div>
        <Botao variante="claro" icone="arrow" onClick={() => navegar(atalhos[0]?.id ?? 'reservas')}>
          Continuar
        </Botao>
      </section>

      {metricas.length === 0 ? (
        <Aviso>A API ainda não devolveu números para o seu perfil. Volte em instantes.</Aviso>
      ) : (
        <section className="grade-metricas" aria-label="Resumo da biblioteca">
          {metricas.map((metrica) => {
            const conteudo = (
              <>
                <span className="metrica-icone"><Icone nome={metrica.icone} /></span>
                <span className="metrica-rotulo">{metrica.rotulo}</span>
                <strong>{metrica.valor}</strong>
                <span className="metrica-nota">Atualizado pela API</span>
              </>
            )
            return metrica.destino === undefined ? (
              <div className="cartao-metrica" key={metrica.rotulo}>{conteudo}</div>
            ) : (
              <button className="cartao-metrica" key={metrica.rotulo} onClick={() => navegar(metrica.destino as Secao)} type="button">
                {conteudo}
              </button>
            )
          })}
        </section>
      )}

      <div className="grade-paineis">
        <Painel titulo="Atalhos" descricao="Acesse rapidamente as áreas mais usadas.">
          <div className="lista-atalhos">
            {atalhos.map((atalho) => (
              <button type="button" className="atalho" key={atalho.id} onClick={() => navegar(atalho.id)}>
                <span className="atalho-icone"><Icone nome={atalho.icone} /></span>
                <span>{atalho.rotulo}</span>
                <Icone nome="arrow" />
              </button>
            ))}
          </div>
        </Painel>

        <Painel titulo="Regras da biblioteca" descricao="Valores definidos nas configurações da API.">
          {configuracoes.carregando ? <Carregando rotulo="Carregando regras..." /> : null}
          {configuracoes.erro !== null ? <Aviso tom="erro">{configuracoes.erro}</Aviso> : null}
          {configuracoes.dados === null ? null : (
            <ul className="lista-regras">
              <li><span>Prazo de empréstimo</span><strong>{configuracoes.dados.prazoEmprestimoDias} dias</strong></li>
              <li><span>Limite por leitor</span><strong>{configuracoes.dados.limiteExemplaresPorLeitor} exemplares</strong></li>
              <li><span>Renovação</span><strong>+{configuracoes.dados.prazoRenovacaoDias} dias</strong></li>
              <li><span>Retirada de reserva</span><strong>{configuracoes.dados.prazoRetiradaHoras} horas</strong></li>
              <li><span>Multa diária</span><strong>{formatarDinheiro(configuracoes.dados.valorDiarioMultaCentavos)}</strong></li>
              <li><span>Agendamento</span><strong>até {configuracoes.dados.diasMaxAgendamento} dias</strong></li>
            </ul>
          )}
        </Painel>
      </div>
    </>
  )
}

/** Acervo com busca, filtros e cadastro assistido pelo Google Books. */
export function PaginaAcervo(): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [autorId, setAutorId] = useState('')
  const [editoraId, setEditoraId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [disponivel, setDisponivel] = useState('')
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [formulario, setFormulario] = useState<{ tipo: 'novo'; focoImportacao?: boolean } | { tipo: 'editar'; livro: Livro } | null>(null)

  const params = useMemo(() => ({
    q: busca.termoAplicado,
    situacao,
    autorId: autorId === '' ? undefined : autorId,
    editoraId: editoraId === '' ? undefined : editoraId,
    categoriaId: categoriaId === '' ? undefined : categoriaId,
    disponivel: disponivel === '' ? undefined : disponivel,
    porPagina: 50
  }), [busca.termoAplicado, situacao, autorId, editoraId, categoriaId, disponivel])

  const livros = useLista<Livro>('/livros', params)
  const autores = useLista<Autor>('/autores', { porPagina: 200 })
  const editoras = useLista<Editora>('/editoras', { porPagina: 200 })
  const categorias = useLista<Categoria>('/categorias', { porPagina: 200 })

  const nomeEditora = (id: number | null): string => editoras.itens.find((editora) => editora.id === id)?.nome ?? '—'

  async function excluir(livro: Livro): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Inativar livro do acervo?',
      mensagem: 'O livro deixará de aparecer nas consultas, mas o histórico de empréstimos será preservado. Depois de inativado, o botão passa a ser Excluir e apaga o registro do banco.',
      detalhes: [`Livro: ${livro.titulo}`],
      confirmarTexto: 'Inativar',
      perigo: true
    })
    if (!aceito) return
    try {
      await api.del(`/livros/${livro.id}`)
      notificar('Livro inativado com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Livro>[] = [
    {
      titulo: 'Livro',
      conteudo: (livro) => (
        <>
          <strong>{livro.titulo}</strong>
          <span className="subtitulo-celula">
            {livro.autores.length === 0 ? 'Autor não informado' : livro.autores.map((autor) => autor.nome).join(', ')}
          </span>
        </>
      )
    },
    { titulo: 'ISBN', conteudo: (livro) => <span className="mono">{livro.isbn13 ?? livro.isbn10 ?? '—'}</span> },
    {
      titulo: 'Editora / ano',
      conteudo: (livro) => (
        <>
          <span>{nomeEditora(livro.editoraId)}</span>
          <span className="subtitulo-celula">{livro.anoPublicacao === null ? 'Ano não informado' : String(livro.anoPublicacao)}</span>
        </>
      )
    },
    {
      titulo: 'Exemplares',
      conteudo: (livro) => (
        <>
          <strong>{livro.totalExemplares}</strong>
          <span className="subtitulo-celula">{livro.exemplaresDisponiveis} disponível(is)</span>
        </>
      )
    },
    {
      titulo: 'Situação',
      conteudo: (livro) => (
        livro.deletedAt !== null
          ? <Etiqueta tom="atencao">Inativo</Etiqueta>
          : livro.exemplaresDisponiveis > 0
            ? <Etiqueta tom="sucesso">Disponível</Etiqueta>
            : <Etiqueta tom="atencao">Sem exemplar livre</Etiqueta>
      )
    },
    {
      titulo: 'Ações',
      conteudo: (livro) => (
        <div className="acoes-linha">
          <Botao pequeno icone="edit" onClick={() => setFormulario({ tipo: 'editar', livro })}>Editar</Botao>
          {exclusao.botao('livros', livro.id, livro.titulo, livro.deletedAt !== null, {
            aoInativar: () => { void excluir(livro) }
          })}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo="Encontrar livros"
        descricao="Livros ativos e inativos aparecem por padrão. Use o filtro para separá-los."
        acoes={(
          <div className="painel-acoes">
            <Botao variante="primario" icone="plus" onClick={() => setFormulario({ tipo: 'novo' })}>Adicionar livro</Botao>
            <Botao icone="package" onClick={() => setFormulario({ tipo: 'novo', focoImportacao: true })}>Importar da API</Botao>
          </div>
        )}
      >
        <div className="barra-filtros">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Buscar por título, autor ou ISBN" />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
          <CampoSelect rotulo="Autor" valor={autorId} aoAlterar={setAutorId} vazio="Todos os autores" compacto opcoes={opcoesDe(autores.itens, (item) => String(item.id), (item) => item.nome)} />
          <CampoSelect rotulo="Editora" valor={editoraId} aoAlterar={setEditoraId} vazio="Todas as editoras" compacto opcoes={opcoesDe(editoras.itens, (item) => String(item.id), (item) => item.nome)} />
          <CampoSelect rotulo="Categoria" valor={categoriaId} aoAlterar={setCategoriaId} vazio="Todas as categorias" compacto opcoes={opcoesDe(categorias.itens, (item) => String(item.id), (item) => item.nome)} />
          <CampoSelect
            rotulo="Disponibilidade"
            valor={disponivel}
            aoAlterar={setDisponivel}
            vazio="Todas"
            compacto
            opcoes={[{ valor: 'true', rotulo: 'Disponíveis' }, { valor: 'false', rotulo: 'Indisponíveis' }]}
          />
        </div>
      </Painel>

      {formulario === null ? null : (
        <Painel
          titulo={formulario.tipo === 'novo'
            ? (formulario.focoImportacao === true ? 'Importar livro da API' : 'Adicionar livro')
            : 'Editar livro'}
          descricao="A confirmação é solicitada antes de qualquer gravação."
        >
          <FormularioLivro
            autores={autores.itens}
            editoras={editoras.itens}
            categorias={categorias.itens}
            livro={formulario.tipo === 'editar' ? formulario.livro : null}
            aoCancelar={() => setFormulario(null)}
            focoImportacao={formulario.tipo === 'novo' && formulario.focoImportacao === true}
          />
        </Painel>
      )}

      <Painel titulo="Livros cadastrados" descricao={`${livros.total ?? livros.itens.length} resultado(s) encontrado(s).`}>
        <ConteudoLista
          carregando={livros.carregando}
          erro={livros.erro}
          aoTentar={livros.recarregar}
          vazio={livros.itens.length === 0}
        >
          <Tabela colunas={colunas} itens={livros.itens} chave={(livro) => livro.id} legenda="Livros do acervo" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** CRUD das entidades simples: autores, editoras e categorias. */
export function PaginaEntidadeSimples({
  secao,
  caminho,
  nomeEntidade,
  nomePlural
}: {
  secao: Secao
  caminho: string
  nomeEntidade: string
  nomePlural: string
}): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const lista = useLista<{ id: number; nome: string; deletedAt: string | null }>(caminho, {
    q: busca.termoAplicado,
    situacao,
    porPagina: 50
  })
  const [formulario, setFormulario] = useState<{ tipo: 'novo' } | { tipo: 'editar'; item: { id: number; nome: string } } | null>(null)

  async function excluir(item: { id: number; nome: string }): Promise<void> {
    const aceito = await confirmar({
      titulo: `Inativar ${nomeEntidade.toLowerCase()}?`,
      mensagem: 'O registro deixará de aparecer nas listagens, mas continuará no histórico. Depois de inativado, o botão passa a ser Excluir e apaga o registro do banco.',
      detalhes: [item.nome],
      perigo: true,
      confirmarTexto: 'Inativar'
    })
    if (!aceito) return
    try {
      await api.del(`${caminho}/${item.id}`)
      notificar(`${nomeEntidade} inativado com sucesso.`)
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<{ id: number; nome: string; deletedAt: string | null }>[] = [
    { titulo: 'Nome', conteudo: (item) => <strong>{item.nome}</strong> },
    {
      titulo: 'Situação',
      conteudo: (item) => item.deletedAt === null ? <Etiqueta tom="sucesso">Ativo</Etiqueta> : <Etiqueta tom="atencao">Inativo</Etiqueta>
    },
    {
      titulo: 'Ações',
      conteudo: (item) => (
        <div className="acoes-linha">
          <Botao pequeno icone="edit" onClick={() => setFormulario({ tipo: 'editar', item })}>Editar</Botao>
          {exclusao.botao(caminho.replace(/^\/+/, ''), item.id, item.nome, item.deletedAt !== null, {
            aoInativar: () => { void excluir(item) }
          })}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo={nomePlural}
        descricao={`${TITULOS_SECOES[secao].descricao} Ativos e inativos ficam visíveis por padrão.`}
        acoes={<Botao variante="primario" icone="plus" onClick={() => setFormulario({ tipo: 'novo' })}>Novo {nomeEntidade.toLowerCase()}</Botao>}
      >
        <div className="barra-filtros">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo={`Buscar ${nomePlural.toLowerCase()}`} />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
        </div>
      </Painel>

      {formulario === null ? null : (
        <Painel titulo={formulario.tipo === 'novo' ? `Novo ${nomeEntidade.toLowerCase()}` : `Editar ${nomeEntidade.toLowerCase()}`}>
          <FormularioEntidadeSimples
            nomeEntidade={nomeEntidade}
            caminho={caminho}
            valorInicial={formulario.tipo === 'editar' ? formulario.item : null}
            aoCancelar={() => setFormulario(null)}
          />
        </Painel>
      )}

      <Painel titulo={`${nomePlural} cadastrados`} descricao={`${lista.total ?? lista.itens.length} registro(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(item) => item.id} legenda={nomePlural} />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Leitores: busca por nome/CPF e endereço preenchido por CEP. */
export function PaginaLeitores(): ReactNode {
  const { api, notificar, confirmar, invalidar, usuario } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [formulario, setFormulario] = useState<{ tipo: 'novo' } | { tipo: 'editar'; leitor: Leitor } | null>(null)
  const lista = useLista<Leitor>('/leitores', {
    q: busca.termoAplicado,
    situacao,
    porPagina: 50
  })

  async function excluir(leitor: Leitor): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Inativar leitor?',
      mensagem: 'A conta de login será desativada e reservas/agendamentos ativos serão cancelados. O histórico fica no banco, mas o nome do leitor não aparecerá nas consultas. Depois de inativado, o botão passa a ser Excluir e apaga o registro do banco.',
      detalhes: [leitor.nome],
      perigo: true,
      confirmarTexto: 'Inativar'
    })
    if (!aceito) return
    try {
      await api.del(`/leitores/${leitor.id}`)
      notificar('Leitor inativado e removido das consultas. O histórico foi preservado.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  async function excluirDefinitivamente(leitor: Leitor): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Anonimizar histórico do leitor?',
      mensagem: 'CPF, e-mail, telefone e endereço serão removidos e o leitor não aparecerá mais em nenhuma tela. O histórico financeiro e de empréstimos fica anônimo para auditoria. Esta ação não pode ser desfeita.',
      detalhes: [leitor.nome, leitor.cpfMascara],
      perigo: true,
      confirmarTexto: 'Anonimizar histórico'
    })
    if (!aceito) return
    try {
      await api.excluirLeitorDefinitivamente(leitor.id)
      notificar('Dados pessoais removidos. O histórico anônimo foi preservado.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Leitor>[] = [
    {
      titulo: 'Leitor',
      conteudo: (leitor) => (
        <>
          <strong>{leitor.nome}</strong>
          <span className="subtitulo-celula">{leitor.email ?? 'Sem e-mail informado'}</span>
        </>
      )
    },
    { titulo: 'CPF', conteudo: (leitor) => <span className="mono">{leitor.cpfMascara}</span> },
    { titulo: 'Contato', conteudo: (leitor) => leitor.telefone ?? '—' },
    {
      titulo: 'Movimentação',
      conteudo: (leitor) => (
        <>
          <span>{leitor.emprestimosAtivos} empréstimo(s)</span>
          <span className="subtitulo-celula">{leitor.reservasAtivas} reserva(s)</span>
        </>
      )
    },
    { titulo: 'Multa', conteudo: (leitor) => formatarDinheiro(leitor.multaEmAbertoCentavos) },
    { titulo: 'Situação', conteudo: (leitor) => leitor.ativo ? <Etiqueta tom="sucesso">Ativo</Etiqueta> : <Etiqueta tom="atencao">Inativo</Etiqueta> },
    {
      titulo: 'Ações',
      conteudo: (leitor) => (
        <div className="acoes-linha">
          <Botao pequeno icone="edit" onClick={() => setFormulario({ tipo: 'editar', leitor })}>Editar</Botao>
          {exclusao.botao('leitores', leitor.id, leitor.nome, !leitor.ativo || leitor.deletedAt !== null || leitor.excluidoEm !== null, {
            aoInativar: () => { void excluir(leitor) },
            inativarDesabilitado: leitor.emprestimosAtivos > 0,
            tituloInativar: leitor.emprestimosAtivos > 0
              ? 'Devolva os empréstimos antes de inativar.'
              : 'Inativar o leitor; o histórico será preservado'
          })}
          {usuario.perfil === 'ADMIN' && leitor.deletedAt !== null ? (
            <Botao
              pequeno
              variante="secundario"
              icone="edit"
              onClick={() => { void excluirDefinitivamente(leitor) }}
            >
              Anonimizar histórico
            </Botao>
          ) : null}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo="Buscar leitores"
        descricao="Você pode procurar pelo nome ou por parte do CPF. Ativos e inativos aparecem por padrão."
        acoes={<Botao variante="primario" icone="plus" onClick={() => setFormulario({ tipo: 'novo' })}>Cadastrar leitor</Botao>}
      >
        <div className="barra-filtros">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Nome ou CPF do leitor" placeholder="Digite nome ou CPF" />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
        </div>
      </Painel>

      {formulario === null ? null : (
        <Painel titulo={formulario.tipo === 'novo' ? 'Cadastrar leitor' : 'Editar leitor'} descricao="O endereço pode ser preenchido automaticamente pelo CEP.">
          <FormularioLeitor leitor={formulario.tipo === 'editar' ? formulario.leitor : null} aoCancelar={() => setFormulario(null)} />
        </Painel>
      )}

      <Painel titulo="Leitores cadastrados" descricao={`${lista.total ?? lista.itens.length} leitor(es) encontrado(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(leitor) => leitor.id} legenda="Leitores cadastrados" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Usuários e permissões (somente ADMIN). */
export function PaginaUsuarios(): ReactNode {
  const { api, notificar, confirmar, invalidar, sair } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [formulario, setFormulario] = useState<{ tipo: 'novo' } | { tipo: 'editar'; usuario: Usuario } | null>(null)
  const [trocarAdmin, setTrocarAdmin] = useState(false)
  const [emailConvite, setEmailConvite] = useState('')
  const [codigoConvite, setCodigoConvite] = useState<string | null>(null)
  const [criandoConvite, setCriandoConvite] = useState(false)
  const lista = useLista<Usuario>('/usuarios', { q: busca.termoAplicado, situacao, porPagina: 50 })
  const leitores = useLista<Leitor>('/leitores', { porPagina: 200 })
  const convites = useLista<Convite>('/convites', { situacao })

  async function excluir(usuario: Usuario): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Inativar usuário?',
      mensagem: 'Esta pessoa deixará de conseguir entrar no sistema. Depois de inativado, o botão passa a ser Excluir e apaga o registro do banco.',
      detalhes: [usuario.nome, usuario.email],
      perigo: true,
      confirmarTexto: 'Inativar'
    })
    if (!aceito) return
    try {
      await api.del(`/usuarios/${usuario.id}`)
      notificar('Usuário inativado com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  async function gerarConvite(): Promise<void> {
    setCriandoConvite(true)
    setCodigoConvite(null)
    try {
      const resultado = await api.criarConvite({
        perfil: 'ADMIN',
        ...(emailConvite.trim() === '' ? {} : { email: emailConvite.trim() })
      })
      setCodigoConvite(resultado.codigo)
      setEmailConvite('')
      notificar('Convite gerado. Envie o código apenas à pessoa autorizada.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setCriandoConvite(false)
    }
  }

  async function revogar(convite: Convite): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Revogar convite?',
      mensagem: 'O código deixará de funcionar imediatamente.',
      detalhes: [`Código ${convite.codigoMascara}`, convite.email ?? 'Sem e-mail definido'],
      perigo: true,
      confirmarTexto: 'Revogar convite'
    })
    if (!aceito) return
    try {
      await api.revogarConvite(convite.id)
      notificar('Convite revogado com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunasConvite: Coluna<Convite>[] = [
    {
      titulo: 'Convite',
      conteudo: (convite) => (
        <>
          <strong>{convite.codigoMascara}</strong>
          <span className="subtitulo-celula">{convite.email ?? 'Sem e-mail definido'}</span>
        </>
      )
    },
    {
      titulo: 'Perfil',
      conteudo: (convite) => (
        <Etiqueta tom={convite.perfil === 'ADMIN' ? 'info' : 'neutro'}>
          Administrador
        </Etiqueta>
      )
    },
    {
      titulo: 'Validade',
      conteudo: (convite) => formatarDataHora(convite.expiraEm)
    },
    {
      titulo: 'Situação',
      conteudo: (convite) => convite.ativo
        ? <Etiqueta tom="sucesso">Disponível</Etiqueta>
        : convite.usadoEm !== null
          ? <Etiqueta tom="info">Usado</Etiqueta>
          : convite.revogadoEm !== null
            ? <Etiqueta tom="atencao">Revogado</Etiqueta>
            : <Etiqueta tom="perigo">Vencido</Etiqueta>
    },
    {
      titulo: 'Ações',
      conteudo: (convite) => (
        <div className="acoes-linha">
          {convite.ativo ? (
            <Botao pequeno variante="perigo" icone="trash" onClick={() => { void revogar(convite) }}>Revogar</Botao>
          ) : null}
          {exclusao.botao('convites', convite.id, convite.codigoMascara, !convite.ativo)}
        </div>
      )
    }
  ]

  const colunas: Coluna<Usuario>[] = [
    {
      titulo: 'Usuário',
      conteudo: (usuario) => (
        <>
          <strong>{usuario.nome}</strong>
          <span className="subtitulo-celula">{usuario.email}</span>
        </>
      )
    },
    {
      titulo: 'Perfil',
      conteudo: (usuario) => (
        <Etiqueta tom={usuario.perfil === 'ADMIN' ? 'info' : 'neutro'}>
          {usuario.perfil === 'ADMIN' ? 'Administrador' : 'Leitor'}
        </Etiqueta>
      )
    },
    { titulo: 'Situação', conteudo: (usuario) => usuario.ativo ? <Etiqueta tom="sucesso">Ativo</Etiqueta> : <Etiqueta tom="atencao">Inativo</Etiqueta> },
    {
      titulo: 'Último acesso',
      conteudo: (usuario) => usuario.ultimoLoginEm === null ? 'Nunca entrou' : formatarDataHora(usuario.ultimoLoginEm)
    },
    {
      titulo: 'Ações',
      conteudo: (usuario) => (
        <div className="acoes-linha">
          <Botao pequeno icone="edit" onClick={() => setFormulario({ tipo: 'editar', usuario })}>Editar</Botao>
          {exclusao.botao('usuarios', usuario.id, usuario.nome, !usuario.ativo || usuario.deletedAt !== null, {
            aoInativar: () => { void excluir(usuario) }
          })}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo="Usuários do sistema"
        descricao="Somente administradores podem criar e alterar usuários. Ativos e inativos aparecem por padrão."
        acoes={<Botao variante="primario" icone="plus" onClick={() => setFormulario({ tipo: 'novo' })}>Novo usuário</Botao>}
      >
        <div className="barra-filtros">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Buscar por nome ou e-mail" />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
        </div>
      </Painel>

      {formulario === null ? null : (
        <Painel titulo={formulario.tipo === 'novo' ? 'Novo usuário' : 'Editar usuário'}>
          <FormularioUsuario
            leitores={leitores.itens}
            usuario={formulario.tipo === 'editar' ? formulario.usuario : null}
            aoCancelar={() => setFormulario(null)}
          />
        </Painel>
      )}

      <Painel
        titulo="Administrador da biblioteca"
        descricao="Substitua a conta local de desenvolvimento pela conta do cliente. A conta anterior é inativada e o histórico é preservado."
        acoes={trocarAdmin ? null : (
          <Botao variante="secundario" icone="edit" onClick={() => setTrocarAdmin(true)}>Trocar administrador</Botao>
        )}
      >
        {trocarAdmin ? (
          <FormularioAdministradorLocal aoConcluir={(mensagem) => sair(mensagem)} />
        ) : (
          <p>Informe o e-mail e a senha definitivos antes de entregar o sistema ao cliente.</p>
        )}
      </Painel>

      <Painel
        titulo="Convites de administrador"
        descricao="Novos administradores exigem um convite individual, com validade de 24 horas e uso único."
      >
        <form className="formulario-grade" onSubmit={(evento) => { evento.preventDefault(); void gerarConvite() }}>
          <CampoTexto
            rotulo="E-mail destinatário (opcional)"
            valor={emailConvite}
            aoAlterar={setEmailConvite}
            tipo="email"
            autoComplete="off"
            placeholder="pessoa@biblioteca.local"
            ajuda="Se informado, somente este e-mail poderá usar o convite."
          />
          <div className="acoes-formulario">
            <Botao variante="primario" type="submit" carregando={criandoConvite} icone="send">
              Gerar convite
            </Botao>
          </div>
        </form>
        {codigoConvite === null ? null : (
          <Aviso tom="sucesso" titulo="Convite criado">
            <p>Entregue o código abaixo apenas à pessoa autorizada. Ele não será exibido novamente.</p>
            <code className="codigo-convite">{codigoConvite}</code>
          </Aviso>
        )}
        <div className="barra-filtros">
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
        </div>
        <div className="lista-convites">
          <ConteudoLista
            carregando={convites.carregando}
            erro={convites.erro}
            aoTentar={convites.recarregar}
            vazio={convites.itens.length === 0}
          >
            <Tabela colunas={colunasConvite} itens={convites.itens} chave={(convite) => convite.id} legenda="Convites gerados" />
          </ConteudoLista>
        </div>
      </Painel>

      <Painel titulo="Usuários cadastrados" descricao={`${lista.total ?? lista.itens.length} usuário(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(usuario) => usuario.id} legenda="Usuários do sistema" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Empréstimos com filtros, retirada, renovação e devolução. */
export function PaginaEmprestimos(): ReactNode {
  const { api, notificar, confirmar, invalidar, usuario } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [status, setStatus] = useState('')
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [atrasados, setAtrasados] = useState(false)
  const [vencendo, setVencendo] = useState(false)
  const [formularioAberto, setFormularioAberto] = useState(false)
  const params = useMemo(() => ({
    q: busca.termoAplicado,
    situacao,
    status: status === '' ? undefined : status,
    atrasados: atrasados ? true : undefined,
    vencendo: vencendo ? true : undefined,
    porPagina: 50
  }), [busca.termoAplicado, situacao, status, atrasados, vencendo])
  const lista = useLista<Emprestimo>('/emprestimos', params)
  const leitores = useLista<Leitor>('/leitores', { porPagina: 200 })
  const exemplares = useLista<Exemplar>('/exemplares', { porPagina: 200 })

  async function executarAcao(emprestimo: Emprestimo, acao: 'renovacao' | 'devolucao' | 'cancelamento'): Promise<void> {
    const textos = {
      renovacao: {
        titulo: 'Renovar empréstimo?',
        mensagem: 'A renovação só é permitida se não houver fila de espera pelo livro.',
        confirmar: 'Renovar',
        sucesso: 'Empréstimo renovado com sucesso.'
      },
      devolucao: {
        titulo: 'Confirmar devolução?',
        mensagem: 'Confira se o exemplar foi realmente recebido antes de registrar.',
        confirmar: 'Registrar devolução',
        sucesso: 'Devolução registrada com sucesso.'
      },
      cancelamento: {
        titulo: 'Cancelar empréstimo?',
        mensagem: 'O empréstimo será cancelado e o exemplar voltará ficar disponível.',
        confirmar: 'Cancelar empréstimo',
        sucesso: 'Empréstimo cancelado.'
      }
    } as const
    const opcoes = textos[acao]
    const aceito = await confirmar({
      titulo: opcoes.titulo,
      mensagem: opcoes.mensagem,
      detalhes: [
        emprestimo.nomeLeitor === undefined ? `Leitor #${emprestimo.leitorId}` : `Leitor: ${emprestimo.nomeLeitor}`,
        emprestimo.tituloLivro === undefined ? `Exemplar #${emprestimo.exemplarId}` : `Livro: ${emprestimo.tituloLivro}`,
        `Devolução prevista: ${formatarData(emprestimo.dataDevolucaoPrevista)}`
      ],
      confirmarTexto: opcoes.confirmar,
      perigo: acao === 'cancelamento'
    })
    if (!aceito) return
    try {
      if (acao === 'cancelamento') await api.del(`/emprestimos/${emprestimo.id}`)
      else await api.post(`/emprestimos/${emprestimo.id}/${acao}`)
      notificar(opcoes.sucesso)
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Emprestimo>[] = [
    {
      titulo: 'Leitor e livro',
      conteudo: (emprestimo) => (
        <>
          <strong>{emprestimo.nomeLeitor ?? `Leitor #${emprestimo.leitorId}`}</strong>
          <span className="subtitulo-celula">{emprestimo.tituloLivro ?? `Exemplar #${emprestimo.exemplarId}`}</span>
        </>
      )
    },
    { titulo: 'Retirada', conteudo: (emprestimo) => formatarData(emprestimo.dataEmprestimo) },
    { titulo: 'Devolução prevista', conteudo: (emprestimo) => formatarData(emprestimo.dataDevolucaoPrevista) },
    {
      titulo: 'Situação',
      conteudo: (emprestimo) => {
        if (emprestimo.status === 'aberto' && emprestimo.diasAtraso > 0) {
          return <Etiqueta tom="perigo">{emprestimo.diasAtraso} dia(s) em atraso</Etiqueta>
        }
        return etiquetaStatus(emprestimo.status)
      }
    },
    {
      titulo: 'Renovações',
      conteudo: (emprestimo) => `${emprestimo.renovacoes} de 1`
    },
    {
      titulo: 'Multa',
      conteudo: (emprestimo) => emprestimo.valorMultaCentavos > 0 ? formatarDinheiro(emprestimo.valorMultaCentavos) : '—'
    },
    {
      titulo: 'Ações',
      conteudo: (emprestimo) => (
        <div className="acoes-linha">
          {emprestimo.status === 'aberto' ? (
            <>
              <Botao
                pequeno
                icone="refresh"
                onClick={() => { void executarAcao(emprestimo, 'renovacao') }}
                disabled={emprestimo.renovacoes >= 1}
              >
                Renovar
              </Botao>
              <Botao pequeno variante="primario" icone="check" onClick={() => { void executarAcao(emprestimo, 'devolucao') }}>
                Devolver
              </Botao>
              {usuario.perfil === 'ADMIN' ? (
                <Botao pequeno variante="perigo" icone="trash" onClick={() => { void executarAcao(emprestimo, 'cancelamento') }}>Cancelar</Botao>
              ) : null}
            </>
          ) : null}
          {exclusao.botao('emprestimos', emprestimo.id, `Empréstimo #${emprestimo.id}`, emprestimo.status !== 'aberto')}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo="Buscar empréstimos"
        descricao="Ativos e inativos aparecem por padrão. Filtre também por status, atraso ou vencimento próximo."
        acoes={<Botao variante="primario" icone="plus" onClick={() => setFormularioAberto(true)}>Registrar retirada</Botao>}
      >
        <div className="barra-filtros barra-filtros-larga">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Buscar por leitor ou livro" />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
          <CampoSelect
            rotulo="Status"
            valor={status}
            aoAlterar={setStatus}
            vazio="Todas"
            compacto
            opcoes={[
              { valor: 'aberto', rotulo: 'Em andamento' },
              { valor: 'devolvido', rotulo: 'Devolvidos' },
              { valor: 'cancelado', rotulo: 'Cancelados' }
            ]}
          />
          <CampoCheck rotulo="Somente atrasados" marcado={atrasados} aoAlterar={setAtrasados} />
          <CampoCheck rotulo="Vencendo em breve" marcado={vencendo} aoAlterar={setVencendo} />
        </div>
      </Painel>

      {formularioAberto ? (
        <Painel titulo="Registrar retirada" descricao="A API aplica o limite de exemplares e calcula o prazo.">
          <FormularioEmprestimo leitores={leitores.itens} exemplares={exemplares.itens} aoCancelar={() => setFormularioAberto(false)} />
        </Painel>
      ) : null}

      <Painel titulo="Empréstimos" descricao={`${lista.total ?? lista.itens.length} registro(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(emprestimo) => emprestimo.id} legenda="Empréstimos" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Reservas em ordem FIFO, com aviso do prazo de retirada. */
export function PaginaReservas(): ReactNode {
  const { api, usuario, notificar, confirmar, invalidar } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const somenteProprios = usuario.perfil === 'LEITOR'
  const busca = useBusca()
  const [livroId, setLivroId] = useState('')
  const [leitorId, setLeitorId] = useState('')
  const [status, setStatus] = useState('')
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [fila, setFila] = useState(false)
  const [formularioAberto, setFormularioAberto] = useState(false)
  const configuracoes = useRecurso<Configuracoes>('/configuracoes')
  const prazoHoras = configuracoes.dados?.prazoRetiradaHoras ?? 24

  const params = useMemo(() => ({
    livroId: livroId === '' ? undefined : livroId,
    leitorId: somenteProprios ? (usuario.leitorId ?? undefined) : leitorId === '' ? undefined : leitorId,
    situacao,
    status: status === '' ? undefined : status,
    fila: fila ? true : undefined,
    porPagina: 50
  }), [livroId, leitorId, situacao, status, fila, somenteProprios, usuario.leitorId])
  const caminho = somenteProprios && usuario.leitorId === null ? null : '/reservas'
  const lista = useLista<Reserva>(caminho, params)
  const livros = useLista<Livro>('/livros', { porPagina: 200 })
  const leitores = useLista<Leitor>(somenteProprios ? null : '/leitores', { porPagina: 200 })
  const editoras = useLista<Editora>('/editoras', { porPagina: 200 })

  const leitoresFormulario: Leitor[] = somenteProprios
    ? usuario.leitorId === null
      ? []
      : [{
          id: usuario.leitorId,
          nome: usuario.nome,
          cpfMascara: '',
          email: usuario.email,
          telefone: null,
          ativo: true,
          endereco: null,
          emprestimosAtivos: 0,
          reservasAtivas: 0,
          multaEmAbertoCentavos: 0,
          deletedAt: null,
          excluidoEm: null
        }]
    : leitores.itens

  const termo = busca.termoAplicado.toLocaleLowerCase('pt-BR')
  const filtradas = termo === ''
    ? lista.itens
    : lista.itens.filter((reserva) => `${reserva.tituloLivro ?? ''} ${reserva.nomeLeitor ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
  const ordenadas = [...filtradas].sort((a, b) => {
    const posicaoA = a.posicao ?? Number.MAX_SAFE_INTEGER
    const posicaoB = b.posicao ?? Number.MAX_SAFE_INTEGER
    return posicaoA - posicaoB || a.entradaEm.localeCompare(b.entradaEm) || a.id - b.id
  })

  async function retirar(reserva: Reserva): Promise<void> {
    const prazo = reserva.prazoRetiradaFim === null
      ? `Você terá ${prazoHoras} horas para retirar o livro após a confirmação.`
      : `Retirar até ${formatarDataHora(reserva.prazoRetiradaFim)}.`
    const aceito = await confirmar({
      titulo: 'Confirmar retirada da reserva',
      mensagem: 'Confirme que o leitor está retirando este exemplar. Um empréstimo será gerado automaticamente.',
      detalhes: [
        reserva.nomeLeitor === undefined ? `Leitor #${reserva.leitorId}` : `Leitor: ${reserva.nomeLeitor}`,
        reserva.tituloLivro === undefined ? `Livro #${reserva.livroId}` : `Livro: ${reserva.tituloLivro}`,
        prazo
      ],
      confirmarTexto: 'Confirmar retirada'
    })
    if (!aceito) return
    try {
      const resposta: unknown = await api.post(`/reservas/${reserva.id}/retirada`)
      const prazoDevolvido = textoEm(resposta, 'prazoRetiradaFim') ?? textoEm(resposta, 'dataDevolucaoPrevista')
      notificar(prazoDevolvido === undefined ? 'Retirada confirmada e empréstimo gerado.' : `Retirada confirmada. Devolução/retirada: ${formatarDataHora(prazoDevolvido)}.`)
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  async function cancelar(reserva: Reserva): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Cancelar reserva?',
      mensagem: 'A reserva sairá da fila e a posição dos demais leitores será atualizada.',
      detalhes: [reserva.tituloLivro ?? `Livro #${reserva.livroId}`],
      confirmarTexto: 'Cancelar reserva',
      perigo: true
    })
    if (!aceito) return
    try {
      await api.patch(`/reservas/${reserva.id}`, { status: 'cancelado' })
      notificar('Reserva cancelada com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Reserva>[] = [
    {
      titulo: 'Posição',
      conteudo: (reserva, indice) => <span className="numero-fila">{(reserva.posicao ?? indice + 1)}</span>
    },
    {
      titulo: 'Leitor',
      conteudo: (reserva) => <strong>{reserva.nomeLeitor ?? `Leitor #${reserva.leitorId}`}</strong>
    },
    {
      titulo: 'Livro',
      conteudo: (reserva) => <strong>{reserva.tituloLivro ?? `Livro #${reserva.livroId}`}</strong>
    },
    { titulo: 'Entrada na fila', conteudo: (reserva) => formatarData(reserva.entradaEm) },
    { titulo: 'Situação', conteudo: (reserva) => etiquetaStatus(reserva.status) },
    {
      titulo: 'Prazo de retirada',
      conteudo: (reserva) => reserva.prazoRetiradaFim === null ? '—' : formatarDataHora(reserva.prazoRetiradaFim)
    },
    {
      titulo: 'Ações',
      conteudo: (reserva) => (
        <div className="acoes-linha">
          {!somenteProprios && reserva.status === 'disponivel_para_retirada' ? (
            <Botao pequeno variante="primario" icone="check" onClick={() => { void retirar(reserva) }}>Retirar</Botao>
          ) : null}
          {['aguardando', 'disponivel_para_retirada'].includes(reserva.status) ? (
            <Botao pequeno variante={somenteProprios ? 'primario' : 'perigo'} icone="close" onClick={() => { void cancelar(reserva) }}>
              Cancelar
            </Botao>
          ) : null}
          {exclusao.botao('reservas', reserva.id, reserva.tituloLivro ?? `Reserva #${reserva.id}`, ['retirado', 'expirado', 'cancelado'].includes(reserva.status))}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo={somenteProprios ? 'Minhas reservas' : 'Reservas e fila de espera'}
        descricao={somenteProprios
          ? 'Acompanhe suas reservas e o prazo para retirada.'
          : 'A fila é exibida em ordem de chegada (FIFO).'}
        acoes={
          somenteProprios && usuario.leitorId === null
            ? undefined
            : <Botao variante="primario" icone="plus" onClick={() => setFormularioAberto(true)}>Nova reserva</Botao>
        }
      >
        {somenteProprios && usuario.leitorId === null
          ? <Aviso tom="atencao">Sua conta ainda não está vinculada a um leitor. Procure a biblioteca para regularizar.</Aviso>
          : null}
        {!somenteProprios ? (
          <div className="barra-filtros barra-filtros-larga">
            <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Buscar reservas" />
            <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
            <CampoSelect rotulo="Livro" valor={livroId} aoAlterar={setLivroId} vazio="Todos os livros" compacto opcoes={opcoesDe(livros.itens, (item) => String(item.id), (item) => item.titulo)} />
            <CampoSelect rotulo="Leitor" valor={leitorId} aoAlterar={setLeitorId} vazio="Todos os leitores" compacto opcoes={opcoesDe(leitores.itens, (item) => String(item.id), (item) => item.nome)} />
            <CampoSelect
              rotulo="Status da reserva"
              valor={status}
              aoAlterar={setStatus}
              vazio="Todas"
              compacto
              opcoes={[
                { valor: 'aguardando', rotulo: 'Na fila' },
                { valor: 'disponivel_para_retirada', rotulo: 'Prontas para retirada' },
                { valor: 'retirado', rotulo: 'Retiradas' },
                { valor: 'cancelado', rotulo: 'Canceladas' }
              ]}
            />
            <CampoCheck rotulo="Somente fila" marcado={fila} aoAlterar={setFila} />
          </div>
        ) : null}
      </Painel>

      {formularioAberto ? (
        <Painel titulo="Nova reserva" descricao="Livros emprestados entram na fila por ordem de chegada.">
          <FormularioReserva
            leitores={leitoresFormulario}
            livros={livros.itens}
            editoras={editoras.itens}
            prazoRetiradaHoras={prazoHoras}
            aoCancelar={() => setFormularioAberto(false)}
          />
        </Painel>
      ) : null}

      <Painel titulo="Reservas" descricao={`${ordenadas.length} reserva(s) encontrada(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={ordenadas.length === 0}>
          <Tabela colunas={colunas} itens={ordenadas} chave={(reserva) => reserva.id} legenda="Reservas em ordem de chegada" />
        </ConteudoLista>
        <p className="nota-rodape">
          <Icone nome="clock" />
          Quando o livro estiver disponível, a pessoa avisada tem {prazoHoras} horas para retirar o exemplar.
        </p>
      </Painel>
    </>
  )
}

/** Agendamentos próprios ou gerais, limitados a 3 dias pela política. */
export function PaginaAgendamentos(): ReactNode {
  const { api, usuario, notificar, confirmar, invalidar } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const somenteProprios = usuario.perfil === 'LEITOR'
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const configuracoes = useRecurso<Configuracoes>('/configuracoes')
  const diasMaximos = configuracoes.dados?.diasMaxAgendamento ?? 3
  const params = useMemo(() => ({
    leitorId: somenteProprios ? (usuario.leitorId ?? undefined) : undefined,
    situacao,
    porPagina: 50
  }), [somenteProprios, usuario.leitorId, situacao])
  const caminho = somenteProprios && usuario.leitorId === null ? null : '/agendamentos'
  const lista = useLista<Agendamento>(caminho, params)
  const exemplares = useLista<Exemplar>('/exemplares', { porPagina: 200 })
  const livros = useLista<Livro>('/livros', { porPagina: 200 })
  const editoras = useLista<Editora>('/editoras', { porPagina: 200 })
  const categorias = useLista<Categoria>('/categorias', { porPagina: 200 })
  const leitores = useLista<Leitor>(somenteProprios ? null : '/leitores', { porPagina: 200 })

  const leitoresFormulario: Leitor[] = somenteProprios
    ? usuario.leitorId === null
      ? []
      : [{
          id: usuario.leitorId,
          nome: usuario.nome,
          cpfMascara: '',
          email: usuario.email,
          telefone: null,
          ativo: true,
          endereco: null,
          emprestimosAtivos: 0,
          reservasAtivas: 0,
          multaEmAbertoCentavos: 0,
          deletedAt: null,
          excluidoEm: null
        }]
    : leitores.itens

  async function cancelar(agendamento: Agendamento): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Cancelar agendamento?',
      mensagem: 'O exemplar voltará a ficar disponível para outras pessoas.',
      detalhes: [
        agendamento.tituloLivro ?? `Exemplar #${agendamento.exemplarId}`,
        `Data: ${formatarData(agendamento.dataAgendada)}`
      ],
      confirmarTexto: 'Cancelar agendamento',
      perigo: true
    })
    if (!aceito) return
    try {
      await api.patch(`/agendamentos/${agendamento.id}`, { status: 'cancelado' })
      notificar('Agendamento cancelado com sucesso.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Agendamento>[] = [
    {
      titulo: 'Leitor',
      conteudo: (agendamento) => <strong>{agendamento.nomeLeitor ?? `Leitor #${agendamento.leitorId}`}</strong>
    },
    {
      titulo: 'Livro',
      conteudo: (agendamento) => (
        <>
          <strong>{agendamento.tituloLivro ?? `Exemplar #${agendamento.exemplarId}`}</strong>
          <span className="subtitulo-celula">Tombamento do exemplar #{agendamento.exemplarId}</span>
        </>
      )
    },
    { titulo: 'Data agendada', conteudo: (agendamento) => formatarData(agendamento.dataAgendada) },
    { titulo: 'Válido até', conteudo: (agendamento) => formatarData(agendamento.validadeAte) },
    { titulo: 'Situação', conteudo: (agendamento) => etiquetaStatus(agendamento.status) },
    {
      titulo: 'Ações',
      conteudo: (agendamento) => (
        <div className="acoes-linha">
          {agendamento.status === 'ativo' ? (
            <Botao pequeno variante={somenteProprios ? 'primario' : 'perigo'} icone="close" onClick={() => { void cancelar(agendamento) }}>Cancelar</Botao>
          ) : null}
          {exclusao.botao('agendamentos', agendamento.id, agendamento.tituloLivro ?? `Agendamento #${agendamento.id}`, agendamento.status !== 'ativo')}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel
        titulo={somenteProprios ? 'Meus agendamentos' : 'Agendamentos'}
        descricao={`Você pode agendar a retirada com até ${diasMaximos} dias de antecedência. Ativos e inativos aparecem por padrão.`}
        acoes={
          somenteProprios && usuario.leitorId === null
            ? undefined
            : <Botao variante="primario" icone="plus" onClick={() => setFormularioAberto(true)}>Novo agendamento</Botao>
        }
      >
        {somenteProprios && usuario.leitorId === null
          ? <Aviso tom="atencao">Sua conta ainda não está vinculada a um leitor. Procure a biblioteca para regularizar.</Aviso>
          : null}
        <div className="barra-filtros">
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
        </div>
      </Painel>

      {formularioAberto ? (
        <Painel titulo="Novo agendamento" descricao="Escolha um exemplar disponível e uma data dentro do prazo permitido.">
          <FormularioAgendamento
            leitores={leitoresFormulario}
            exemplares={exemplares.itens}
            livros={livros.itens}
            editoras={editoras.itens}
            categorias={categorias.itens}
            diasMaximos={diasMaximos}
            aoCancelar={() => setFormularioAberto(false)}
          />
        </Painel>
      ) : null}

      <Painel titulo="Agendamentos registrados" descricao={`${lista.total ?? lista.itens.length} agendamento(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(agendamento) => agendamento.id} legenda="Agendamentos" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Multas e registro de pagamentos. */
export function PaginaMultas(): ReactNode {
  const exclusao = useExclusaoFisica()
  const busca = useBusca()
  const [leitorId, setLeitorId] = useState('')
  const [status, setStatus] = useState('')
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [multaPagando, setMultaPagando] = useState<Multa | null>(null)
  const params = useMemo(() => ({
    leitorId: leitorId === '' ? undefined : leitorId,
    situacao,
    status: status === '' ? undefined : status,
    porPagina: 50
  }), [leitorId, situacao, status])
  const lista = useLista<Multa>('/multas', params)
  const pagamentos = useLista<PagamentoMulta>('/pagamentos-multa', { porPagina: 200 })
  const leitores = useLista<Leitor>('/leitores', { porPagina: 200 })

  const colunas: Coluna<Multa>[] = [
    {
      titulo: 'Leitor',
      conteudo: (multa) => (
        <>
          <strong>{multa.nomeLeitor ?? `Leitor #${multa.leitorId}`}</strong>
          <span className="subtitulo-celula">{multa.tituloLivro ?? `Empréstimo #${multa.emprestimoId}`}</span>
        </>
      )
    },
    { titulo: 'Dias de atraso', conteudo: (multa) => String(multa.diasAtraso) },
    { titulo: 'Valor', conteudo: (multa) => <strong>{formatarDinheiro(multa.valorCentavos)}</strong> },
    { titulo: 'Registrada em', conteudo: (multa) => formatarData(multa.registradaEm) },
    { titulo: 'Situação', conteudo: (multa) => etiquetaStatus(multa.status) },
    {
      titulo: 'Ações',
      conteudo: (multa) => (
        <div className="acoes-linha">
          {multa.status === 'pendente' ? (
            <Botao pequeno variante="primario" icone="money" onClick={() => setMultaPagando(multa)}>Registrar pagamento</Botao>
          ) : null}
          {exclusao.botao('multas', multa.id, `Multa #${multa.id}`, multa.status !== 'pendente')}
        </div>
      )
    }
  ]

  const pendentes = lista.itens.filter((multa) => multa.status === 'pendente')
  const totalPendente = pendentes.reduce((total, multa) => total + multa.valorCentavos, 0)
  const totalPago = pagamentos.itens.reduce((total, pagamento) => total + pagamento.valorCentavos, 0)

  return (
    <>
      <section className="resumo-financeiro" aria-label="Resumo de multas">
        <div>
          <span>Em aberto</span>
          <strong>{formatarDinheiro(totalPendente)}</strong>
          <small>{pendentes.length} cobrança(s) pendente(s)</small>
        </div>
        <div>
          <span>Pagamentos registrados</span>
          <strong>{formatarDinheiro(totalPago)}</strong>
          <small>{pagamentos.itens.length} pagamento(s)</small>
        </div>
      </section>

      <Painel titulo="Buscar multas" descricao="Ativos e inativos aparecem por padrão. Filtre por leitor ou situação para encontrar uma cobrança.">
        <div className="barra-filtros barra-filtros-larga">
          <BarraBusca valor={busca.termo} aoAlterar={busca.definirTermo} rotulo="Buscar por leitor ou livro" />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
          <CampoSelect rotulo="Leitor" valor={leitorId} aoAlterar={setLeitorId} vazio="Todos os leitores" compacto opcoes={opcoesDe(leitores.itens, (item) => String(item.id), (item) => item.nome)} />
          <CampoSelect
            rotulo="Status da multa"
            valor={status}
            aoAlterar={setStatus}
            vazio="Todas"
            compacto
            opcoes={[
              { valor: 'pendente', rotulo: 'Pendentes' },
              { valor: 'paga', rotulo: 'Pagas' },
              { valor: 'perdoada', rotulo: 'Perdoadas' },
              { valor: 'estornada', rotulo: 'Estornadas' }
            ]}
          />
        </div>
      </Painel>

      {multaPagando === null ? null : (
        <Painel titulo="Pagamento de multa" descricao="O valor é enviado à API em centavos.">
          <FormularioPagamento multa={multaPagando} aoCancelar={() => setMultaPagando(null)} />
        </Painel>
      )}

      <Painel titulo="Multas registradas" descricao={`${lista.total ?? lista.itens.length} multa(s).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(multa) => multa.id} legenda="Multas registradas" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Configurações da política, somente ADMIN. */
export function PaginaConfiguracoes(): ReactNode {
  const configuracoes = useRecurso<Configuracoes>('/configuracoes')
  const auditoria = useLista<unknown>('/auditoria-configuracoes', { porPagina: 20 })
  const [editando, setEditando] = useState(false)

  const colunas: Coluna<unknown>[] = [
    { titulo: 'Registro', conteudo: (item) => <span className="mono">#{numeroEm(item, 'id') ?? '—'}</span> },
    { titulo: 'Data', conteudo: (item) => formatarDataHora(textoEm(item, 'criadoEm') ?? textoEm(item, 'registradoEm')) },
    { titulo: 'Usuário', conteudo: (item) => textoEm(item, 'nomeUsuario') ?? textoEm(item, 'usuarioNome') ?? (numeroEm(item, 'usuarioId') === undefined ? '—' : `Usuário #${numeroEm(item, 'usuarioId')}`) },
    { titulo: 'Resumo', conteudo: (item) => textoEm(item, 'descricao') ?? textoEm(item, 'motivo') ?? 'Alteração registrada' }
  ]

  return (
    <>
      {configuracoes.carregando ? <Carregando rotulo="Carregando configurações..." /> : null}
      {configuracoes.erro !== null ? <ErroCarregamento mensagem={configuracoes.erro} aoTentar={configuracoes.recarregar} /> : null}
      {configuracoes.dados === null ? null : (
        <Painel
          titulo="Política vigente"
          descricao="Estas regras orientam prazos, limites e multas da biblioteca."
          acoes={editando ? undefined : <Botao variante="primario" icone="edit" onClick={() => setEditando(true)}>Editar regras</Botao>}
        >
          {editando ? (
            <FormularioConfiguracoes configuracoes={configuracoes.dados} aoCancelar={() => setEditando(false)} />
          ) : (
            <dl className="lista-configuracoes">
              <div><dt>Prazo de empréstimo</dt><dd>{configuracoes.dados.prazoEmprestimoDias} dias</dd></div>
              <div><dt>Limite por leitor</dt><dd>{configuracoes.dados.limiteExemplaresPorLeitor} exemplares</dd></div>
              <div><dt>Prazo de renovação</dt><dd>{configuracoes.dados.prazoRenovacaoDias} dias</dd></div>
              <div><dt>Limite de reservas ativas</dt><dd>{configuracoes.dados.limiteReservasAtivas}</dd></div>
              <div><dt>Prazo para retirada</dt><dd>{configuracoes.dados.prazoRetiradaHoras} horas</dd></div>
              <div><dt>Antecedência do aviso</dt><dd>{configuracoes.dados.antecedenciaAvisoDias} dias</dd></div>
              <div><dt>Hora do aviso de atraso</dt><dd>{configuracoes.dados.horaAvisoAtraso}</dd></div>
              <div><dt>Multa diária</dt><dd>{formatarDinheiro(configuracoes.dados.valorDiarioMultaCentavos)}</dd></div>
              <div><dt>Teto da multa</dt><dd>{formatarDinheiro(configuracoes.dados.tetoMultaCentavos)}</dd></div>
              <div><dt>Dias máximos de agendamento</dt><dd>{configuracoes.dados.diasMaxAgendamento}</dd></div>
              <div><dt>Fuso horário</dt><dd>{configuracoes.dados.timezone}</dd></div>
            </dl>
          )}
        </Painel>
      )}

      <Painel titulo="Histórico de alterações" descricao="Auditoria das mudanças feitas nas regras.">
        <ConteudoLista carregando={auditoria.carregando} erro={auditoria.erro} aoTentar={auditoria.recarregar} vazio={auditoria.itens.length === 0}>
          <Tabela colunas={colunas} itens={auditoria.itens} chave={(item, indice) => numeroEm(item, 'id') ?? indice} legenda="Auditoria de configurações" />
        </ConteudoLista>
      </Painel>
    </>
  )
}

/** Histórico de notificações enviadas pela API. */
export function PaginaNotificacoes(): ReactNode {
  const { api, usuario, notificar, confirmar, invalidar } = useAplicacao()
  const exclusao = useExclusaoFisica()
  const [leitorId, setLeitorId] = useState('')
  const [status, setStatus] = useState('')
  const [situacao, setSituacao] = useState<SituacaoRegistro>('todos')
  const [tipo, setTipo] = useState('')
  const params = useMemo(() => ({
    leitorId: leitorId === '' ? undefined : leitorId,
    situacao,
    status: status === '' ? undefined : status,
    tipo: tipo === '' ? undefined : tipo,
    porPagina: 50
  }), [leitorId, situacao, status, tipo])
  const lista = useLista<Notificacao>('/notificacoes', params)
  const leitores = useLista<Leitor>('/leitores', { porPagina: 200 })

  async function reenviar(notificacao: Notificacao): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Reenviar notificação?',
      mensagem: 'O envio será tentado novamente pela API.',
      detalhes: [`Notificação #${notificacao.id}`, `Destinatário: ${notificacao.destinatarioMascara}`],
      confirmarTexto: 'Reenviar'
    })
    if (!aceito) return
    try {
      await api.patch(`/notificacoes/${notificacao.id}`, { status: 'pendente' })
      notificar('Notificação marcada para reenvio.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  async function cancelar(notificacao: Notificacao): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Cancelar notificação?',
      mensagem: 'O envio será cancelado e registrado como falha.',
      detalhes: [`Notificação #${notificacao.id}`],
      confirmarTexto: 'Cancelar',
      perigo: true
    })
    if (!aceito) return
    try {
      await api.del(`/notificacoes/${notificacao.id}`)
      notificar('Notificação cancelada.')
      invalidar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    }
  }

  const colunas: Coluna<Notificacao>[] = [
    { titulo: 'ID', conteudo: (notificacao) => <span className="mono">#{notificacao.id}</span> },
    {
      titulo: 'Tipo',
      conteudo: (notificacao) => rotuloStatus(notificacao.tipo) === notificacao.tipo
        ? notificacao.tipo.replaceAll('_', ' ')
        : rotuloStatus(notificacao.tipo)
    },
    {
      titulo: 'Canal',
      conteudo: (notificacao) => <Etiqueta tom="neutro">{notificacao.canal === 'email' ? 'E-mail' : 'WhatsApp'}</Etiqueta>
    },
    {
      titulo: 'Destinatário',
      conteudo: (notificacao) => <span className="mono">{notificacao.destinatarioMascara}</span>
    },
    { titulo: 'Situação', conteudo: (notificacao) => etiquetaStatus(notificacao.status) },
    { titulo: 'Criada em', conteudo: (notificacao) => formatarDataHora(notificacao.criadoEm) },
    {
      titulo: 'Tentativas',
      conteudo: (notificacao) => String(notificacao.tentativas)
    },
    {
      titulo: 'Ações',
      conteudo: (notificacao) => (
        <div className="acoes-linha">
          {usuario.perfil === 'ADMIN' ? (
            <>
              <Botao pequeno icone="refresh" onClick={() => { void reenviar(notificacao) }}>Reenviar</Botao>
              <Botao pequeno variante="perigo" icone="close" onClick={() => { void cancelar(notificacao) }}>Cancelar</Botao>
            </>
          ) : <span className="subtitulo-celula">Somente leitura</span>}
          {exclusao.botao('notificacoes', notificacao.id, `Notificação #${notificacao.id}`, notificacao.status !== 'pendente')}
        </div>
      )
    }
  ]

  return (
    <>
      <Painel titulo="Histórico de notificações" descricao="A API registra cada aviso enviado aos leitores. Ativos e inativos aparecem por padrão.">
        <div className="barra-filtros barra-filtros-larga">
          <CampoSelect rotulo="Leitor" valor={leitorId} aoAlterar={setLeitorId} vazio="Todos os leitores" compacto opcoes={opcoesDe(leitores.itens, (item) => String(item.id), (item) => item.nome)} />
          <FiltroSituacao valor={situacao} aoAlterar={setSituacao} />
          <CampoSelect
            rotulo="Status da notificação"
            valor={status}
            aoAlterar={setStatus}
            vazio="Todas"
            compacto
            opcoes={[
              { valor: 'pendente', rotulo: 'Pendentes' },
              { valor: 'enviada', rotulo: 'Enviadas' },
              { valor: 'falhou', rotulo: 'Falhas' },
              { valor: 'reenviada', rotulo: 'Reenviadas' }
            ]}
          />
          <CampoSelect
            rotulo="Tipo"
            valor={tipo}
            aoAlterar={setTipo}
            vazio="Todos"
            compacto
            opcoes={[
              { valor: 'ativacao', rotulo: 'Ativação' },
              { valor: 'lembrete_vencimento', rotulo: 'Lembrete de vencimento' },
              { valor: 'atraso', rotulo: 'Atraso' },
              { valor: 'reserva_disponivel', rotulo: 'Reserva disponível' },
              { valor: 'multa', rotulo: 'Multa' },
              { valor: 'expiracao_reserva', rotulo: 'Expiração de reserva' }
            ]}
          />
        </div>
      </Painel>

      <Painel titulo="Notificações" descricao={`${lista.total ?? lista.itens.length} notificação(ões).`}>
        <ConteudoLista carregando={lista.carregando} erro={lista.erro} aoTentar={lista.recarregar} vazio={lista.itens.length === 0}>
          <Tabela colunas={colunas} itens={lista.itens} chave={(notificacao) => notificacao.id} legenda="Histórico de notificações" />
        </ConteudoLista>
      </Painel>
    </>
  )
}
