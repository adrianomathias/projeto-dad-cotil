import type { UsuarioLogado } from '@biblioteca/shared'

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioLogado
    }
  }
}

export {}
