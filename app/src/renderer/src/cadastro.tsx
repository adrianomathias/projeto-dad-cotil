import { useState, type FormEvent, type ReactNode } from 'react'
import { MENSAGEM_EMAIL_INVALIDO, validarEmailPermitido, type UsuarioLogado } from '@biblioteca/shared'
import { api, mensagemErro } from './api'
import { Botao, CampoTexto, Icone } from './componentes'
import {
  formatarTelefone, normalizarTelefone, somenteDigitos, telefoneValido
} from './tipos'

interface PropsCadastro {
  aoConcluir: (usuario: UsuarioLogado) => void
  aoVoltar: () => void
}

function formatarCpf(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11)
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function cpfValido(valor: string): boolean {
  const digitos = somenteDigitos(valor)
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false
  const calcular = (quantidade: number): number => {
    let soma = 0
    for (let indice = 0; indice < quantidade; indice += 1) {
      soma += Number(digitos[indice]) * (quantidade + 1 - indice)
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10])
}

function senhaValida(senha: string): boolean {
  return senha.length >= 10
    && /[a-z]/.test(senha)
    && /[A-Z]/.test(senha)
    && /\d/.test(senha)
    && /[^A-Za-z0-9]/.test(senha)
}

function formatarConvite(valor: string): string {
  const codigo = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  return codigo.replace(/(\d{4})(?=\d)/g, '$1 ').replace(/([A-Z]{4})(?=[A-Z])/g, '$1 ')
}

function conferirEmail(valor: string): string | null {
  try {
    return validarEmailPermitido(valor)
  } catch {
    return null
  }
}

function ErroCadastro({ mensagem }: { mensagem: string | null }): ReactNode {
  if (mensagem === null) return null
  return (
    <p className="login-erro" role="alert">
      <Icone nome="warning" /> {mensagem}
    </p>
  )
}

function DicaSenha(): ReactNode {
  return (
    <p className="cadastro-dica">
      <Icone nome="info" />
      Use ao menos 10 caracteres com letra maiúscula, minúscula, número e símbolo.
    </p>
  )
}

