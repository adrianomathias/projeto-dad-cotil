import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Valida o CPF incluindo os dois dígitos verificadores. */
export function cpfValido(valor: string): boolean {
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

/** Formato exibido em telas e registros: nunca mostra o CPF inteiro. */
export function mascararCpf(valor: string): string {
  const digitos = somenteDigitos(valor)
  if (digitos.length !== 11) return '***.***.***-**'
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`
}

export function mascararEmail(valor: string): string {
  const [inicio, dominio] = valor.split('@')
  if (inicio === undefined || dominio === undefined) return '***'
  const letra = inicio.slice(0, 1)
  const parteDominio = dominio.slice(0, 1)
  return `${letra}***@${parteDominio}***`
}

/** Cifragem autenticada: nonce(12) + tag(16) + ciphertext. */
export function cifrarTexto(texto: string, chave: Buffer): Buffer {
  if (chave.length !== 32) throw new Error('A chave de cifragem deve ter 32 bytes.')
  const nonce = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, nonce)
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return Buffer.concat([nonce, cifra.getAuthTag(), cifrado])
}

export function decifrarTexto(dados: Buffer, chave: Buffer): string {
  if (chave.length !== 32) throw new Error('A chave de cifragem deve ter 32 bytes.')
  if (dados.length < 28) throw new Error('Dados cifrados incompletos.')
  const nonce = dados.subarray(0, 12)
  const tag = dados.subarray(12, 28)
  const cifrado = dados.subarray(28)
  const decifra = createDecipheriv('aes-256-gcm', chave, nonce)
  decifra.setAuthTag(tag)
  return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8')
}

/** HMAC com chave separada permite busca exata sem expor o CPF. */
export function hashCpf(valor: string, chave: Buffer): Buffer {
  if (chave.length !== 32) throw new Error('A chave HMAC deve ter 32 bytes.')
  return createHmac('sha256', chave).update(somenteDigitos(valor)).digest()
}
