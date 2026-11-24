import type { Perfil } from '@biblioteca/shared'

/**
 * Cadastro ainda não confirmado. Fica somente em memória: nada é gravado nas
 * tabelas leitores/usuários antes de a pessoa digitar o código correto.
 */
export interface CadastroPendente {
  nome: string
  email: string
  perfil: Perfil
  senhaHash: string
  telefone?: string
  cpfCifrado?: Buffer
  cpfHash?: Buffer
  cpfMascara?: string
  conviteId?: number
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  codigoHash: string
  expiraEm: string
  enviadoEm: string
  tentativas: number
  criadoEm: string
}

function chave(email: string): string {
  return email.toLowerCase()
}

/** Repositório temporário de cadastros aguardando confirmação de e-mail. */
export class RegistroCadastrosPendentes {
  private readonly itens = new Map<string, CadastroPendente>()

  private descartarExpirados(): void {
    const agora = new Date().toISOString()
    for (const [email, pendente] of this.itens) {
      if (pendente.expiraEm < agora) this.itens.delete(email)
    }
  }

  /** Devolve também cadastros expirados para que a API possa explicar o motivo. */
  obter(email: string): CadastroPendente | undefined {
    return this.itens.get(chave(email))
  }

  /** Só cadastros válidos bloqueiam CPFs ou convites de outras pessoas. */
  listar(): CadastroPendente[] {
    this.descartarExpirados()
    return [...this.itens.values()]
  }

  guardar(pendente: CadastroPendente): void {
    this.itens.set(chave(pendente.email), pendente)
  }

  remover(email: string): void {
    this.itens.delete(chave(email))
  }

  temCpf(cpfHash: Buffer, ignorarEmail?: string): boolean {
    return this.listar().some((pendente) =>
      pendente.cpfHash?.equals(cpfHash) === true && pendente.email !== ignorarEmail
    )
  }
}
