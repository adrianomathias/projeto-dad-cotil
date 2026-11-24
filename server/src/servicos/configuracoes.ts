import type { Configuracoes } from '@biblioteca/shared'
import type { Banco } from '../banco/conexao.js'
import { ErroDeDominio } from '../erros.js'
import { mapearConfiguracoes, hojeIso } from './mapeamento.js'
import { Validador } from './validacao.js'

const CAMPOS = {
  prazoEmprestimoDias: 'prazo_emprestimo_dias',
  limiteExemplaresPorLeitor: 'limite_exemplares_por_leitor',
  prazoRenovacaoDias: 'prazo_renovacao_dias',
  limiteReservasAtivas: 'limite_reservas_ativas',
  prazoRetiradaHoras: 'prazo_retirada_horas',
  antecedenciaAvisoDias: 'antecedencia_aviso_dias',
  horaAvisoAtraso: 'hora_aviso_atraso',
  valorDiarioMultaCentavos: 'valor_diario_multa_centavos',
  tetoMultaCentavos: 'teto_multa_centavos',
  diasMaxAgendamento: 'dias_max_agendamento',
  timezone: 'timezone'
} as const

const COLUNAS_AUDITORIA: Readonly<Record<string, string>> = {
  ...CAMPOS,
  atualizadoEm: 'atualizado_em',
  atualizadoPorUsuarioId: 'atualizado_por_usuario_id'
}

type CampoConfiguracao = keyof typeof CAMPOS

export class ServicoConfiguracoes {
  constructor(private readonly db: Banco) {}

  obter(): Configuracoes {
    const linha = this.db.prepare('SELECT * FROM configuracoes WHERE id = 1').get() as Record<string, unknown> | undefined
    if (linha === undefined) throw new Error('Configuração inicial não encontrada.')
    return mapearConfiguracoes(linha)
  }

  linhaAtual(): Record<string, unknown> {
    const linha = this.db.prepare('SELECT * FROM configuracoes WHERE id = 1').get() as Record<string, unknown> | undefined
    if (linha === undefined) throw new Error('Configuração inicial não encontrada.')
    return linha
  }

  atualizar(dados: Record<string, unknown>, usuarioId: number): Configuracoes {
    const atual = this.linhaAtual()
    const alteracoes: Record<string, string | number> = {
      atualizadoEm: hojeIso(),
      atualizadoPorUsuarioId: usuarioId
    }
    const auditadas: Array<{ campo: string; anterior: string | null; novo: string | null }> = []

    for (const campo of Object.keys(CAMPOS) as CampoConfiguracao[]) {
      if (dados[campo] === undefined) continue
      let valor: string | number
      if (campo === 'horaAvisoAtraso') {
        const texto = Validador.texto(dados[campo], campo, { obrigatorio: true, max: 5 })
        if (texto === undefined || !/^([01]\d|2[0-3]):[0-5]\d$/.test(texto)) {
          throw ErroDeDominio.validacao('Use a hora no formato 08:00.', { [campo]: 'HH:MM' })
        }
        valor = texto
      } else if (campo === 'timezone') {
        const texto = Validador.texto(dados[campo], campo, { obrigatorio: true, min: 3, max: 60 })
        if (texto === undefined) throw ErroDeDominio.validacao('Fuso horário inválido.', { [campo]: 'Informe o fuso.' })
        valor = texto
      } else {
        const numero = Validador.inteiro(dados[campo], campo, { obrigatorio: true, min: 0, max: 100000 })
        if (numero === undefined) throw ErroDeDominio.validacao('Valor inválido.', { [campo]: 'Informe um número.' })
        valor = numero
      }
      alteracoes[campo] = valor
      const anterior = atual[CAMPOS[campo]]
      if (anterior !== valor) {
        auditadas.push({ campo: CAMPOS[campo], anterior: String(anterior), novo: String(valor) })
      }
    }

    const transacao = this.db.transaction(() => {
      const pares = Object.entries(alteracoes).filter(([campo]) => COLUNAS_AUDITORIA[campo] !== undefined)
      const atribuicoes = pares.map(([campo]) => `${COLUNAS_AUDITORIA[campo]} = ?`).join(', ')
      this.db.prepare(`UPDATE configuracoes SET ${atribuicoes} WHERE id = 1`)
        .run(...pares.map(([, valor]) => valor))

      const inserirAuditoria = this.db.prepare(`
        INSERT INTO configuracoes_auditoria
          (configuracao_id, alterado_por_usuario_id, alterado_em, campo, valor_anterior, valor_novo)
        VALUES (1, ?, ?, ?, ?, ?)
      `)
      for (const audited of auditadas) {
        inserirAuditoria.run(usuarioId, alteracoes['atualizadoEm'], audited.campo, audited.anterior, audited.novo)
      }
    })
    transacao()
    return this.obter()
  }
}
