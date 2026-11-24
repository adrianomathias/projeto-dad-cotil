import nodemailer from 'nodemailer'

export interface ResultadoEnvio {
  enviado: boolean
  detalhe?: string
}

interface OpcoesNotificador {
  host?: string
  port?: number
  user?: string
  password?: string
  modoSimulado?: boolean
}

function mascararDestinatario(destinatario: string): string {
  const valor = destinatario.trim()
  const posicaoArroba = valor.indexOf('@')
  if (posicaoArroba <= 0) return '***'

  const usuario = valor.slice(0, posicaoArroba)
  const dominio = valor.slice(posicaoArroba + 1).split('.')[0] ?? ''
  return `${usuario.slice(0, 1)}***@${dominio.slice(0, 1)}***`
}

export class Notificador {
  private readonly opcoes: OpcoesNotificador

  constructor(opcoes: OpcoesNotificador = {}) {
    this.opcoes = opcoes
  }

  async enviar(destinatario: string, assunto: string, mensagem: string): Promise<ResultadoEnvio> {
    const mascara = mascararDestinatario(destinatario)
    if (mascara === '***') {
      return { enviado: false, detalhe: 'Destinatário inválido.' }
    }

    const host = this.opcoes.host?.trim() ?? ''
    const simulado = this.opcoes.modoSimulado === true || host === ''

    try {
      if (simulado) {
        const transporte = nodemailer.createTransport({ jsonTransport: true })
        await transporte.sendMail({
          from: 'biblioteca@example.com',
          to: destinatario,
          subject: assunto,
          text: mensagem
        })
        return { enviado: true, detalhe: `Envio simulado para ${mascara}.` }
      }

      const usuario = this.opcoes.user?.trim() ?? ''
      const port = this.opcoes.port ?? 587
      const transporte = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        ...(usuario === ''
          ? {}
          : { auth: { user: usuario, pass: this.opcoes.password ?? '' } })
      })
      await transporte.sendMail({
        from: usuario === '' ? 'biblioteca@example.com' : usuario,
        to: destinatario,
        subject: assunto,
        text: mensagem
      })
      return { enviado: true, detalhe: `Mensagem enviada para ${mascara}.` }
    } catch {
      return { enviado: false, detalhe: `Falha no envio para ${mascara}.` }
    }
  }
}
