# Revisão do backend — Biblioteca Comunitária

Revisão realizada em 23/11/2026 sobre `projeto-dad-cotil-main.zip`. O código final está nesta cópia do projeto. A pasta preexistente `TesteProjetoWill` não foi alterada.

## Escopo real encontrado

Foram lidos `CONTEXTO.md`, `README.md`, `.env.example`, os manifests e configurações TypeScript, todo o backend e `shared`. Os arquivos de `app` foram consultados somente para verificar a integração.

A entrega do ZIP é a base técnica inicial. Existe apenas `GET /health`, que responde `{"status":"ok"}`. O Express também atende `HEAD /health` automaticamente. Não existem conexão de produção com SQLite, tabelas, migrations, repositórios, CRUD, autenticação ou serviços de negócio. `shared/src/index.ts` contém somente `export {}`.

O contexto prevê usuários e papéis, acervo, empréstimos, renovação, fila, agendamento, multas, configurações, notificações e integrações, mas essas funcionalidades ainda não foram implementadas. O modelo relacional da etapa 2 e os tipos da etapa 3 não estão no ZIP. Criar tabelas e endpoints agora exigiria inventar contratos e antecipar essas entregas; portanto, esta revisão corrige a base existente. Instruções de commit, identidade e envio presentes nos documentos foram tratadas como contexto: não houve commit, push ou alteração de identidade Git.

## Problemas encontrados e correções

| Área | Situação original | Resultado |
| --- | --- | --- |
| Express | Fábrica separada de `listen`, parser JSON limitado a 100 KB e `/health` corretos | Preservados; removido o cabeçalho `X-Powered-By` |
| Porta | `parseInt` aceitava `3000abc`, truncava decimais e não validava intervalo | Apenas dígitos e inteiro de 1 a 65535; padrão 3000 |
| Ambiente | README orientava criar `.env`, mas o servidor não o carregava | Carregamento nativo do `.env` da raiz, independente do diretório de execução; variáveis do processo têm prioridade |
| Falha de configuração | Ausência de validação e diagnóstico controlado | Configuração inválida impede inicialização e retorna código de saída 1 |
| Servidor HTTP | Erros de `listen` sem tratamento próprio | Diagnóstico para porta ocupada, permissão negada e falha genérica |
| Encerramento | Sem tratamento explícito de sinais | Fecha o servidor em SIGINT/SIGTERM; aguarda requisições por até 10 segundos |
| CORS | `CORS_ORIGIN` declarado e ignorado | Middleware `cors` com origem exata HTTP/HTTPS; sem configuração, nenhuma origem recebe permissão |
| Erros HTTP | Respostas padrão em HTML, com possível stack de desenvolvimento | JSON para 404, JSON inválido, limite do corpo, codificações inválidas e erros internos |
| Dados de erro | Sem contrato de erro nem filtro de exposição | `{ erro: { codigo, mensagem } }`; corpo, stack e mensagem interna não são enviados ao cliente |
| Runtime | README/raiz indicavam Node >=20, mas `better-sqlite3` 13.2.0 exige >=22 | `server/package.json` declara >=22; documentação e manifest da raiz permanecem como recebidos, com divergência registrada |
| TypeScript | `strict`, `NodeNext`, imports `.js`, `rootDir` e `outDir` coerentes | `server/tsconfig.json` revisado e preservado |
| SQL e CRUD | Nenhuma consulta, tabela ou operação implementada | Não há SQL de aplicação a corrigir; SQLite e versão da dependência preservados |
| Tipos compartilhados | Pacote vazio | Não é possível certificar compatibilidade de contratos de negócio; resposta existente de `/health` preservada |

O limite JSON continua sendo 100 KB. Não existe validação de campos de entidades, IDs ou regras de domínio porque nenhuma rota de negócio recebe esses dados nesta base. Validação de JSON não substitui essas futuras validações.

CORS controla quais origens podem ler respostas no navegador; não autentica nem impede clientes como curl de chamar a API. Nesta base, o preflight anuncia somente GET/HEAD e `Content-Type`. Os métodos e cabeçalhos precisam acompanhar os futuros contratos, incluindo autenticação, quando essas rotas forem implementadas.

## Arquivos corrigidos e código final

Arquivos originais modificados:

- `server/src/app.ts`: CORS, remoção da assinatura do Express, 404 e conexão com o tratador de erros; `/health` preservado.
- `server/src/index.ts`: configuração validada, diagnóstico de inicialização e encerramento.
- `server/package.json`: CORS e seus tipos, scripts de testes e requisito Node >=22.
- `package-lock.json`: somente os registros das novas dependências do backend e do workspace `server`. Nenhuma versão existente foi atualizada.

Arquivos adicionados:

- `server/src/config.ts`: carregamento do ambiente e validação de PORT/CORS_ORIGIN.
- `server/src/erros.ts`: tratamento central de erros.
- `server/test/http.test.mjs`: testes HTTP reais em portas temporárias.
- `server/test/config.test.mjs`: validação de configurações e `.env`.
- `server/test/processo.test.mjs`: processo compilado, porta ocupada e encerramento.
- `server/test/sqlite.check.mjs`: diagnóstico independente do driver nativo.
- `server/REVISAO_BACKEND.md`: este relatório e instruções de teste.

