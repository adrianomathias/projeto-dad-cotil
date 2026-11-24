import type { CarteiraServicos } from './servicos/carteira.js'

const INTERVALO_MS = 60 * 60 * 1000

/**
 * Tarefas periódicas: lembretes antes do vencimento, aviso de atraso e
 * liberação de reservas/agendamentos vencidos. Usa idempotência para não repetir avisos.
 */
export class Agendador {
  private timer: ReturnType<typeof setInterval> | undefined
  private executando = false

  constructor(private readonly servicos: CarteiraServicos) {}

  iniciar(): void {
    if (this.timer !== undefined) return
    void this.executar()
    this.timer = setInterval(() => void this.executar(), INTERVALO_MS)
    this.timer.unref()
  }

  parar(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  async executar(): Promise<void> {
    if (this.executando) return
    this.executando = true
    try {
      const politica = this.servicos.configuracoes.obter()
      for (let dias = 1; dias <= politica.antecedenciaAvisoDias; dias += 1) {
        for (const emprestimo of this.servicos.emprestimos.listarParaAviso(dias)) {
          const leitor = this.dbDoLeitor(emprestimo.leitorId)
          if (leitor === undefined || leitor.email === null || leitor.email === '') continue
          await this.servicos.notificacoes.registrar({
            leitorId: emprestimo.leitorId,
            tipo: 'lembrete_vencimento',
            destinatario: leitor.email,
            assunto: `Devolução de "${emprestimo.tituloLivro ?? 'livro'}" em ${dias} dia(s)`,
            mensagem: `Olá, ${leitor.nome}. O livro "${emprestimo.tituloLivro ?? ''}" deve ser devolvido em ${emprestimo.dataDevolucaoPrevista}.`,
            chaveIdempotencia: `lembrete-${emprestimo.id}-${emprestimo.dataDevolucaoPrevista}`,
            emprestimoId: emprestimo.id
          })
        }
      }

      // O aviso de atraso só sai depois da hora configurada no fuso da biblioteca.
      if (this.horaAtual(politica.timezone) >= politica.horaAvisoAtraso) {
        for (const emprestimo of this.servicos.emprestimos.listarAtrasados()) {
          const leitor = this.dbDoLeitor(emprestimo.leitorId)
          if (leitor === undefined || leitor.email === null || leitor.email === '') continue
          await this.servicos.notificacoes.registrar({
            leitorId: emprestimo.leitorId,
            tipo: 'atraso',
            destinatario: leitor.email,
            assunto: `Devolução atrasada: "${emprestimo.tituloLivro ?? 'livro'}"`,
            mensagem: `Olá, ${leitor.nome}. O prazo de devolução de "${emprestimo.tituloLivro ?? ''}" terminou em ${emprestimo.dataDevolucaoPrevista}. Procure a biblioteca.`,
            chaveIdempotencia: `atraso-${emprestimo.id}-${emprestimo.dataDevolucaoPrevista}`,
            emprestimoId: emprestimo.id
          })
        }
      }

      this.servicos.reservas.expirarAgendamentos()
      await this.servicos.reservas.expirarVencidas()
    } catch (erro: unknown) {
      console.error('Falha ao executar tarefas agendadas.', erro instanceof Error ? erro.name : 'Erro desconhecido')
    } finally {
      this.executando = false
    }
  }

  private horaAtual(timeZone: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date())
  }

  private dbDoLeitor(id: number): { nome: string; email: string | null } | undefined {
    return this.servicos.pessoas.dadosContatoLeitor(id)
  }
}
