import { createApp } from './app.js'
import { carregarConfiguracao } from './config.js'
import { criarContexto } from './servicos/index.js'
import { Agendador } from './agendador.js'

function iniciarServidor(): void {
  const config = carregarConfiguracao()
  const contexto = criarContexto()
  const app = createApp({ origemCors: config.origemCors, servicos: contexto.servicos })
  const servidor = app.listen(config.porta, () => {
    console.log(`Servidor ouvindo na porta ${config.porta}`)
  })

  const agendador = new Agendador(contexto.servicos)
  if (contexto.executarAgendador) agendador.iniciar()

  servidor.on('error', (erro: NodeJS.ErrnoException) => {
    const mensagem = erro.code === 'EADDRINUSE'
      ? `A porta ${config.porta} já está em uso.`
      : erro.code === 'EACCES'
        ? `Sem permissão para usar a porta ${config.porta}.`
        : 'Não foi possível iniciar o servidor HTTP.'
    console.error(mensagem)
    process.exitCode = 1
  })

  let encerrando = false
  const encerrar = (): void => {
    if (encerrando) return
    encerrando = true
    agendador.parar()

    const limite = setTimeout(() => {
      console.error('Tempo limite de encerramento atingido.')
      process.exitCode = 1
      servidor.closeAllConnections()
    }, 10_000)
    limite.unref()

    servidor.close((erro) => {
      clearTimeout(limite)
      contexto.conexao.fechar()
      if (erro !== undefined) {
        console.error('Não foi possível encerrar o servidor HTTP.')
        process.exitCode = 1
      }
    })
  }

  process.on('SIGINT', encerrar)
  process.on('SIGTERM', encerrar)
}

try {
  iniciarServidor()
} catch (erro: unknown) {
  console.error(erro instanceof Error ? erro.message : 'Não foi possível iniciar o servidor.')
  process.exitCode = 1
}
