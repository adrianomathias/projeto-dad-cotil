import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mensagemErro, type ParametrosConsulta } from './api'
import { useAplicacao } from './contexto'
import { itensDaLista, totalDaLista, type RespostaLista } from './tipos'

export interface EstadoRecurso<T> {
  dados: T | null
  carregando: boolean
  erro: string | null
  recarregar: () => void
}

/** Busca um recurso da API e expõe estados de carregamento, erro e recarga. */
export function useRecurso<T>(caminho: string | null, params: ParametrosConsulta = {}): EstadoRecurso<T> {
  const { api, versao } = useAplicacao()
  const chave = JSON.stringify(params)
  const paramsEstaveis = useMemo(() => params, [chave])
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const geracao = useRef(0)

  const carregar = useCallback(async () => {
    if (caminho === null) {
      setDados(null)
      setCarregando(false)
      setErro(null)
      return
    }
    const atual = ++geracao.current
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await api.get<T>(caminho, paramsEstaveis)
      if (atual === geracao.current) setDados(resposta)
    } catch (erroCapturado) {
      if (atual === geracao.current) {
        setDados(null)
        setErro(mensagemErro(erroCapturado))
      }
    } finally {
      if (atual === geracao.current) setCarregando(false)
    }
  }, [api, caminho, paramsEstaveis])

  useEffect(() => {
    void carregar()
  }, [carregar, versao])

  return { dados, carregando, erro, recarregar: () => { void carregar() } }
}

/** Atalho para listas paginadas (aceita também respostas em array). */
export function useLista<T>(caminho: string | null, params: ParametrosConsulta = {}) {
  const recurso = useRecurso<RespostaLista<T>>(caminho, params)
  return {
    ...recurso,
    itens: itensDaLista<T>(recurso.dados),
    total: totalDaLista(recurso.dados)
  }
}

/** Campo de busca com pequena espera para evitar uma requisição por tecla. */
export function useBusca(espera = 350) {
  const [termo, setTermo] = useState('')
  const [aplicado, setAplicado] = useState('')

  useEffect(() => {
    const temporizador = window.setTimeout(() => setAplicado(termo.trim()), espera)
    return () => window.clearTimeout(temporizador)
  }, [termo, espera])

  return { termo, termoAplicado: aplicado, definirTermo: setTermo }
}
