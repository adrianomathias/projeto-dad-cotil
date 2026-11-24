function comoData(valor: string): Date {
  return new Date(`${valor.slice(0, 10)}T12:00:00Z`)
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

export function agoraIso(): string {
  return new Date().toISOString()
}

export function adicionarDias(data: string, dias: number): string {
  const resultado = comoData(data)
  resultado.setUTCDate(resultado.getUTCDate() + dias)
  return resultado.toISOString().slice(0, 10)
}

export function diasEntre(inicio: string, fim: string): number {
  const diferença = comoData(fim).getTime() - comoData(inicio).getTime()
  return Math.floor(diferença / 86_400_000)
}

export function dataHoraMaisHoras(instante: string, horas: number): string {
  return new Date(new Date(instante).getTime() + horas * 3_600_000).toISOString()
}

/** Fins de semana e feriados nacionais prorrogam o prazo de retirada. */
export function proximoDiaUtil(data: string, feriados: readonly string[] = []): string {
  let atual = data.slice(0, 10)
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const dia = comoData(atual).getUTCDay()
    if (dia !== 0 && dia !== 6 && !feriados.includes(atual)) return atual
    atual = adicionarDias(atual, 1)
  }
  return atual
}
