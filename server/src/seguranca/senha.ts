import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const CUSTO = 16_384
const TAMANHO_SALT = 16
const TAMANHO_HASH = 64

/** Deriva senhas com scrypt e salt único; nunca guarda texto puro. */
export class ServicoSenha {
  gerarHash(senha: string): string {
    if (senha.length < 8) {
      throw new Error('A senha deve ter ao menos 8 caracteres.')
    }
    const salt = randomBytes(TAMANHO_SALT)
    const derivada = scryptSync(senha, salt, TAMANHO_HASH, { N: CUSTO, r: 8, p: 1 })
    return `scrypt$${salt.toString('hex')}$${derivada.toString('hex')}`
  }

  conferir(senha: string, hash: string): boolean {
    const partes = hash.split('$')
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false
    const salt = Buffer.from(partes[1] ?? '', 'hex')
    const esperada = Buffer.from(partes[2] ?? '', 'hex')
    if (salt.length !== TAMANHO_SALT || esperada.length !== TAMANHO_HASH) return false
    const recebida = scryptSync(senha, salt, TAMANHO_HASH, { N: CUSTO, r: 8, p: 1 })
    return timingSafeEqual(esperada, recebida)
  }
}
