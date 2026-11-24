import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type {
  Autor,
  Categoria,
  Configuracoes,
  Editora,
  Emprestimo,
  EnderecoConsultado,
  Exemplar,
  Leitor,
  Livro,
  LivroSugerido,
  Multa,
  Perfil,
  Reserva,
  Usuario
} from '@biblioteca/shared'
import { mensagemErro } from './api'
import { Aviso, Botao, CampoArea, CampoCheck, CampoSelect, CampoTexto, CapaLivro, DialogoCatalogoLivros, DialogoLivro, type OpcaoCampo } from './componentes'
import { useAplicacao } from './contexto'
import {
  formatarDataHora,
  formatarTelefone,
  hojeISO,
  mascararCep,
  mascararCpf,
  normalizarTelefone,
  numeroEm,
  opcional,
  somarDias,
  somenteDigitos,
  textoEm
} from './tipos'

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function idPorNome<T extends { id: number; nome: string }>(itens: readonly T[], nome: string | null): string {
  if (nome === null || nome.trim() === '') return ''
  const encontrado = itens.find((item) => normalizar(item.nome) === normalizar(nome))
  return encontrado === undefined ? '' : String(encontrado.id)
}

function idsPorNomes<T extends { id: number; nome: string }>(itens: readonly T[], nomes: readonly string[]): number[] {
  return nomes
    .map((nome) => itens.find((item) => normalizar(item.nome) === normalizar(nome))?.id)
    .filter((id): id is number => id !== undefined)
}

interface EstadoLivro {
  titulo: string
  subtitulo: string
  isbn10: string
  isbn13: string
  editoraId: string
  anoPublicacao: string
  descricaoCurta: string
  capaUrl: string
  idioma: string
  autoresIds: number[]
  categoriasIds: number[]
  quantidadeExemplares: string
}

function estadoInicialLivro(livro: Livro | null): EstadoLivro {
  return {
    titulo: livro?.titulo ?? '',
    subtitulo: livro?.subtitulo ?? '',
    isbn10: livro?.isbn10 ?? '',
    isbn13: livro?.isbn13 ?? '',
    editoraId: livro?.editoraId === null || livro?.editoraId === undefined ? '' : String(livro.editoraId),
    anoPublicacao: livro?.anoPublicacao === null || livro?.anoPublicacao === undefined ? '' : String(livro.anoPublicacao),
    descricaoCurta: livro?.descricaoCurta ?? '',
    capaUrl: livro?.capaUrl ?? '',
    idioma: livro?.idioma ?? 'pt-BR',
    autoresIds: livro?.autores.map((autor) => autor.id) ?? [],
    categoriasIds: livro?.categorias.map((categoria) => categoria.id) ?? [],
    quantidadeExemplares: String(livro?.totalExemplares ?? 1)
  }
}

