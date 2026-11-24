import { resolveMx } from 'node:dns/promises'

export interface ConsultaMx {
  dominioTemMx(dominio: string): Promise<boolean>
}

const TEMPO_LIMITE_MS = 5000

/**
 * Confirma que o domínio do e-mail possui servidor de mensagens (registro MX).
 * A sintaxe do endereço continua sendo validada localmente por `Validador`.
 */
export class ServicoMx implements ConsultaMx {
  async dominioTemMx(dominio: string): Promise<boolean> {
    const nome = dominio.trim().toLowerCase().replace(/\.$/, '')
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(nome)) return false

    return new Promise<boolean>((resolve) => {
      const temporizador = setTimeout(() => resolve(false), TEMPO_LIMITE_MS)
      resolveMx(nome)
        .then((registros) => resolve(registros.some((registro) => registro.exchange !== '')))
        .catch(() => resolve(false))
        .finally(() => clearTimeout(temporizador))
    })
  }
}
