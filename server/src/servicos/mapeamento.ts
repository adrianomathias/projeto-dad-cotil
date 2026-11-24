import type {
  Agendamento, Autor, Categoria, Configuracoes, Editora, Emprestimo, Endereco, Exemplar,
  Leitor, Multa, Notificacao, PagamentoMulta, Reserva, Usuario
} from '@biblioteca/shared'

export type Linha = Record<string, unknown>

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor)
}

function textoOuNulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : texto(valor)
}

function numero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(valor ?? 0)
}

function booleano(valor: unknown): boolean {
  return numero(valor) === 1
}

export function mapearAutor(linha: Linha): Autor {
  return { id: numero(linha.id), nome: texto(linha.nome), deletedAt: textoOuNulo(linha.deleted_at) }
}

export function mapearEditora(linha: Linha): Editora {
  return { id: numero(linha.id), nome: texto(linha.nome), deletedAt: textoOuNulo(linha.deleted_at) }
}

export function mapearCategoria(linha: Linha): Categoria {
  return { id: numero(linha.id), nome: texto(linha.nome), deletedAt: textoOuNulo(linha.deleted_at) }
}

export function mapearExemplar(linha: Linha): Exemplar {
  return {
    id: numero(linha.id),
    livroId: numero(linha.livro_id),
    tituloLivro: textoOuNulo(linha.titulo_livro) ?? undefined,
    codigoTombamento: texto(linha.codigo_tombamento),
    estadoConservacao: texto(linha.estado_conservacao) as Exemplar['estadoConservacao'],
    status: texto(linha.status) as Exemplar['status'],
    localizacao: textoOuNulo(linha.localizacao),
    adquiridoEm: textoOuNulo(linha.adquirido_em),
    deletedAt: textoOuNulo(linha.deleted_at)
  }
}

export function mapearEndereco(linha: Linha): Endereco {
  return {
    id: numero(linha.id),
    leitorId: numero(linha.leitor_id),
    cep: texto(linha.cep),
    logradouro: texto(linha.logradouro),
    numero: textoOuNulo(linha.numero),
    complemento: textoOuNulo(linha.complemento),
    bairro: textoOuNulo(linha.bairro),
    cidade: texto(linha.cidade),
    uf: texto(linha.uf)
  }
}

export function mapearLeitor(linha: Linha): Leitor {
  return {
    id: numero(linha.id),
    nome: texto(linha.nome),
    cpfMascara: texto(linha.cpf_mascara),
    email: textoOuNulo(linha.email),
    telefone: textoOuNulo(linha.telefone),
    ativo: booleano(linha.ativo),
    endereco: linha.endereco_id === undefined || linha.endereco_id === null ? null : mapearEndereco({
      id: linha.endereco_id, leitor_id: linha.leitor_id, cep: linha.cep, logradouro: linha.logradouro,
      numero: linha.numero, complemento: linha.complemento, bairro: linha.bairro,
      cidade: linha.cidade, uf: linha.uf
    }),
    emprestimosAtivos: numero(linha.emprestimos_ativos),
    reservasAtivas: numero(linha.reservas_ativas),
    multaEmAbertoCentavos: numero(linha.multa_em_aberto_centavos),
    deletedAt: textoOuNulo(linha.deleted_at),
    excluidoEm: textoOuNulo(linha.excluido_em)
  }
}

export function mapearUsuario(linha: Linha): Usuario {
  return {
    id: numero(linha.id),
    leitorId: linha.leitor_id === null || linha.leitor_id === undefined ? null : numero(linha.leitor_id),
    nome: texto(linha.nome),
    email: texto(linha.email),
    perfil: texto(linha.perfil) as Usuario['perfil'],
    ativo: booleano(linha.ativo),
    somenteLeitura: booleano(linha.somente_leitura),
    ultimoLoginEm: textoOuNulo(linha.ultimo_login_em),
    deletedAt: textoOuNulo(linha.deleted_at)
  }
}

export function mapearEmprestimo(linha: Linha): Emprestimo {
  return {
    id: numero(linha.id),
    exemplarId: numero(linha.exemplar_id),
    leitorId: numero(linha.leitor_id),
    registradoPorUsuarioId: numero(linha.registrado_por_usuario_id),
    dataEmprestimo: texto(linha.data_emprestimo),
    dataDevolucaoPrevista: texto(linha.data_devolucao_prevista),
    dataDevolucaoReal: textoOuNulo(linha.data_devolucao_real),
    renovacoes: numero(linha.renovacoes),
    status: texto(linha.status) as Emprestimo['status'],
    observacao: textoOuNulo(linha.observacao),
    tituloLivro: textoOuNulo(linha.titulo_livro) ?? undefined,
    nomeLeitor: textoOuNulo(linha.nome_leitor) ?? undefined,
    codigoTombamento: textoOuNulo(linha.codigo_tombamento) ?? undefined,
    diasAtraso: numero(linha.dias_atraso),
    valorMultaCentavos: numero(linha.valor_multa_centavos)
  }
}

