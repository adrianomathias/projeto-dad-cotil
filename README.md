# Biblioteca Comunitária — Projeto Final de DAD

Sistema completo de gestão de biblioteca comunitária: API REST em Node/TypeScript, banco SQLite relacional, regras de negócio em classes, integrações externas e aplicativo desktop Electron + React + TypeScript.

Repositório de origem: https://github.com/adrianomathias/projeto-dad-cotil

## O que está implementado

- **API REST** com autenticação JWT, dois perfis (`ADMIN`, `LEITOR`) e CRUD completo de livros, autores, editoras, categorias, exemplares, leitores, usuários e endereços.
- **Regras da biblioteca**: empréstimos de 14 dias, limite de 3 exemplares, 1 renovação de 7 dias bloqueada quando há fila, atraso e multa de R$ 0,50/dia limitada a R$ 15,00, pagamentos parciais, perdão e estorno.
- **Reservas FIFO** com notificação na devolução, retirada em 24 horas prorrogada para o próximo dia útil e liberação automática para o próximo da fila.
- **Agendamentos** separados das reservas, limitados a 3 dias pela política configurável.
- **Lembretes automáticos** por e-mail antes do vencimento e avisos de atraso, com idempotência para não repetir mensagens.
- **Busca de leitor por nome ou CPF** usando HMAC; o CPF completo nunca é exibido nem trafega nas respostas.
- **Integrações**: Open Library e Google Books como fallback (busca por nome/ISBN e importação automática para o catálogo), ViaCEP (endereço), BrasilAPI (feriados) e a própria API consumida pelo Electron.
- **Segurança**: senha com scrypt, CPF e telefone cifrados em AES-256-GCM, JWT HS256, validação de entrada, CORS restrito, controle de acesso por perfil e por titular dos dados, consentimento de WhatsApp explícito e revogável.
- **Histórico preservado**: inativações e cancelamentos são lógicos; multas e pagamentos nunca são apagados.
- **Interface desktop** com login para equipe e leitor, tema claro em vinho/bege retomado do projeto anterior, ícones SVG consistentes, layout responsivo, abas laterais, filtros, busca, formulários com confirmação, estados de carregamento e mensagens acessíveis.

## Arquitetura

```text
biblioteca-comunitaria/
├── app/       Electron + React + TypeScript (renderer, preload e main)
├── server/    Express + TypeScript (banco, regras, integrações e rotas)
├── shared/    DTOs e tipos usados por app e servidor
├── docs/      contrato da API, modelo relacional, manual e cobertura
├── .env.example
└── CONTEXTO.md
```

O aplicativo **não** acessa o banco diretamente. Ele recebe a base da API pelo preload (`window.biblioteca.apiUrl`) e conversa com o servidor por HTTP. O servidor usa SQLite via `better-sqlite3` em um arquivo local configurável.

## Requisitos

- Node.js **22 ou superior** e npm (o `better-sqlite3` 13 e o `concurrently` 10 exigem essa versão).
- Windows, macOS ou Linux.
- Para instalação nativa do `better-sqlite3` a partir do código-fonte, são necessários Python e ferramentas C++ do Visual Studio. Nesta máquina o binário pré-compilado foi carregado com `--ignore-scripts` e validado por `npm.cmd run test:sqlite -w @biblioteca/server`.

No PowerShell do Windows use `npm.cmd` (o `npm.ps1` pode ser bloqueado pela política de execução).

## Preparação

```powershell
npm.cmd install
Copy-Item -LiteralPath '.env.example' -Destination '.env'
npm.cmd run build
npm.cmd run dev
```

Se aparecer `Error: Electron uninstall` ao rodar `npm.cmd run dev`, o binário do Electron não foi baixado (normalmente porque a instalação foi feita com `--ignore-scripts`). O `package.json` já libera o script de instalação do Electron; em uma instalação limpa isso não deve acontecer. Se acontecer, execute uma vez:

```powershell
node node_modules\electron\install.js
```

Depois rode `npm.cmd run dev` novamente. Não use `--ignore-scripts` na instalação do Electron.