export function FormularioLivro({
  autores,
  editoras,
  categorias,
  livro,
  aoCancelar,
  focoImportacao = false
}: {
  autores: readonly Autor[]
  editoras: readonly Editora[]
  categorias: readonly Categoria[]
  livro: Livro | null
  aoCancelar: () => void
  focoImportacao?: boolean
}): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const [estado, setEstado] = useState<EstadoLivro>(() => estadoInicialLivro(livro))
  const [consulta, setConsulta] = useState(livro?.titulo ?? '')
  const [sugestoes, setSugestoes] = useState<LivroSugerido[] | null>(null)
  const [erroConsulta, setErroConsulta] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [importando, setImportando] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const idAutores = useId()
  const idCategorias = useId()

  function alterar<K extends keyof EstadoLivro>(chave: K, valor: EstadoLivro[K]): void {
    setEstado((atual) => ({ ...atual, [chave]: valor }))
  }

  function alterarMulti(evento: ChangeEvent<HTMLSelectElement>, chave: 'autoresIds' | 'categoriasIds'): void {
    const selecionados = Array.from(evento.currentTarget.selectedOptions)
      .map((opcao) => Number(opcao.value))
      .filter((valor) => Number.isInteger(valor))
    alterar(chave, selecionados)
  }

  async function buscarDados(): Promise<void> {
    const termo = consulta.trim()
    if (termo.length < 2) {
      notificar('Digite ao menos 2 caracteres para buscar o livro.', 'erro')
      return
    }
    setBuscando(true)
    setErroConsulta(null)
    try {
      const resposta = await api.get<{ itens: LivroSugerido[] }>('/consulta/livros', { q: termo, limite: 6 })
      setSugestoes(Array.isArray(resposta.itens) ? resposta.itens : [])
    } catch (erroCapturado) {
      setSugestoes(null)
      setErroConsulta(mensagemErro(erroCapturado))
    } finally {
      setBuscando(false)
    }
  }

  async function usarSugestao(sugestao: LivroSugerido): Promise<void> {
    const detalhes = [
      `Título: ${sugestao.titulo}`,
      `Autores: ${sugestao.autores.length > 0 ? sugestao.autores.join(', ') : 'não informados'}`,
      `Editora: ${sugestao.editora ?? 'não informada'}`,
      `Ano: ${sugestao.anoPublicacao === null ? 'não informado' : String(sugestao.anoPublicacao)}`,
      `ISBN: ${sugestao.isbn13 ?? sugestao.isbn10 ?? 'não informado'}`
    ]
    const aceito = await confirmar({
      titulo: 'Confirmar dados encontrados',
      mensagem: 'Encontramos estas informações na consulta automática. Deseja preenchê-las no formulário? Revise antes de salvar.',
      detalhes,
      imagemUrl: sugestao.capaUrl,
      imagemTitulo: sugestao.titulo,
      confirmarTexto: 'Usar estes dados'
    })
    if (!aceito) return

    setEstado((atual) => ({
      ...atual,
      titulo: sugestao.titulo,
      subtitulo: atual.subtitulo,
      isbn10: sugestao.isbn10 ?? atual.isbn10,
      isbn13: sugestao.isbn13 ?? atual.isbn13,
      editoraId: idPorNome(editoras, sugestao.editora) || atual.editoraId,
      anoPublicacao: sugestao.anoPublicacao === null ? atual.anoPublicacao : String(sugestao.anoPublicacao),
      descricaoCurta: sugestao.descricaoCurta ?? atual.descricaoCurta,
      capaUrl: sugestao.capaUrl ?? atual.capaUrl,
      idioma: atual.idioma === '' ? 'pt-BR' : atual.idioma,
      autoresIds: idsPorNomes(autores, sugestao.autores).length > 0 ? idsPorNomes(autores, sugestao.autores) : atual.autoresIds
    }))
    setConsulta(sugestao.titulo)
    setSugestoes(null)
    notificar('Dados preenchidos. Confira os campos antes de salvar.', 'info')
  }

  async function importarSugestao(sugestao: LivroSugerido, indice: number): Promise<void> {
    const aceito = await confirmar({
      titulo: 'Importar livro para o acervo?',
      mensagem: 'Os metadados encontrados na API serão gravados no catálogo local. Revise o título e o ISBN antes de continuar.',
      detalhes: [
        `Título: ${sugestao.titulo}${sugestao.subtitulo === null || sugestao.subtitulo === undefined ? '' : ` — ${sugestao.subtitulo}`}`,
        `Autores: ${sugestao.autores.length > 0 ? sugestao.autores.join(', ') : 'não informados'}`,
        `Editora: ${sugestao.editora ?? 'não informada'}`,
        `ISBN: ${sugestao.isbn13 ?? sugestao.isbn10 ?? 'não informado'}`
      ],
      imagemUrl: sugestao.capaUrl,
      imagemTitulo: sugestao.titulo,
      confirmarTexto: 'Importar agora'
    })
    if (!aceito) return

    setImportando(indice)
    try {
      const resultado = await api.importarLivro(sugestao)
      invalidar()
      setSugestoes(null)
      if (resultado.jaExistia) {
        notificar('Este livro já estava no acervo. O registro existente foi reaproveitado.', 'info')
      } else {
        notificar(
          `Livro importado: ${resultado.autoresCriados} autor(es), ${resultado.categoriasCriadas} categoria(s) e editora ${resultado.editoraCriada ? 'criada' : 'reaproveitada'}.`
        )
      }
      if (livro === null) aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setImportando(null)
    }
  }

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const titulo = estado.titulo.trim()
    if (titulo === '') {
      notificar('Informe o título do livro antes de salvar.', 'erro')
      return
    }
    const anoTexto = estado.anoPublicacao.trim()
    if (anoTexto !== '' && !/^\d{4}$/.test(anoTexto)) {
      notificar('O ano de publicação deve ter 4 números.', 'erro')
      return
    }
    const quantidadeTexto = estado.quantidadeExemplares.trim()
    const quantidade = Number(quantidadeTexto)
    if (quantidadeTexto === '' || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100) {
      notificar('Informe a quantidade de exemplares entre 0 e 100.', 'erro')
      return
    }

    const editoraNome = editoras.find((editora) => String(editora.id) === estado.editoraId)?.nome ?? null
    const confirmado = await confirmar({
      titulo: livro === null ? 'Salvar novo livro?' : 'Salvar alterações do livro?',
      mensagem: 'Confira os dados abaixo. Nada será salvo antes da sua confirmação.',
      detalhes: [
        `Título: ${titulo}`,
        `Exemplares: ${quantidade}`,
        estado.isbn13.trim() !== '' ? `ISBN: ${estado.isbn13.trim()}` : estado.isbn10.trim() !== '' ? `ISBN: ${estado.isbn10.trim()}` : 'ISBN: não informado',
        editoraNome === null ? 'Editora: não informada' : `Editora: ${editoraNome}`,
        `Autores vinculados: ${estado.autoresIds.length}`,
        `Categorias vinculadas: ${estado.categoriasIds.length}`
      ],
      imagemUrl: estado.capaUrl,
      imagemTitulo: titulo,
      confirmarTexto: 'Salvar livro'
    })
    if (!confirmado) return

    const corpo = {
      titulo,
      subtitulo: opcional(estado.subtitulo),
      isbn10: opcional(estado.isbn10),
      isbn13: opcional(estado.isbn13),
      editoraId: estado.editoraId === '' ? undefined : Number(estado.editoraId),
      anoPublicacao: anoTexto === '' ? undefined : Number(anoTexto),
      descricaoCurta: opcional(estado.descricaoCurta),
      capaUrl: opcional(estado.capaUrl),
      idioma: opcional(estado.idioma) ?? 'pt-BR',
      autoresIds: estado.autoresIds,
      categoriasIds: estado.categoriasIds,
      quantidadeExemplares: quantidade
    }

    setSalvando(true)
    try {
      if (livro === null) {
        await api.post('/livros', corpo)
        notificar('Livro cadastrado no acervo com sucesso.')
      } else {
        await api.patch(`/livros/${livro.id}`, corpo)
        notificar('Dados do livro atualizados com sucesso.')
      }
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
      <section className="consulta-bloco" aria-labelledby="consulta-titulo">
        <h3 id="consulta-titulo">Importar livro por metadados</h3>
        <p>Digite o título ou ISBN. A consulta usa o Google Books e permite gravar a sugestão diretamente no acervo.</p>
        <div className="consulta-linha">
          <CampoTexto
            rotulo="Título ou ISBN para consulta"
            valor={consulta}
            aoAlterar={setConsulta}
            placeholder="Ex.: O pequeno príncipe"
            compacto
            autoFocus={focoImportacao}
          />
          <Botao icone="search" onClick={() => { void buscarDados() }} carregando={buscando}>
            Buscar dados do livro
          </Botao>
        </div>
        {erroConsulta === null ? null : <Aviso tom="erro">{erroConsulta}</Aviso>}
        {sugestoes === null ? null : sugestoes.length === 0 ? (
          <Aviso tom="info">Nenhuma sugestão encontrada. Você pode preencher os campos manualmente.</Aviso>
        ) : (
          <ul className="lista-sugestoes">
            {sugestoes.map((sugestao, indice) => (
              <li key={`${sugestao.titulo}-${sugestao.isbn13 ?? sugestao.isbn10 ?? ''}-${indice}`}>
                <CapaLivro url={sugestao.capaUrl} titulo={sugestao.titulo} className="capa-sugestao" />
                <div className="sugestao-dados">
                  <strong>{sugestao.titulo}</strong>
                  <span>{sugestao.autores.join(', ') || 'Autor não informado'}</span>
                  <small>
                    {sugestao.editora ?? 'Editora não informada'}
                    {sugestao.anoPublicacao === null ? '' : ` · ${sugestao.anoPublicacao}`}
                    {` · ${sugestao.fonte === 'google-books' ? 'Google Books' : 'Open Library'}`}
                  </small>
                </div>
                <div className="acoes-sugestao">
                  <Botao pequeno icone="check" onClick={() => { void usarSugestao(sugestao) }}>
                    Conferir e usar
                  </Botao>
                  <Botao
                    pequeno
                    variante="claro"
                    icone="package"
                    carregando={importando === indice}
                    onClick={() => { void importarSugestao(sugestao, indice) }}
                  >
                    Importar para o acervo
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h3 className="formulario-titulo">{livro === null ? 'Dados do novo livro' : 'Dados do livro'}</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Título" nome="titulo" valor={estado.titulo} aoAlterar={(valor) => alterar('titulo', valor)} obrigatorio placeholder="Título da obra" />
        <CampoTexto rotulo="Subtítulo" nome="subtitulo" valor={estado.subtitulo} aoAlterar={(valor) => alterar('subtitulo', valor)} placeholder="Opcional" />
        <CampoTexto rotulo="ISBN-10" nome="isbn10" valor={estado.isbn10} aoAlterar={(valor) => alterar('isbn10', valor)} inputMode="numeric" placeholder="10 números" />
        <CampoTexto rotulo="ISBN-13" nome="isbn13" valor={estado.isbn13} aoAlterar={(valor) => alterar('isbn13', valor)} inputMode="numeric" placeholder="13 números" />
        <CampoSelect
          rotulo="Editora"
          valor={estado.editoraId}
          aoAlterar={(valor) => alterar('editoraId', valor)}
          vazio="Selecione uma editora"
          opcoes={editoras.map((editora) => ({ valor: String(editora.id), rotulo: editora.nome }))}
        />
        <CampoTexto rotulo="Ano de publicação" nome="anoPublicacao" valor={estado.anoPublicacao} aoAlterar={(valor) => alterar('anoPublicacao', valor)} inputMode="numeric" placeholder="Ex.: 2024" />
        <CampoTexto rotulo="Quantidade de exemplares" nome="quantidadeExemplares" valor={estado.quantidadeExemplares} aoAlterar={(valor) => alterar('quantidadeExemplares', valor)} tipo="number" min={0} max={100} obrigatorio />
        <CampoTexto rotulo="Idioma" nome="idioma" valor={estado.idioma} aoAlterar={(valor) => alterar('idioma', valor)} placeholder="Ex.: pt-BR" />
        <CampoTexto rotulo="URL da capa" nome="capaUrl" valor={estado.capaUrl} aoAlterar={(valor) => alterar('capaUrl', valor)} tipo="url" placeholder="https://..." />
        <div className="campo">
          <label htmlFor={idAutores}>Autores</label>
          <select
            id={idAutores}
            multiple
            size={4}
            value={estado.autoresIds.map(String)}
            onChange={(evento) => alterarMulti(evento, 'autoresIds')}
          >
            {autores.map((autor) => <option key={autor.id} value={autor.id}>{autor.nome}</option>)}
          </select>
          <small>Use Ctrl (ou Cmd) para selecionar mais de um autor.</small>
        </div>
        <div className="campo">
          <label htmlFor={idCategorias}>Categorias</label>
          <select
            id={idCategorias}
            multiple
            size={4}
            value={estado.categoriasIds.map(String)}
            onChange={(evento) => alterarMulti(evento, 'categoriasIds')}
          >
            {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
          </select>
          <small>Use Ctrl (ou Cmd) para selecionar mais de uma categoria.</small>
        </div>
        <CampoArea rotulo="Descrição curta" valor={estado.descricaoCurta} aoAlterar={(valor) => alterar('descricaoCurta', valor)} placeholder="Uma breve descrição da obra" />
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">
          {livro === null ? 'Salvar no acervo' : 'Salvar alterações'}
        </Botao>
      </div>
    </form>
  )
}

export function FormularioEntidadeSimples({
  nomeEntidade,
  caminho,
  valorInicial,
  aoCancelar
}: {
  nomeEntidade: string
  caminho: string
  valorInicial: { id: number; nome: string } | null
  aoCancelar: () => void
}): ReactNode {
  const { api, notificar, invalidar } = useAplicacao()
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (nome.trim() === '') {
      notificar(`Informe o nome da ${nomeEntidade.toLowerCase()}.`, 'erro')
      return
    }
    setSalvando(true)
    try {
      if (valorInicial === null) {
        await api.post(caminho, { nome: nome.trim() })
        notificar(`${nomeEntidade} cadastrado com sucesso.`)
      } else {
        await api.patch(`${caminho}/${valorInicial.id}`, { nome: nome.trim() })
        notificar(`${nomeEntidade} atualizado com sucesso.`)
      }
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario formulario-simples" onSubmit={(evento) => { void salvar(evento) }}>
      <CampoTexto
        rotulo={`Nome da ${nomeEntidade.toLowerCase()}`}
        valor={nome}
        aoAlterar={setNome}
        obrigatorio
        placeholder={`Ex.: ${nomeEntidade} da comunidade`}
      />
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Salvar</Botao>
      </div>
    </form>
  )
}

interface EstadoLeitor {
  nome: string
  cpf: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  ativo: boolean
}

function estadoInicialLeitor(leitor: Leitor | null): EstadoLeitor {
  const endereco = leitor?.endereco ?? null
  return {
    nome: leitor?.nome ?? '',
    cpf: leitor?.cpfMascara ?? '',
    email: leitor?.email ?? '',
    telefone: leitor?.telefone ?? '',
    cep: endereco?.cep ?? '',
    logradouro: endereco?.logradouro ?? '',
    numero: endereco?.numero ?? '',
    complemento: endereco?.complemento ?? '',
    bairro: endereco?.bairro ?? '',
    cidade: endereco?.cidade ?? '',
    uf: endereco?.uf ?? '',
    ativo: leitor?.ativo ?? true
  }
}

export function FormularioLeitor({ leitor, aoCancelar }: { leitor: Leitor | null; aoCancelar: () => void }): ReactNode {
  const { api, notificar, invalidar } = useAplicacao()
  const [estado, setEstado] = useState<EstadoLeitor>(() => estadoInicialLeitor(leitor))
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [salvando, setSalvando] = useState(false)

  function alterar<K extends keyof EstadoLeitor>(chave: K, valor: EstadoLeitor[K]): void {
    setEstado((atual) => ({ ...atual, [chave]: valor }))
  }

  async function buscarCep(silencioso = false): Promise<void> {
    const cep = somenteDigitos(estado.cep)
    if (cep.length !== 8) {
      if (!silencioso) notificar('Informe um CEP com 8 números para buscar o endereço.', 'erro')
      return
    }
    setBuscandoCep(true)
    try {
      const endereco = await api.get<EnderecoConsultado>('/consulta/cep', { cep })
      setEstado((atual) => ({
        ...atual,
        cep: mascararCep(endereco.cep || cep),
        logradouro: endereco.logradouro ?? '',
        bairro: endereco.bairro ?? '',
        cidade: endereco.cidade ?? '',
        uf: endereco.uf ?? ''
      }))
      if (!silencioso) notificar('Endereço preenchido. Complete o número e o complemento.', 'sucesso')
    } catch (erroCapturado) {
      if (!silencioso) notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setBuscandoCep(false)
    }
  }

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (estado.nome.trim().length < 3) {
      notificar('Informe o nome completo do leitor.', 'erro')
      return
    }
    const cpfDigitos = somenteDigitos(estado.cpf)
    if (leitor === null && cpfDigitos.length !== 11) {
      notificar('Informe um CPF com 11 números.', 'erro')
      return
    }
    const cepDigitos = somenteDigitos(estado.cep)
    if (cepDigitos !== '' && cepDigitos.length !== 8) {
      notificar('O CEP deve ter 8 números.', 'erro')
      return
    }

    const endereco = {
      cep: cepDigitos === '' ? undefined : cepDigitos,
      logradouro: opcional(estado.logradouro),
      numero: opcional(estado.numero),
      complemento: opcional(estado.complemento),
      bairro: opcional(estado.bairro),
      cidade: opcional(estado.cidade),
      uf: opcional(estado.uf)
    }
    const corpo = leitor === null
      ? {
          nome: estado.nome.trim(),
          cpf: cpfDigitos,
          email: opcional(estado.email),
          telefone: normalizarTelefone(estado.telefone),
          ...endereco
        }
      : {
          nome: estado.nome.trim(),
          email: opcional(estado.email),
          telefone: normalizarTelefone(estado.telefone),
          ativo: estado.ativo,
          ...endereco
        }

    setSalvando(true)
    try {
      if (leitor === null) {
        await api.post('/leitores', corpo)
        notificar('Leitor cadastrado com sucesso.')
      } else {
        await api.patch(`/leitores/${leitor.id}`, corpo)
        notificar('Cadastro do leitor atualizado.')
      }
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
      <h3 className="formulario-titulo">{leitor === null ? 'Novo leitor' : 'Editar leitor'}</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Nome completo" valor={estado.nome} aoAlterar={(valor) => alterar('nome', valor)} obrigatorio placeholder="Nome e sobrenome" />
        <CampoTexto
          rotulo="CPF"
          valor={estado.cpf}
          aoAlterar={(valor) => alterar('cpf', mascararCpf(valor))}
          obrigatorio={leitor === null}
          desabilitado={leitor !== null}
          inputMode="numeric"
          placeholder="000.000.000-00"
          ajuda={leitor === null ? 'Somente os números são enviados à API.' : 'O CPF não pode ser alterado.'}
        />
        <CampoTexto rotulo="E-mail" valor={estado.email} aoAlterar={(valor) => alterar('email', valor)} tipo="email" placeholder="nome@email.com" />
        <CampoTexto
          rotulo="Telefone"
          valor={estado.telefone}
          aoAlterar={(valor) => alterar('telefone', formatarTelefone(valor))}
          tipo="tel"
          obrigatorio
          placeholder="+55 (11) 99999-8888"
          ajuda="O +55 é adicionado automaticamente."
        />
      </div>

      <h3 className="formulario-titulo">Endereço</h3>
      <div className="formulario-grade">
        <div className="campo">
          <CampoTexto
            rotulo="CEP"
            valor={estado.cep}
            aoAlterar={(valor) => alterar('cep', mascararCep(valor))}
            aoPerderFoco={() => { void buscarCep(true) }}
            inputMode="numeric"
            placeholder="00000-000"
          />
          <Botao pequeno icone="search" className="botao-cep" onClick={() => { void buscarCep() }} carregando={buscandoCep}>
            Buscar endereço
          </Botao>
        </div>
        <CampoTexto rotulo="Logradouro" valor={estado.logradouro} aoAlterar={(valor) => alterar('logradouro', valor)} placeholder="Rua, avenida..." />
        <CampoTexto rotulo="Número" valor={estado.numero} aoAlterar={(valor) => alterar('numero', valor)} placeholder="Ex.: 120" />
        <CampoTexto rotulo="Complemento" valor={estado.complemento} aoAlterar={(valor) => alterar('complemento', valor)} placeholder="Apto, bloco..." />
        <CampoTexto rotulo="Bairro" valor={estado.bairro} aoAlterar={(valor) => alterar('bairro', valor)} />
        <CampoTexto rotulo="Cidade" valor={estado.cidade} aoAlterar={(valor) => alterar('cidade', valor)} />
        <CampoTexto rotulo="UF" valor={estado.uf} aoAlterar={(valor) => alterar('uf', valor.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} />
        {leitor === null ? null : (
          <CampoCheck rotulo="Leitor ativo" marcado={estado.ativo} aoAlterar={(valor) => alterar('ativo', valor)} />
        )}
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">
          {leitor === null ? 'Cadastrar leitor' : 'Salvar alterações'}
        </Botao>
      </div>
    </form>
  )
}

/** Substitui a conta administrativa de desenvolvimento pela conta do cliente. */
export function FormularioAdministradorLocal({ aoConcluir }: { aoConcluir: (mensagem: string) => void }): ReactNode {
  const { api, usuario, notificar, confirmar } = useAplicacao()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function substituir(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (nome.trim().length < 3) {
      notificar('Informe o nome do administrador.', 'erro')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      notificar('Informe um e-mail válido.', 'erro')
      return
    }
    if (senha.length < 10 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
      notificar('Use 10 caracteres com maiúscula, minúscula, número e símbolo.', 'erro')
      return
    }
    if (senha !== confirmacaoSenha) {
      notificar('As senhas não conferem.', 'erro')
      return
    }

    const aceito = await confirmar({
      titulo: 'Substituir o administrador local?',
      mensagem: 'A conta informada virará administradora e a conta local será inativada. Você será desconectado ao concluir.',
      detalhes: [`Atual: ${usuario.email}`, `Nova: ${email.trim()}`],
      perigo: true,
      confirmarTexto: 'Substituir e sair'
    })
    if (!aceito) return

    setSalvando(true)
    try {
      const resposta = await api.trocarAdministrador({ nome: nome.trim(), email: email.trim(), senha })
      aoConcluir(
        `Administrador ${resposta.usuario.email} ativado. A conta local ${resposta.inativado.email} foi inativada.`
      )
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void substituir(evento) }}>
      <h3 className="formulario-titulo">Dados do administrador do cliente</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Nome completo" valor={nome} aoAlterar={setNome} autoComplete="name" obrigatorio />
        <CampoTexto rotulo="E-mail" valor={email} aoAlterar={setEmail} tipo="email" autoComplete="email" obrigatorio />
        <CampoTexto
          rotulo="Senha"
          valor={senha}
          aoAlterar={setSenha}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
          ajuda="Mínimo de 10 caracteres com maiúscula, minúscula, número e símbolo."
        />
        <CampoTexto
          rotulo="Confirmar senha"
          valor={confirmacaoSenha}
          aoAlterar={setConfirmacaoSenha}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
        />
      </div>
      <Aviso tom="atencao" titulo="A conta local será inativada">
        O histórico da biblioteca fica preservado. Use o e-mail e a senha acima no próximo acesso.
      </Aviso>
      <div className="acoes-formulario">
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Substituir administrador</Botao>
      </div>
    </form>
  )
}

export function FormularioUsuario({
  leitores,
  usuario,
  aoCancelar
}: {
  leitores: readonly Leitor[]
  usuario: Usuario | null
  aoCancelar: () => void
}): ReactNode {
  const { api, notificar, invalidar } = useAplicacao()
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'ADMIN')
  const [leitorId, setLeitorId] = useState(usuario?.leitorId === null || usuario?.leitorId === undefined ? '' : String(usuario.leitorId))
  const [senha, setSenha] = useState('')
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true)
  const [salvando, setSalvando] = useState(false)

  const opcoesPerfil: OpcaoCampo[] = [
    { valor: 'ADMIN', rotulo: 'Administrador' },
    { valor: 'LEITOR', rotulo: 'Leitor' }
  ]

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (nome.trim() === '' || email.trim() === '') {
      notificar('Informe nome e e-mail do usuário.', 'erro')
      return
    }
    if (usuario !== null && senha !== '' && (
      senha.length < 10 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)
    )) {
      notificar('Use 10 caracteres com maiúscula, minúscula, número e símbolo.', 'erro')
      return
    }
    const corpo = usuario === null
      ? {
          nome: nome.trim(),
          email: email.trim(),
          perfil,
          leitorId: leitorId === '' ? undefined : Number(leitorId),
          senha: senha === '' ? undefined : senha
        }
      : {
          nome: nome.trim(),
          email: email.trim(),
          perfil,
          leitorId: leitorId === '' ? undefined : Number(leitorId),
          ativo,
          ...(senha === '' ? {} : { senha })
        }

    setSalvando(true)
    try {
      const resposta: unknown = usuario === null
        ? await api.post('/usuarios', corpo)
        : await api.patch(`/usuarios/${usuario.id}`, corpo)
      const codigo = textoEm(resposta, 'codigoAtivacao') ?? textoEm(resposta, 'codigo')
      notificar(
        codigo === undefined
          ? usuario === null ? 'Usuário criado com sucesso.' : 'Usuário atualizado com sucesso.'
          : `Usuário criado. Código de ativação: ${codigo}`
      )
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
      <h3 className="formulario-titulo">{usuario === null ? 'Novo usuário' : 'Editar usuário'}</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Nome" valor={nome} aoAlterar={setNome} obrigatorio />
        <CampoTexto rotulo="E-mail" valor={email} aoAlterar={setEmail} tipo="email" obrigatorio />
        <CampoSelect rotulo="Perfil" valor={perfil} aoAlterar={(valor) => setPerfil(valor as Perfil)} opcoes={opcoesPerfil} obrigatorio />
        {usuario === null ? (
          <>
            <CampoSelect
              rotulo="Leitor vinculado"
              valor={leitorId}
              aoAlterar={setLeitorId}
              vazio="Nenhum leitor"
              opcoes={leitores.map((leitor) => ({ valor: String(leitor.id), rotulo: leitor.nome }))}
            />
            <CampoTexto rotulo="Senha inicial" valor={senha} aoAlterar={setSenha} tipo="password" comOlho autoComplete="new-password" ajuda="Deixe em branco para gerar um código de ativação." />
          </>
        ) : (
          <>
            <CampoCheck rotulo="Usuário ativo" marcado={ativo} aoAlterar={setAtivo} />
            <CampoSelect
              rotulo="Leitor vinculado"
              valor={leitorId}
              aoAlterar={setLeitorId}
              vazio="Nenhum leitor"
              opcoes={leitores.map((leitor) => ({ valor: String(leitor.id), rotulo: leitor.nome }))}
            />
            <CampoTexto
              rotulo="Nova senha (opcional)"
              valor={senha}
              aoAlterar={setSenha}
              tipo="password"
              comOlho
              autoComplete="new-password"
              ajuda="Deixe em branco para manter a senha atual. Use 10 caracteres com maiúscula, minúscula, número e símbolo."
            />
          </>
        )}
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Salvar usuário</Botao>
      </div>
    </form>
  )
}

export function FormularioEmprestimo({
  leitores,
  exemplares,
  aoCancelar
}: {
  leitores: readonly Leitor[]
  exemplares: readonly Exemplar[]
  aoCancelar: () => void
}): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const [leitorId, setLeitorId] = useState('')
  const [exemplarId, setExemplarId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const disponiveis = exemplares.filter((exemplar) => exemplar.status === 'disponivel')

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const leitor = leitores.find((item) => String(item.id) === leitorId)
    const exemplar = disponiveis.find((item) => String(item.id) === exemplarId)
    if (leitor === undefined || exemplar === undefined) {
      notificar('Selecione um leitor e um exemplar disponível.', 'erro')
      return
    }
    const confirmado = await confirmar({
      titulo: 'Confirmar retirada',
      mensagem: 'Confirme os dados para registrar a retirada do exemplar.',
      detalhes: [
        `Leitor: ${leitor.nome}`,
        `Exemplar: ${exemplar.tituloLivro ?? `Livro #${exemplar.livroId}`}`,
        `Tombamento: ${exemplar.codigoTombamento}`
      ],
      confirmarTexto: 'Registrar retirada'
    })
    if (!confirmado) return

    setSalvando(true)
    try {
      const emprestimo = await api.post<Emprestimo>('/emprestimos', {
        leitorId: leitor.id,
        exemplarId: exemplar.id,
        observacao: opcional(observacao)
      })
      notificar(
        emprestimo.dataDevolucaoPrevista === undefined
          ? 'Retirada registrada com sucesso.'
          : `Retirada registrada. Devolução prevista para ${emprestimo.dataDevolucaoPrevista.slice(0, 10).split('-').reverse().join('/')}.`
      )
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
      <h3 className="formulario-titulo">Registrar retirada</h3>
      <Aviso>O prazo e o limite de exemplares são aplicados automaticamente pela API.</Aviso>
      <div className="formulario-grade">
        <CampoSelect
          rotulo="Leitor"
          valor={leitorId}
          aoAlterar={setLeitorId}
          obrigatorio
          vazio="Selecione um leitor"
          opcoes={leitores.map((leitor) => ({ valor: String(leitor.id), rotulo: leitor.nome }))}
        />
        <CampoSelect
          rotulo="Exemplar disponível"
          valor={exemplarId}
          aoAlterar={setExemplarId}
          obrigatorio
          vazio="Selecione um exemplar"
          opcoes={disponiveis.map((exemplar) => ({
            valor: String(exemplar.id),
            rotulo: `${exemplar.tituloLivro ?? `Livro #${exemplar.livroId}`} · ${exemplar.codigoTombamento}`
          }))}
        />
        <CampoArea rotulo="Observação" valor={observacao} aoAlterar={setObservacao} placeholder="Opcional" linhas={2} />
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Registrar retirada</Botao>
      </div>
    </form>
  )
}

export function FormularioReserva({
  leitores,
  livros,
  editoras,
  prazoRetiradaHoras,
  aoCancelar
}: {
  leitores: readonly Leitor[]
  livros: readonly Livro[]
  editoras: readonly Editora[]
  prazoRetiradaHoras: number
  aoCancelar: () => void
}): ReactNode {
  const { api, usuario, notificar, confirmar, invalidar } = useAplicacao()
  const [leitorId, setLeitorId] = useState(usuario.leitorId === null ? '' : String(usuario.leitorId))
  const [livroId, setLivroId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [detalhes, setDetalhes] = useState<Livro | null>(null)
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false)
  const somenteProprios = usuario.perfil === 'LEITOR'
  const livro = livros.find((item) => String(item.id) === livroId) ?? null
  const emprestado = livro !== null && livro.exemplaresDisponiveis === 0
  const editoraNome = detalhes === null || detalhes.editoraId === null
    ? null
    : editoras.find((editora) => editora.id === detalhes.editoraId)?.nome ?? null

  async function abrirDetalhes(): Promise<void> {
    if (livroId === '') {
      notificar('Selecione um livro para ver os detalhes.', 'erro')
      return
    }
    if (livro !== null) {
      setDetalhes(livro)
      return
    }
    setCarregandoDetalhes(true)
    try {
      setDetalhes(await api.get<Livro>(`/livros/${livroId}`))
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setCarregandoDetalhes(false)
    }
  }

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const leitor = leitores.find((item) => String(item.id) === leitorId)
    if (leitor === undefined || livro === null) {
      notificar('Selecione um leitor e um livro.', 'erro')
      return
    }
    const detalhes = [
      `Leitor: ${leitor.nome}`,
      `Livro: ${livro.titulo}`,
      emprestado
        ? `Fila: você será avisado e terá ${prazoRetiradaHoras} horas para retirar o livro.`
        : 'Há exemplar disponível neste momento.'
    ]
    const confirmado = await confirmar({
      titulo: 'Confirmar reserva',
      mensagem: emprestado
        ? 'Este livro está emprestado. A reserva entra na fila por ordem de chegada e você terá o prazo informado para retirada após o aviso.'
        : 'Confirme a reserva deste livro.',
      detalhes,
      confirmarTexto: 'Confirmar reserva'
    })
    if (!confirmado) return

    setSalvando(true)
    try {
      const reserva = await api.post<Reserva>('/reservas', { leitorId: leitor.id, livroId: livro.id })
      const prazoFim = reserva.prazoRetiradaFim === null || reserva.prazoRetiradaFim === undefined ? undefined : reserva.prazoRetiradaFim
      notificar(
        prazoFim === undefined
          ? emprestado ? 'Reserva feita. Você entrou na fila de espera.' : 'Reserva registrada com sucesso.'
          : `Reserva registrada. Retire até ${formatarDataHora(prazoFim)}.`
      )
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
        <h3 className="formulario-titulo">Nova reserva</h3>
      <div className="formulario-grade">
        <CampoSelect
          rotulo="Leitor"
          valor={leitorId}
          aoAlterar={setLeitorId}
          obrigatorio
          desabilitado={somenteProprios}
          vazio="Selecione um leitor"
          opcoes={leitores.map((leitor) => ({ valor: String(leitor.id), rotulo: leitor.nome }))}
          ajuda={somenteProprios ? 'A reserva será feita no seu nome.' : undefined}
        />
        <div className="campo-livro">
          <CampoSelect
            rotulo="Livro"
            valor={livroId}
            aoAlterar={setLivroId}
            obrigatorio
            vazio="Selecione um livro"
            opcoes={livros.map((item) => ({
              valor: String(item.id),
              rotulo: `${item.titulo} · ${item.exemplaresDisponiveis > 0 ? `${item.exemplaresDisponiveis} disponível(is)` : 'emprestado'}`
            }))}
          />
          <Botao
            variante="claro"
            pequeno
            icone="info"
            onClick={() => { void abrirDetalhes() }}
            carregando={carregandoDetalhes}
            disabled={livroId === ''}
            title="Ver capa, descrição e dados do livro"
          >
            Ver detalhes
          </Botao>
        </div>
      </div>
      {emprestado ? (
        <Aviso tom="atencao" titulo="Livro emprestado — aviso de prazo">
          Este livro não tem exemplar disponível. Sua reserva ficará na fila, em ordem de chegada. Quando chegar a sua vez,
          você terá <strong>{prazoRetiradaHoras} horas</strong> para retirar o exemplar, conforme a política da biblioteca.
        </Aviso>
      ) : livro === null ? null : (
        <Aviso titulo="Exemplar disponível">Há exemplar livre neste momento. Se quiser guardar um exemplar, use Agendamentos.</Aviso>
      )}
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Confirmar reserva</Botao>
      </div>
      </form>
      {detalhes === null ? null : (
        <DialogoLivro livro={detalhes} editoraNome={editoraNome} aoFechar={() => setDetalhes(null)} />
      )}
    </>
  )
}

export function FormularioAgendamento({
  leitores,
  exemplares,
  livros,
  editoras,
  categorias,
  diasMaximos,
  aoCancelar
}: {
  leitores: readonly Leitor[]
  exemplares: readonly Exemplar[]
  livros: readonly Livro[]
  editoras: readonly Editora[]
  categorias: readonly Categoria[]
  diasMaximos: number
  aoCancelar: () => void
}): ReactNode {
  const { api, usuario, notificar, confirmar, invalidar } = useAplicacao()
  const [leitorId, setLeitorId] = useState(usuario.leitorId === null ? '' : String(usuario.leitorId))
  const [exemplarId, setExemplarId] = useState('')
  const [data, setData] = useState(hojeISO())
  const [salvando, setSalvando] = useState(false)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const somenteProprios = usuario.perfil === 'LEITOR'
  const limite = Math.max(1, diasMaximos)
  const hoje = hojeISO()
  const dataMaxima = somarDias(hoje, limite)
  const disponiveis = exemplares.filter((exemplar) => exemplar.status === 'disponivel')

  function usarLivro(livro: Livro): void {
    const exemplar = disponiveis.find((item) => item.livroId === livro.id)
    if (exemplar === undefined) {
      notificar('Este livro não tem exemplar disponível para agendamento.', 'erro')
      return
    }
    setExemplarId(String(exemplar.id))
    setCatalogoAberto(false)
    notificar(`Exemplar de "${livro.titulo}" selecionado.`)
  }

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const leitor = leitores.find((item) => String(item.id) === leitorId)
    const exemplar = disponiveis.find((item) => String(item.id) === exemplarId)
    if (leitor === undefined || exemplar === undefined) {
      notificar('Selecione um leitor e um exemplar disponível.', 'erro')
      return
    }
    if (data < hoje || data > dataMaxima) {
      notificar(`Escolha uma data entre hoje e ${dataMaxima.slice(0, 10).split('-').reverse().join('/')}.`, 'erro')
      return
    }
    const confirmado = await confirmar({
      titulo: 'Confirmar agendamento',
      mensagem: 'O exemplar ficará reservado para retirada na data escolhida.',
      detalhes: [
        `Leitor: ${leitor.nome}`,
        `Exemplar: ${exemplar.tituloLivro ?? `Livro #${exemplar.livroId}`}`,
        `Data: ${data.slice(0, 10).split('-').reverse().join('/')}`
      ],
      confirmarTexto: 'Agendar retirada'
    })
    if (!confirmado) return

    setSalvando(true)
    try {
      await api.post('/agendamentos', { leitorId: leitor.id, exemplarId: exemplar.id, dataAgendada: data })
      notificar('Agendamento criado com sucesso.')
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
        <h3 className="formulario-titulo">Novo agendamento</h3>
        <Aviso>Você pode agendar a retirada com até {limite} dias de antecedência.</Aviso>
        <div className="formulario-grade">
          <CampoSelect
            rotulo="Leitor"
            valor={leitorId}
            aoAlterar={setLeitorId}
            obrigatorio
            desabilitado={somenteProprios}
            vazio="Selecione um leitor"
            opcoes={leitores.map((leitor) => ({ valor: String(leitor.id), rotulo: leitor.nome }))}
          />
          <CampoSelect
            rotulo="Exemplar disponível"
            valor={exemplarId}
            aoAlterar={setExemplarId}
            obrigatorio
            vazio="Selecione um exemplar"
            opcoes={disponiveis.map((exemplar) => ({
              valor: String(exemplar.id),
              rotulo: `${exemplar.tituloLivro ?? `Livro #${exemplar.livroId}`} · ${exemplar.codigoTombamento}`
            }))}
          />
          <div className="campo-acao">
            <Botao variante="claro" icone="search" onClick={() => setCatalogoAberto(true)}>
              Buscar livro no catálogo
            </Botao>
          </div>
          <CampoTexto rotulo="Data da retirada" valor={data} aoAlterar={setData} tipo="date" obrigatorio min={hoje} max={dataMaxima} />
        </div>
        <div className="acoes-formulario">
          <Botao onClick={aoCancelar}>Cancelar</Botao>
          <Botao variante="primario" type="submit" carregando={salvando} icone="calendar">Agendar retirada</Botao>
        </div>
      </form>

      {catalogoAberto ? (
        <DialogoCatalogoLivros
          livros={livros}
          editoras={editoras}
          categorias={categorias}
          aoSelecionar={usarLivro}
          aoFechar={() => setCatalogoAberto(false)}
        />
      ) : null}
    </>
  )
}

export function FormularioPagamento({ multa, aoCancelar }: { multa: Multa; aoCancelar: () => void }): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const [valor, setValor] = useState((multa.valorCentavos / 100).toFixed(2))
  const [forma, setForma] = useState<'dinheiro' | 'pix' | 'cartao' | 'outro'>('pix')
  const [salvando, setSalvando] = useState(false)
  const opcoes: OpcaoCampo[] = [
    { valor: 'dinheiro', rotulo: 'Dinheiro' },
    { valor: 'pix', rotulo: 'Pix' },
    { valor: 'cartao', rotulo: 'Cartão' },
    { valor: 'outro', rotulo: 'Outro' }
  ]

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const valorNumerico = Number(valor.replace(',', '.'))
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      notificar('Informe um valor válido para o pagamento.', 'erro')
      return
    }
    const centavos = Math.round(valorNumerico * 100)
    const confirmado = await confirmar({
      titulo: 'Registrar pagamento',
      mensagem: 'Confirme o pagamento desta multa.',
      detalhes: [
        `Multa: #${multa.id}`,
        `Valor: R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`,
        `Forma: ${opcoes.find((opcao) => opcao.valor === forma)?.rotulo ?? forma}`
      ],
      confirmarTexto: 'Registrar pagamento'
    })
    if (!confirmado) return

    setSalvando(true)
    try {
      await api.post('/pagamentos-multa', { multaId: multa.id, valorCentavos: centavos, forma })
      notificar('Pagamento registrado com sucesso.')
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario formulario-simples" onSubmit={(evento) => { void salvar(evento) }}>
      <h3 className="formulario-titulo">Pagar multa #{multa.id}</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Valor (R$)" valor={valor} aoAlterar={setValor} inputMode="decimal" obrigatorio />
        <CampoSelect rotulo="Forma de pagamento" valor={forma} aoAlterar={(valorSelecionado) => setForma(valorSelecionado as typeof forma)} opcoes={opcoes} obrigatorio />
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Registrar pagamento</Botao>
      </div>
    </form>
  )
}