export function mapearReserva(linha: Linha): Reserva {
  return {
    id: numero(linha.id),
    livroId: numero(linha.livro_id),
    leitorId: numero(linha.leitor_id),
    entradaEm: texto(linha.entrada_em),
    status: texto(linha.status) as Reserva['status'],
    notificadoEm: textoOuNulo(linha.notificado_em),
    prazoRetiradaInicio: textoOuNulo(linha.prazo_retirada_inicio),
    prazoRetiradaFim: textoOuNulo(linha.prazo_retirada_fim),
    exemplarDestinadoId: linha.exemplar_destinado_id === null || linha.exemplar_destinado_id === undefined
      ? null : numero(linha.exemplar_destinado_id),
    emprestimoId: linha.emprestimo_id === null || linha.emprestimo_id === undefined
      ? null : numero(linha.emprestimo_id),
    tituloLivro: textoOuNulo(linha.titulo_livro) ?? undefined,
    nomeLeitor: textoOuNulo(linha.nome_leitor) ?? undefined,
    posicao: linha.posicao === undefined ? undefined : numero(linha.posicao)
  }
}

export function mapearAgendamento(linha: Linha): Agendamento {
  return {
    id: numero(linha.id),
    exemplarId: numero(linha.exemplar_id),
    leitorId: numero(linha.leitor_id),
    dataAgendada: texto(linha.data_agendada),
    validadeAte: texto(linha.validade_ate),
    status: texto(linha.status) as Agendamento['status'],
    tituloLivro: textoOuNulo(linha.titulo_livro) ?? undefined,
    nomeLeitor: textoOuNulo(linha.nome_leitor) ?? undefined
  }
}

export function mapearMulta(linha: Linha): Multa {
  return {
    id: numero(linha.id),
    emprestimoId: numero(linha.emprestimo_id),
    leitorId: numero(linha.leitor_id),
    diasAtraso: numero(linha.dias_atraso),
    valorCentavos: numero(linha.valor_centavos),
    status: texto(linha.status) as Multa['status'],
    registradaEm: texto(linha.registrada_em),
    nomeLeitor: textoOuNulo(linha.nome_leitor) ?? undefined,
    tituloLivro: textoOuNulo(linha.titulo_livro) ?? undefined
  }
}

export function mapearPagamento(linha: Linha): PagamentoMulta {
  return {
    id: numero(linha.id),
    multaId: numero(linha.multa_id),
    valorCentavos: numero(linha.valor_centavos),
    forma: texto(linha.forma) as PagamentoMulta['forma'],
    registradoPorUsuarioId: numero(linha.registrado_por_usuario_id),
    registradoEm: texto(linha.registrado_em)
  }
}

export function mapearNotificacao(linha: Linha): Notificacao {
  return {
    id: numero(linha.id),
    leitorId: numero(linha.leitor_id),
    tipo: texto(linha.tipo) as Notificacao['tipo'],
    canal: texto(linha.canal) as Notificacao['canal'],
    status: texto(linha.status) as Notificacao['status'],
    destinatarioMascara: texto(linha.destinatario_mascara),
    criadoEm: texto(linha.criado_em),
    enviadoEm: textoOuNulo(linha.enviado_em),
    tentativas: numero(linha.tentativas)
  }
}

export function mapearConfiguracoes(linha: Linha): Configuracoes {
  return {
    prazoEmprestimoDias: numero(linha.prazo_emprestimo_dias),
    limiteExemplaresPorLeitor: numero(linha.limite_exemplares_por_leitor),
    prazoRenovacaoDias: numero(linha.prazo_renovacao_dias),
    limiteReservasAtivas: numero(linha.limite_reservas_ativas),
    prazoRetiradaHoras: numero(linha.prazo_retirada_horas),
    antecedenciaAvisoDias: numero(linha.antecedencia_aviso_dias),
    horaAvisoAtraso: texto(linha.hora_aviso_atraso),
    valorDiarioMultaCentavos: numero(linha.valor_diario_multa_centavos),
    tetoMultaCentavos: numero(linha.teto_multa_centavos),
    diasMaxAgendamento: numero(linha.dias_max_agendamento),
    timezone: texto(linha.timezone)
  }
}

export function hojeIso(): string {
  return new Date().toISOString()
}

export function dataAtual(): string {
  return new Date().toISOString().slice(0, 10)
}