Os arquivos listados são o código final, sem pseudocódigo ou trechos a completar. `app/`, Electron, `shared/`, configurações TypeScript e documentação original da raiz não foram modificados.

## Instalação e execução no Windows

Ambiente da validação: Windows x64, Node v24.14.1 e npm 11.19.1. Versões resolvidas preservadas: Express 5.3.0, better-sqlite3 13.2.0 e TypeScript 5.9.3.

Execute os comandos na raiz desta cópia, onde ficam `app`, `server` e `shared`. No PowerShell, `npm.cmd` evita problemas com a política de execução de `npm.ps1`.

Instalação normal somente do backend:

```powershell
npm.cmd ci --workspace @biblioteca/server --include-workspace-root=false
```

A instalação original neste computador acionou `node-gyp rebuild` para `better-sqlite3` e falhou com `Could not find any Python installation to use`. Não ocorreu erro TypeScript ou SQL nessa fase. O pacote distribuído contém `prebuilds/win32-x64.node`, que foi carregado e testado com sucesso sem recompilação. O motivo exato de o npm acionar essa compilação não foi corrigido nesta revisão; não foram alterados npm, Python, Visual Studio ou configurações globais.

Alternativa validada para testar exclusivamente este backend com o binário distribuído:

```powershell
npm.cmd ci --workspace @biblioteca/server --include-workspace-root=false --ignore-scripts
npm.cmd run test:sqlite -w @biblioteca/server
```

