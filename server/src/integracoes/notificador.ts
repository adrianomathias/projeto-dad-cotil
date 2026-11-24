import nodemailer from 'nodemailer'

export interface ResultadoEnvio {
  enviado: boolean
  detalhe?: string
}

interface OpcoesNotificador {
  apiKey?: string
  remetente?: string
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

    const apiKey = this.opcoes.apiKey?.trim() ?? ''
    const host = this.opcoes.host?.trim() ?? ''
    const simulado = this.opcoes.modoSimulado === true || (apiKey === '' && host === '')

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

      if (apiKey !== '') {
        const remetente = this.opcoes.remetente?.trim() || 'Biblioteca Comunitária <onboarding@resend.dev>'
        const resposta = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: remetente,
            to: [destinatario],
            subject: assunto,
            text: mensagem
          })
        })

        if (!resposta.ok) {
          return { enviado: false, detalhe: `API de e-mail retornou status ${resposta.status} para ${mascara}.` }
        }

        return { enviado: true, detalhe: `E-mail enviado via API para ${mascara}.` }
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
      return { enviado: true, detalhe: `Mensagem enviada via SMTP para ${mascara}.` }
    } catch {
      return { enviado: false, detalhe: `Falha no envio para ${mascara}.` }
    }
  }
}