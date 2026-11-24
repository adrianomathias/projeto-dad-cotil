import { createContext, useContext } from 'react'
import type { UsuarioLogado } from '@biblioteca/shared'
import type { ApiCliente } from './api'
import type { PedidoConfirmacao, Secao, TomMensagem } from './tipos'

export interface ValorAplicacao {
  api: ApiCliente
  usuario: UsuarioLogado
  secao: Secao
  versao: number
  navegar: (destino: Secao) => void
  notificar: (texto: string, tom?: TomMensagem) => void
  confirmar: (pedido: PedidoConfirmacao) => Promise<boolean>
  invalidar: () => void
  sair: (mensagemParaLogin?: string) => void
}

export const ContextoAplicacao = createContext<ValorAplicacao | null>(null)

export function useAplicacao(): ValorAplicacao {
  const contexto = useContext(ContextoAplicacao)
  if (contexto === null) {
    throw new Error('Contexto da aplicação não disponível.')
  }
  return contexto
}