export function FormularioConfiguracoes({
  configuracoes,
  aoCancelar
}: {
  configuracoes: Configuracoes
  aoCancelar: () => void
}): ReactNode {
  const { api, notificar, confirmar, invalidar } = useAplicacao()
  const [estado, setEstado] = useState({
    prazoEmprestimoDias: String(configuracoes.prazoEmprestimoDias),
    limiteExemplaresPorLeitor: String(configuracoes.limiteExemplaresPorLeitor),
    prazoRenovacaoDias: String(configuracoes.prazoRenovacaoDias),
    limiteReservasAtivas: String(configuracoes.limiteReservasAtivas),
    prazoRetiradaHoras: String(configuracoes.prazoRetiradaHoras),
    antecedenciaAvisoDias: String(configuracoes.antecedenciaAvisoDias),
    horaAvisoAtraso: configuracoes.horaAvisoAtraso,
    valorDiarioMulta: (configuracoes.valorDiarioMultaCentavos / 100).toFixed(2),
    tetoMulta: (configuracoes.tetoMultaCentavos / 100).toFixed(2),
    diasMaxAgendamento: String(configuracoes.diasMaxAgendamento),
    timezone: configuracoes.timezone
  })
  const [salvando, setSalvando] = useState(false)

  function alterar(chave: keyof typeof estado, valor: string): void {
    setEstado((atual) => ({ ...atual, [chave]: valor }))
  }

  async function salvar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const chavesNumericas = [
      'prazoEmprestimoDias',
      'limiteExemplaresPorLeitor',
      'prazoRenovacaoDias',
      'limiteReservasAtivas',
      'prazoRetiradaHoras',
      'antecedenciaAvisoDias',
      'diasMaxAgendamento'
    ] as const
    const valores: Record<string, number> = {}
    for (const chave of chavesNumericas) {
      const numero = Number(estado[chave])
      if (!Number.isFinite(numero) || numero < 0) {
        notificar('Confira os campos numéricos: use números maiores ou iguais a zero.', 'erro')
        return
      }
      valores[chave] = numero
    }
    const multaDiaria = Number(estado.valorDiarioMulta.replace(',', '.'))
    const teto = Number(estado.tetoMulta.replace(',', '.'))
    if (!Number.isFinite(multaDiaria) || !Number.isFinite(teto) || multaDiaria < 0 || teto < 0) {
      notificar('Confira os valores de multa informados.', 'erro')
      return
    }

    const confirmado = await confirmar({
      titulo: 'Salvar novas regras?',
      mensagem: 'As novas regras passam a valer para as próximas operações e ficarão registradas na auditoria.',
      detalhes: [
        `Prazo de empréstimo: ${valores.prazoEmprestimoDias} dias`,
        `Limite por leitor: ${valores.limiteExemplaresPorLeitor} exemplares`,
        `Prazo de retirada da reserva: ${valores.prazoRetiradaHoras} horas`,
        `Multa diária: R$ ${multaDiaria.toFixed(2).replace('.', ',')}`
      ],
      confirmarTexto: 'Salvar regras'
    })
    if (!confirmado) return

    const corpo: Configuracoes = {
      prazoEmprestimoDias: valores.prazoEmprestimoDias,
      limiteExemplaresPorLeitor: valores.limiteExemplaresPorLeitor,
      prazoRenovacaoDias: valores.prazoRenovacaoDias,
      limiteReservasAtivas: valores.limiteReservasAtivas,
      prazoRetiradaHoras: valores.prazoRetiradaHoras,
      antecedenciaAvisoDias: valores.antecedenciaAvisoDias,
      horaAvisoAtraso: estado.horaAvisoAtraso,
      valorDiarioMultaCentavos: Math.round(multaDiaria * 100),
      tetoMultaCentavos: Math.round(teto * 100),
      diasMaxAgendamento: valores.diasMaxAgendamento,
      timezone: estado.timezone
    }

    setSalvando(true)
    try {
      await api.patch('/configuracoes', corpo)
      notificar('Configurações salvas com sucesso.')
      invalidar()
      aoCancelar()
    } catch (erroCapturado) {
      notificar(mensagemErro(erroCapturado), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={(evento) => { void salvar(evento) }}>
      <h3 className="formulario-titulo">Regras da biblioteca</h3>
      <div className="formulario-grade">
        <CampoTexto rotulo="Prazo de empréstimo (dias)" valor={estado.prazoEmprestimoDias} aoAlterar={(valor) => alterar('prazoEmprestimoDias', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Limite de exemplares por leitor" valor={estado.limiteExemplaresPorLeitor} aoAlterar={(valor) => alterar('limiteExemplaresPorLeitor', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Prazo de renovação (dias)" valor={estado.prazoRenovacaoDias} aoAlterar={(valor) => alterar('prazoRenovacaoDias', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Limite de reservas ativas" valor={estado.limiteReservasAtivas} aoAlterar={(valor) => alterar('limiteReservasAtivas', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Prazo para retirada da reserva (horas)" valor={estado.prazoRetiradaHoras} aoAlterar={(valor) => alterar('prazoRetiradaHoras', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Antecedência do aviso (dias)" valor={estado.antecedenciaAvisoDias} aoAlterar={(valor) => alterar('antecedenciaAvisoDias', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Hora do aviso de atraso" valor={estado.horaAvisoAtraso} aoAlterar={(valor) => alterar('horaAvisoAtraso', valor)} tipo="time" obrigatorio />
        <CampoTexto rotulo="Multa diária (R$)" valor={estado.valorDiarioMulta} aoAlterar={(valor) => alterar('valorDiarioMulta', valor)} inputMode="decimal" obrigatorio />
        <CampoTexto rotulo="Teto da multa (R$)" valor={estado.tetoMulta} aoAlterar={(valor) => alterar('tetoMulta', valor)} inputMode="decimal" obrigatorio />
        <CampoTexto rotulo="Dias máximos de agendamento" valor={estado.diasMaxAgendamento} aoAlterar={(valor) => alterar('diasMaxAgendamento', valor)} tipo="number" min={0} obrigatorio />
        <CampoTexto rotulo="Fuso horário" valor={estado.timezone} aoAlterar={(valor) => alterar('timezone', valor)} obrigatorio placeholder="America/Sao_Paulo" />
      </div>
      <div className="acoes-formulario">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">Salvar configurações</Botao>
      </div>
    </form>
  )
}

/** Usado para exibir campos extras devolvidos por algumas rotas, sem recorrer a any. */
export function campoExtraTexto(resposta: unknown, chave: string): string | undefined {
  return textoEm(resposta, chave)
}

/** Usado para exibir números extras devolvidos por algumas rotas, sem recorrer a any. */
export function campoExtraNumero(resposta: unknown, chave: string): number | undefined {
  return numeroEm(resposta, chave)
}
