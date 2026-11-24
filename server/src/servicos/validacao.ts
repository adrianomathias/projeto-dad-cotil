import { ErroDeDominio } from '../erros.js'
import { cpfValido, somenteDigitos } from '../seguranca/cpf.js'

interface OpcoesTexto {
  obrigatorio?: boolean
  min?: number
  max?: number
}

function falha(campo: string, mensagem: string): never {
  throw ErroDeDominio.validacao('Confira os dados informados.', { [campo]: mensagem })
}

export class Validador {
  static texto(valor: unknown, campo: string, opcoes: OpcoesTexto = {}): string | undefined {
    if (valor === undefined || valor === null || valor === '') {
      if (opcoes.obrigatorio === true) falha(campo, 'Este campo é obrigatório.')
      return undefined
    }
    if (typeof valor !== 'string') falha(campo, 'Informe um texto.')
    const texto = valor.trim()
    if (opcoes.obrigatorio === true && texto === '') falha(campo, 'Este campo é obrigatório.')
    if (opcoes.min !== undefined && texto.length < opcoes.min) falha(campo, `Use ao menos ${opcoes.min} caracteres.`)
    if (opcoes.max !== undefined && texto.length > opcoes.max) falha(campo, `Use no máximo ${opcoes.max} caracteres.`)
    return texto
  }

  static inteiro(valor: unknown, campo: string, opcoes: { obrigatorio?: boolean; min?: number; max?: number } = {}): number | undefined {
    if (valor === undefined || valor === null || valor === '') {
      if (opcoes.obrigatorio === true) falha(campo, 'Este campo é obrigatório.')
      return undefined
    }
    const numero = typeof valor === 'number' ? valor : Number(valor)
    if (!Number.isInteger(numero)) falha(campo, 'Informe um número inteiro.')
    if (opcoes.min !== undefined && numero < opcoes.min) falha(campo, `O mínimo é ${opcoes.min}.`)
    if (opcoes.max !== undefined && numero > opcoes.max) falha(campo, `O máximo é ${opcoes.max}.`)
    return numero
  }

  static email(valor: unknown, campo: string, obrigatorio = false): string | undefined {
    const texto = Validador.texto(valor, campo, { obrigatorio, max: 120 })
    if (texto === undefined) return undefined
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto)) falha(campo, 'Informe um e-mail válido.')
    return texto.toLowerCase()
  }

  /**
   * Aceita o número como o usuário digita ((11) 99999-8888, +55 11 99999-8888,
   * 11999998888) e devolve sempre o formato internacional +DDI+DDD+número.
   * Quem não informa o DDI explicitamente com "+" tem o +55 adicionado,
   * inclusive para números do DDD 55.
   */
  static telefone(valor: unknown, campo = 'telefone', obrigatorio = false): string | undefined {
    const texto = this.texto(valor, campo, { obrigatorio, max: 30 })
    if (texto === undefined) return undefined
    let digitos = somenteDigitos(texto)
    if (!texto.startsWith('+') && digitos.length >= 10 && digitos.length <= 11) digitos = `55${digitos}`
    if (digitos.length < 10 || digitos.length > 15) {
      falha(campo, 'Informe o telefone com código do país e DDD. Exemplo: +55 (11) 99999-8888.')
    }
    return `+${digitos}`
  }

  static cpf(valor: unknown, campo = 'cpf'): string {
    const texto = Validador.texto(valor, campo, { obrigatorio: true }) ?? ''
    if (!cpfValido(texto)) falha(campo, 'Informe um CPF válido com 11 números.')
    return somenteDigitos(texto)
  }

  static cpfOuNome(termo: unknown): { cpfHash?: string; nome?: string } {
    const texto = Validador.texto(termo, 'q', { max: 120 })
    if (texto === undefined) return {}
    const digitos = somenteDigitos(texto)
    if (digitos.length >= 3 && digitos.length <= 11) return { cpfHash: digitos }
    return { nome: texto }
  }

  static isbn(valor: unknown, campo: string): string | undefined {
    const texto = Validador.texto(valor, campo)?.replace(/[^0-9Xx]/g, '').toUpperCase()
    if (texto === undefined) return undefined
    if (texto.length !== 10 && texto.length !== 13) falha(campo, 'Use ISBN com 10 ou 13 caracteres.')
    return texto
  }

  static data(valor: unknown, campo: string, obrigatorio = false): string | undefined {
    const texto = Validador.texto(valor, campo, { obrigatorio })
    if (texto === undefined) return undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) falha(campo, 'Use a data no formato AAAA-MM-DD.')
    const data = new Date(`${texto}T12:00:00Z`)
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto) falha(campo, 'Data inválida.')
    return texto
  }

  static cep(valor: unknown, campo = 'cep'): string | undefined {
    const texto = Validador.texto(valor, campo)
    if (texto === undefined) return undefined
    const digitos = somenteDigitos(texto)
    if (digitos.length !== 8) falha(campo, 'Informe 8 números.')
    return digitos
  }

  static enum<T extends string>(valor: unknown, campo: string, permitidos: readonly T[], obrigatorio = false): T | undefined {
    if (valor === undefined || valor === null || valor === '') {
      if (obrigatorio) falha(campo, 'Este campo é obrigatório.')
      return undefined
    }
    if (typeof valor !== 'string' || !permitidos.includes(valor as T)) {
      falha(campo, `Escolha uma destas opções: ${permitidos.join(', ')}.`)
    }
    return valor as T
  }

  static booleano(valor: unknown, campo: string): boolean | undefined {
    if (valor === undefined || valor === null) return undefined
    if (typeof valor === 'boolean') return valor
    if (valor === 'true' || valor === '1' || valor === 1) return true
    if (valor === 'false' || valor === '0' || valor === 0) return false
    falha(campo, 'Use verdadeiro ou falso.')
  }

  static senha(valor: unknown, campo = 'senha'): string {
    const texto = Validador.texto(valor, campo, { obrigatorio: true, min: 8, max: 200 }) ?? ''
    if (!/[A-Za-z]/.test(texto) || !/\d/.test(texto)) falha(campo, 'Use letras e números.')
    return texto
  }

  /** Política reforçada para cadastros públicos, onde não há código de ativação. */
  static senhaForte(valor: unknown, campo = 'senha'): string {
    const texto = Validador.texto(valor, campo, { obrigatorio: true, min: 10, max: 200 }) ?? ''
    if (!/[a-z]/.test(texto) || !/[A-Z]/.test(texto) || !/\d/.test(texto) || !/[^A-Za-z0-9]/.test(texto)) {
      falha(campo, 'Use letra maiúscula, minúscula, número e símbolo.')
    }
    return texto
  }
}