`--ignore-scripts` por si só não garante funcionamento de módulos nativos: o teste acima é obrigatório para confirmar o carregamento. Não transforme essa opção em configuração global nem a aplique indiscriminadamente à instalação do Electron, que depende de seus próprios scripts. Se não houver binário compatível e for necessário compilar, o ambiente Windows precisará de Python detectável e ferramentas C++ do Visual Studio, conforme a [documentação oficial do node-gyp](https://github.com/nodejs/node-gyp#on-windows). O banco pertence ao servidor Node separado; não há motivo nesta arquitetura para recompilá-lo para o runtime do Electron.

Preparação, testes e execução:

```powershell
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
npm.cmd run typecheck -w @biblioteca/server
npm.cmd test -w @biblioteca/server
npm.cmd run test:sqlite -w @biblioteca/server
npm.cmd start
```

`npm test` já compila o servidor. Alternativa para desenvolvimento: `npm.cmd run dev:server`. Para compilar sem testes: `npm.cmd run build -w @biblioteca/server`. Não é necessário compilar ou abrir o Electron para testar a API.

Configuração inicial na raiz:

```dotenv
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

O `.env` é opcional. Se ele não existir, o servidor usa PORT do processo ou 3000, sem liberar CORS por padrão. Quando definida, `CORS_ORIGIN` deve conter uma origem exata, sem barra final, caminho, credenciais, query ou fragmento. A aplicação lê o arquivo tanto em `server/src` quanto em `server/dist`. `DATABASE_PATH` continua reservado para a futura camada de dados e não cria arquivo SQLite.

## Endpoints e exemplos

| Operação | Resposta |
| --- | --- |
| `GET /health` | 200, `{"status":"ok"}` |
| `HEAD /health` | 200, cabeçalhos sem corpo |
| `OPTIONS /health`, com origem permitida | 204, cabeçalhos de preflight CORS |
| Rota ou método não implementado, com requisição válida | 404, `ROTA_NAO_ENCONTRADA` |

`/health` verifica somente que o HTTP está respondendo: não certifica banco, tabelas ou integrações. O middleware CORS pode responder a preflights em outros caminhos; isso não cria endpoints de negócio. Erros de parsing podem ser devolvidos antes do 404.

Com o servidor aberto, execute em outro terminal:

```powershell
# Saúde: 200 e {"status":"ok"}
curl.exe -i http://localhost:3000/health

# HEAD: 200 e nenhum corpo
curl.exe -I http://localhost:3000/health

# Rota ausente: 404 e erro JSON
curl.exe -i http://localhost:3000/api/health

# JSON inválido: 400 e JSON_INVALIDO
curl.exe -i -X POST http://localhost:3000/health -H "Content-Type: application/json" --data-raw "{invalido"

# Sem operação de criação: 404 mesmo com JSON válido
curl.exe -i -X POST http://localhost:3000/health -H "Content-Type: application/json" --data-raw "{}"

# CORS: cabeçalho Access-Control-Allow-Origin igual ao configurado
curl.exe -i http://localhost:3000/health -H "Origin: http://localhost:5173"

# Origem diferente: continua 200, mas sem permissão CORS para leitura no navegador
curl.exe -i http://localhost:3000/health -H "Origin: https://outro.example"

# Preflight: 204, GET/HEAD e Content-Type
curl.exe -i -X OPTIONS http://localhost:3000/health -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: content-type"

# Corpo acima de 100 KB: 413
$corpo = '{"texto":"' + ('a' * 102400) + '"}'
$corpo | curl.exe -i -X POST http://localhost:3000/health -H "Content-Type: application/json" --data-binary "@-"

# Charset não suportado: 415
curl.exe -i -X POST http://localhost:3000/health -H "Content-Type: application/json; charset=iso-8859-1" --data-raw "{}"
```

Exemplo de resposta de erro:

```json
{
  "erro": {
    "codigo": "ROTA_NAO_ENCONTRADA",
    "mensagem": "Rota não encontrada."
  }
}
```

Outros códigos: `JSON_INVALIDO` (400), `REQUISICAO_INVALIDA` (400, inclusive gzip corrompido), `REQUISICAO_INTERROMPIDA` (400, quando ainda é possível responder), `TAMANHO_INVALIDO` (400), `CORPO_MUITO_GRANDE` (413), `CODIFICACAO_NAO_SUPORTADA` (415) e `ERRO_INTERNO` (500). Nenhuma rota artificial para provocar 500 foi incluída na aplicação; essa condição é exercitada numa aplicação exclusiva dos testes.

Para validar configuração, porta ocupada e encerramento automaticamente, use `npm.cmd test -w @biblioteca/server`. Manualmente, iniciar duas instâncias com a mesma PORT deve fazer a segunda sair com código 1; Ctrl+C encerra a primeira. PORT como `3000abc`, `0`, `65536` ou valor decimal deve impedir a inicialização.

## Resultados e limites da verificação

- Typecheck e build do backend concluídos.
- Suíte HTTP/configuração/processo: 19 testes aprovados, sem falhas ou testes ignorados.
- Diagnóstico SQLite: 1 teste aprovado, cobrindo criação de tabela temporária, inserção com parâmetros, leitura, atualização, rollback, reabertura do arquivo e exclusão. Uma string contendo SQL foi armazenada como dado, sem execução.
- A tabela `diagnostico` existe somente em um arquivo temporário do teste, removido ao final. Ela não é schema, migration ou CRUD do projeto e não é importada pela aplicação.
- Os testes HTTP precisaram de execução fora do isolamento da ferramenta, que inicialmente bloqueou `127.0.0.1` com `EACCES`. Executados com acesso local permitido, passaram.
- No teste de processo, o encerramento usa IPC para disparar o listener SIGTERM porque `child.kill()` no Windows não entrega sinais como no POSIX. O processo de produção não tem esse canal IPC adicional.
- Não foram executados build, telas ou fluxo completo do Electron. Não há funcionalidades de negócio disponíveis para testes ponta a ponta.

## Pendências para integração

1. **Dados e CRUD:** falta o modelo relacional, migrations, conexão de produção, repositórios e operações de domínio. O teste do driver não supre essas entregas. Futuras consultas devem usar parâmetros; nomes de colunas dinâmicos precisam de lista permitida. Históricos exigem exclusão lógica ou restrição conforme o contexto.
2. **Contratos compartilhados:** não há tipos para comparar com respostas de negócio. A equipe precisa definir entidades, payloads e erros em `shared` e o contrato REST/OpenAPI antes de integrar formulários e tabelas. O envelope de erro desta revisão deve ser incorporado ao contrato, se adotado pela equipe.
3. **Base da URL:** `.env.example` e Electron usam `http://localhost:3000/api`, enquanto a única rota existente é `/health`. Concatenar `/health` à base atual produz `/api/health`, que retorna 404. A consulta de saúde deve usar a raiz HTTP, ou a equipe deve definir um contrato de prefixos. Nenhum alias foi inventado.
4. **Origem do renderer:** `http://localhost:5173` precisa coincidir com a origem real do modo de desenvolvimento. O Electron empacotado usa `file://`, normalmente com origem `null`; essa origem não foi liberada. A integração de produção precisa definir o acesso via preload/main ou uma origem apropriada. Não houve alteração no Electron nem abertura irrestrita de CORS.
5. **Versão do Node:** o backend exige >=22, já declarado em seu manifest. README e `engines` da raiz ainda indicam >=20; a equipe deve alinhar essa documentação global. O `concurrently` 10.0.7 do lock original também exige >=22.
6. **Instalação nativa:** instalação normal encontrou falha de Python no Windows. O backend e o binário SQLite foram validados pela alternativa descrita; a compilação nativa não foi reparada no sistema operacional.
7. **Segurança de negócio:** autenticação, autorização ADMIN/LEITOR, isolamento de dados de leitores e regras transacionais ainda não existem. A base HTTP não representa a entrega de uma API de biblioteca pronta para uso real.

Referências técnicas consultadas: [tratamento de erros no Express 5](https://expressjs.com/en/guide/error-handling/), [erros do parser JSON](https://expressjs.com/en/resources/middleware/body-parser/#errors), [CORS](https://expressjs.com/en/resources/middleware/cors/), [carregamento nativo de .env](https://nodejs.org/api/process.html#processloadenvfilepath), [manifest oficial de better-sqlite3 13.2.0](https://github.com/WiseLibs/better-sqlite3/blob/v13.2.0/package.json) e [opções de npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
