// Cliente HTTP compartilhado pelas integracoes externas.
// Nenhuma mensagem de erro exponha a URL: ela pode conter chaves de API.

export class ClienteHttp {
  private readonly timeoutMs: number
  private readonly tentativas: number

  constructor(timeoutMs = 12000, tentativas = 2) {
    this.timeoutMs = timeoutMs
    this.tentativas = Math.max(1, Math.trunc(tentativas))
  }

  /**
   * Consulta que preserva o código HTTP. Útil quando 404 é uma resposta válida
   * (ex.: CPF não encontrado) e não deve ser tratado como falha de rede.
   */
  async getResposta<T>(url: string, headers?: Record<string, string>): Promise<{ status: number; dados: T | null }> {
    let ultimoErro: Error | undefined

    for (let tentativa = 1; tentativa <= this.tentativas; tentativa += 1) {
      let resposta: Response
      try {
        resposta = await fetch(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(this.timeoutMs)
        })
      } catch (erro: unknown) {
        const nome = erro instanceof Error ? erro.name : ''
        const mensagem = nome === 'TimeoutError' || nome === 'AbortError'
          ? 'O serviço demorou para responder. Tente novamente em instantes.'
          : 'Não foi possível acessar o serviço. Verifique a conexão e tente novamente.'
        ultimoErro = new Error(mensagem)
        if (tentativa < this.tentativas) {
          await new Promise((resolve) => setTimeout(resolve, 200 * tentativa))
          continue
        }
        throw ultimoErro
      }

      if (!resposta.ok) return { status: resposta.status, dados: null }
      try {
        return { status: resposta.status, dados: (await resposta.json()) as T }
      } catch {
        throw new Error('O serviço retornou uma resposta inválida.')
      }
    }

    throw ultimoErro ?? new Error('Não foi possível acessar o serviço.')
  }

  async getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
    let ultimoErro: Error | undefined

    for (let tentativa = 1; tentativa <= this.tentativas; tentativa++) {
      let resposta: Response
      try {
        resposta = await fetch(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(this.timeoutMs)
        })
      } catch (erro: unknown) {
        const nome = erro instanceof Error ? erro.name : ''
        const mensagem = nome === 'TimeoutError' || nome === 'AbortError'
          ? 'O serviço demorou para responder. Tente novamente em instantes.'
          : 'Não foi possível acessar o serviço. Verifique a conexão e tente novamente.'
        ultimoErro = new Error(mensagem)
        if (tentativa < this.tentativas) {
          await new Promise((resolve) => setTimeout(resolve, 200 * tentativa))
          continue
        }
        throw ultimoErro
      }

      // Falhas HTTP (429, 404 etc.) não são repetidas: não há benefício em insistir.
      if (!resposta.ok) {
        throw new Error(`O serviço não concluiu a consulta (falha ${resposta.status}).`)
      }

      try {
        return (await resposta.json()) as T
      } catch {
        throw new Error('O serviço retornou uma resposta inválida.')
      }
    }

    throw ultimoErro ?? new Error('Não foi possível acessar o serviço.')
  }
}