export function CadastroLeitor({ aoConcluir, aoVoltar }: PropsCadastro): ReactNode {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function cadastrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (nome.trim().length < 3) {
      setErro('Informe seu nome completo.')
      return
    }
    if (!cpfValido(cpf)) {
      setErro('Informe um CPF válido com 11 dígitos.')
      return
    }
    const emailNormalizado = conferirEmail(email)
    if (emailNormalizado === null) {
      setErro(MENSAGEM_EMAIL_INVALIDO)
      return
    }
    if (!telefoneValido(telefone)) {
      setErro('Informe o telefone com DDD. Exemplo: (11) 99999-8888.')
      return
    }
    if (!senhaValida(senha)) {
      setErro('A senha precisa ter 10 caracteres, maiúscula, minúscula, número e símbolo.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    const telefoneNormalizado = normalizarTelefone(telefone)
    if (telefoneNormalizado === undefined) {
      setErro('Informe o telefone com DDD. Exemplo: (11) 99999-8888.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const resposta = await api.cadastrarLeitor({
        nome: nome.trim(),
        cpf: somenteDigitos(cpf),
        email: emailNormalizado,
        telefone: telefoneNormalizado,
        senha
      })
      aoConcluir(resposta.usuario)
    } catch (erroCapturado) {
      setErro(mensagemErro(erroCapturado))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="cartao-login cartao-cadastro" aria-labelledby="titulo-cadastro">
      <div className="login-cabecalho">
        <span className="login-marca"><Icone nome="user" /></span>
        <p className="login-overline">Novo cadastro</p>
        <h1 id="titulo-cadastro">Cadastro de leitor</h1>
        <p>Seus dados cadastram você na biblioteca e criam seu acesso com senha.</p>
      </div>
      <form className="login-formulario" onSubmit={(evento) => { void cadastrar(evento) }}>
        <CampoTexto rotulo="Nome completo" valor={nome} aoAlterar={setNome} autoComplete="name" obrigatorio placeholder="Seu nome" />
        <CampoTexto
          rotulo="CPF"
          valor={cpf}
          aoAlterar={(valor) => setCpf(formatarCpf(valor))}
          inputMode="numeric"
          autoComplete="off"
          obrigatorio
          placeholder="000.000.000-00"
        />
        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoAlterar={setEmail}
          tipo="email"
          autoComplete="email"
          obrigatorio
          placeholder="voce@gmail.com"
          ajuda="Use Gmail, Outlook, Hotmail, Live, Yahoo, iCloud, Uol ou Bol."
        />
        <CampoTexto
          rotulo="Telefone"
          valor={telefone}
          aoAlterar={(valor) => setTelefone(formatarTelefone(valor))}
          tipo="tel"
          autoComplete="tel"
          obrigatorio
          placeholder="+55 (11) 99999-8888"
          ajuda="Digite o DDD e o número; o +55 é adicionado automaticamente."
        />
        <CampoTexto
          rotulo="Senha"
          valor={senha}
          aoAlterar={setSenha}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
          placeholder="Crie uma senha forte"
        />
        <CampoTexto
          rotulo="Confirmar senha"
          valor={confirmacao}
          aoAlterar={setConfirmacao}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
          placeholder="Repita a senha"
        />
        <DicaSenha />
        <ErroCadastro mensagem={erro} />
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">
          {salvando ? 'Cadastrando...' : 'Cadastrar leitor'}
        </Botao>
        <Botao variante="secundario" onClick={aoVoltar} icone="arrow">Voltar para o login</Botao>
      </form>
    </section>
  )
}

export function CadastroEquipe({ aoConcluir, aoVoltar }: PropsCadastro): ReactNode {
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function cadastrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (codigo.replace(/\s/g, '').length !== 12) {
      setErro('Informe o código de convite de 12 caracteres.')
      return
    }
    if (nome.trim().length < 3) {
      setErro('Informe seu nome completo.')
      return
    }
    const emailNormalizado = conferirEmail(email)
    if (emailNormalizado === null) {
      setErro(MENSAGEM_EMAIL_INVALIDO)
      return
    }
    if (!senhaValida(senha)) {
      setErro('A senha precisa ter 10 caracteres, maiúscula, minúscula, número e símbolo.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      const resposta = await api.cadastrarEquipe({
        codigo: codigo.replace(/\s/g, ''),
        nome: nome.trim(),
        email: emailNormalizado,
        senha
      })
      aoConcluir(resposta.usuario)
    } catch (erroCapturado) {
      setErro(mensagemErro(erroCapturado))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="cartao-login cartao-cadastro" aria-labelledby="titulo-cadastro-equipe">
      <div className="login-cabecalho">
        <span className="login-marca"><Icone nome="users" /></span>
        <p className="login-overline">Acesso restrito</p>
        <h1 id="titulo-cadastro-equipe">Cadastro de administrador</h1>
        <p>Informe o convite de uso único entregue pela biblioteca.</p>
      </div>
      <form className="login-formulario" onSubmit={(evento) => { void cadastrar(evento) }}>
        <CampoTexto
          rotulo="Código do convite"
          valor={codigo}
          aoAlterar={(valor) => setCodigo(formatarConvite(valor))}
          inputMode="text"
          autoComplete="off"
          obrigatorio
          maxLength={14}
          placeholder="ABCD EFGH IJKL"
          ajuda="O código vale 24 horas e só pode ser usado uma vez."
        />
        <CampoTexto rotulo="Nome completo" valor={nome} aoAlterar={setNome} autoComplete="name" obrigatorio placeholder="Seu nome" />
        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoAlterar={setEmail}
          tipo="email"
          autoComplete="email"
          obrigatorio
          placeholder="voce@gmail.com"
          ajuda="Use Gmail, Outlook, Hotmail, Live, Yahoo, iCloud, Uol ou Bol."
        />
        <CampoTexto
          rotulo="Senha"
          valor={senha}
          aoAlterar={setSenha}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
          placeholder="Crie uma senha forte"
        />
        <CampoTexto
          rotulo="Confirmar senha"
          valor={confirmacao}
          aoAlterar={setConfirmacao}
          tipo="password"
          autoComplete="new-password"
          obrigatorio
          comOlho
          minLength={10}
          placeholder="Repita a senha"
        />
        <DicaSenha />
        <ErroCadastro mensagem={erro} />
        <Botao variante="primario" type="submit" carregando={salvando} icone="check">
          {salvando ? 'Cadastrando...' : 'Cadastrar administrador'}
        </Botao>
        <Botao variante="secundario" onClick={aoVoltar} icone="arrow">Voltar para o login</Botao>
      </form>
    </section>
  )
}
