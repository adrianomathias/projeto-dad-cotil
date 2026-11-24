import express, { type Express } from 'express'
import cors from 'cors'
import { tratarErros } from './erros.js'
import type { CarteiraServicos } from './servicos/carteira.js'
import { criarRotas } from './rotas.js'

interface OpcoesApp {
  origemCors?: string
  servicos?: CarteiraServicos
}

export function createApp({ origemCors, servicos }: OpcoesApp = {}): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors({
    origin: origemCors === undefined ? false : [origemCors],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_requisicao, resposta) => {
    resposta.status(200).json({ status: 'ok' })
  })

  if (servicos !== undefined) app.use('/api', criarRotas(servicos))

  app.use((_requisicao, resposta) => {
    resposta.status(404).json({
      erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' }
    })
  })
  app.use(tratarErros)

  return app
}