Ajuste o `.env` conforme seu ambiente. O login inicial em desenvolvimento é:

```text
Administrador:
E-mail: admin@biblioteca.local
Senha:  Admin@123

Cliente/leitor:
CPF:    529.982.247-25
Senha:  Leitor@123
```

A senha dos leitores de exemplo pode ser alterada com `LEITOR_SENHA_INICIAL` no `.env`. Em `NODE_ENV=production` a senha administrativa e as chaves `JWT_SECRET`, `CPF_CRYPTO_KEY` e `CPF_HMAC_KEY` são obrigatórias. Nunca use dados reais de CPF, e-mail ou telefone nos exemplos.

Na tela de login há cadastro público de leitor e cadastro de administrador por convite. O CPF do cadastro de leitor passa pela validação dos dígitos e por consulta à BrasilAPI (com fallback para ReceitaWS); o e-mail precisa estar na lista de provedores permitidos e a conta já nasce ativa, com sessão iniciada — não há verificação por código. Para criar administradores, entre como `ADMIN`, abra **Usuários → Convites de administrador**, gere um código de 12 caracteres e entregue-o apenas à pessoa autorizada; ele vale 24 horas e tem uso único. Em **Usuários → Administrador da biblioteca** é possível informar o e-mail e a senha definitivos do cliente: a nova conta ADMIN é ativada e a conta local é inativada sem apagar o histórico. Detalhes em `docs/manual-do-usuario.md` e `docs/contrato-api.md`.

### CORS no Electron

- Desenvolvimento: `CORS_ORIGIN=http://localhost:5173` (origem do Vite usada pelo electron-vite).
- Aplicativo empacotado com `file://`: `CORS_ORIGIN=null`, que libera somente a origem opaca do renderer local.
- Sem `CORS_ORIGIN`, nenhuma origem de navegador recebe permissão CORS.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm.cmd run dev` | Inicia servidor e aplicativo juntos |
| `npm.cmd run dev:server` | Somente servidor em modo de desenvolvimento |
| `npm.cmd run dev:app` | Somente aplicativo Electron |
| `npm.cmd run typecheck` | Verifica os tipos de `app`, `server` e `shared` |
| `npm.cmd run build` | Compila `shared`, `server` e `app` nessa ordem |
| `npm.cmd test -w @biblioteca/server` | Compila e executa a suíte completa do servidor |
| `npm.cmd run test:sqlite -w @biblioteca/server` | Diagnóstico do driver SQLite nativo |
| `npm.cmd start` | Inicia o servidor compilado |

## Documentação

- [Cobertura dos requisitos e justificativa de segurança](docs/cobertura-requisitos.md)
- [Contrato da API REST](docs/contrato-api.md)
- [Modelo relacional](docs/modelo-relacional.md)
- [Manual do usuário](docs/manual-do-usuario.md)
- [Contexto e organização original](CONTEXTO.md)

O documento `server/REVISAO_BACKEND.md` registra a revisão histórica do ZIP inicial; o estado atual está neste README e na cobertura de requisitos.

## Observações de execução

- O banco e as chaves locais ficam em `data/` (ignorado pelo Git). O seed cria o admin, as configurações e, fora de produção, exemplos de acervo e leitores fictícios.
- Livros sem capa gravada recebem automaticamente a URL do endpoint público de imagens do Google Books, montada a partir do ISBN (`https://books.google.com/books/content?vid=ISBN...`). O aplicativo aplica a mesma URL como fallback imediato quando o registro ainda não foi atualizado no banco. Se a imagem falhar, mostra o substituto acessível.
- O agendador roda junto com o servidor por padrão. Use `EXECUTAR_AGENDADOR=0` para desativá-lo em testes manuais.
- O envio de e-mail é simulado quando `SMTP_HOST` não é configurado ou `MODO_SIMULADO_EMAIL=1`. Nenhum e-mail real é enviado nesse modo.
- Nenhum commit, push ou alteração de identidade Git foi feito automaticamente.
