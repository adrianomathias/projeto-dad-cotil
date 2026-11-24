import type { SituacaoRegistro } from '@biblioteca/shared'
import { ErroDeDominio } from '../erros.js'

/** Aceita o parâmetro `situacao` e mantém compatibilidade com o antigo `inativos=true`. */
export function normalizarSituacao(valor: unknown): SituacaoRegistro {
  if (valor === undefined || valor === null || valor === '' || valor === 'todos' || valor === false) {
    return 'todos'
  }
  if (valor === true || valor === 'inativos') return 'inativos'
  if (valor === 'ativos') return 'ativos'
  throw ErroDeDominio.validacao('Situação inválida.', {
    situacao: 'Use ativos, inativos ou todos.'
  })
}

/** Devolve a condição SQL da situação; `todos` não adiciona restrição. */
export function condicaoSituacao(
  situacao: SituacaoRegistro,
  ativoSql: string,
  inativoSql: string
): string | undefined {
  if (situacao === 'ativos') return `(${ativoSql})`
  if (situacao === 'inativos') return `(${inativoSql})`
  return undefined
}
