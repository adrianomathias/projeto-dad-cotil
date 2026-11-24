import type { ResumoDashboard } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'

function contar(db: Banco, sql: string, parametros: Array<string | number> = []): number {
  return (db.prepare(sql).get(...parametros) as { total: number }).total
}

export class ServicoDashboard {
  constructor(private readonly db: Banco) {}

  resumo(): ResumoDashboard {
    const dias = (this.db.prepare('SELECT antecedencia_aviso_dias FROM configuracoes WHERE id = 1').get() as
      { antecedencia_aviso_dias: number }).antecedencia_aviso_dias
    return {
      totalTitulos: contar(this.db, 'SELECT COUNT(*) AS total FROM livros WHERE deleted_at IS NULL'),
      totalExemplares: contar(this.db, "SELECT COUNT(*) AS total FROM exemplares WHERE deleted_at IS NULL AND status <> 'inativo'"),
      leitoresAtivos: contar(this.db, 'SELECT COUNT(*) AS total FROM leitores WHERE deleted_at IS NULL AND ativo = 1'),
      emprestimosAtivos: contar(this.db, "SELECT COUNT(*) AS total FROM emprestimos WHERE status = 'aberto'"),
      emprestimosAtrasados: contar(this.db, "SELECT COUNT(*) AS total FROM emprestimos WHERE status = 'aberto' AND data_devolucao_prevista < date('now')"),
      emprestimosVencendo: contar(this.db, "SELECT COUNT(*) AS total FROM emprestimos WHERE status = 'aberto' AND data_devolucao_prevista BETWEEN date('now') AND date('now', ?)", [`+${dias} days`]),
      reservasAguardando: contar(this.db, "SELECT COUNT(*) AS total FROM reservas WHERE status = 'aguardando'"),
      reservasParaRetirada: contar(this.db, "SELECT COUNT(*) AS total FROM reservas WHERE status = 'disponivel_para_retirada'"),
      multasAbertasCentavos: (this.db.prepare("SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM multas WHERE status = 'pendente'").get() as { total: number }).total
    }
  }

  resumoLeitor(leitorId: number): {
    emprestimosAtivos: number
    emprestimosAtrasados: number
    reservasAtivas: number
    reservasParaRetirada: number
    multasAbertasCentavos: number
  } {
    return {
      emprestimosAtivos: contar(this.db, "SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ? AND status = 'aberto'", [leitorId]),
      emprestimosAtrasados: contar(this.db, "SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ? AND status = 'aberto' AND data_devolucao_prevista < date('now')", [leitorId]),
      reservasAtivas: contar(this.db, "SELECT COUNT(*) AS total FROM reservas WHERE leitor_id = ? AND status IN ('aguardando','disponivel_para_retirada')", [leitorId]),
      reservasParaRetirada: contar(this.db, "SELECT COUNT(*) AS total FROM reservas WHERE leitor_id = ? AND status = 'disponivel_para_retirada'", [leitorId]),
      multasAbertasCentavos: (this.db.prepare("SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM multas WHERE leitor_id = ? AND status = 'pendente'").get(leitorId) as { total: number }).total
    }
  }
}
