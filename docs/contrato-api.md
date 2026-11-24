# Contrato da API REST — Biblioteca Comunitária

Base: `http://localhost:3000/api` (configurável em `VITE_API_URL` no Electron).
Todas as rotas abaixo estão sob essa base, exceto `GET /health` (na raiz HTTP).

## Convenções

- Corpo e resposta: JSON. Datas: `YYYY-MM-DD`. Instantes: ISO-8601 UTC.
- Autenticação: `Authorization: Bearer <token>` obtido em `POST /auth/login`.
- Erro: HTTP 4xx/5xx com `{ "erro": { "codigo": "...", "mensagem": "...", "detalhes": { "campo": "motivo" } } }`.
- Listas com filtro-uso respondem `{ "itens": [...], "total": n, "pagina": 1, "porPagina": 20 }`.
- Toda listagem aceita `situacao=todos|ativos|inativos`. O padrão é `todos` — registros inativos aparecem junto com os ativos. O parâmetro antigo `inativos=true` continua funcionando como atalho para `situacao=inativos`.
- Perfis: `ADMIN` (tudo) e `LEITOR` (somente leitura dos próprios dados e operações de reserva/agendamento próprias).
- `UsuarioLogado` inclui `somenteLeitura: boolean`. Contas com `somenteLeitura: true` podem usar apenas `GET`, `HEAD` e `OPTIONS`; qualquer escrita recebe `403 SEM_PERMISSAO` com a mensagem "Esta conta é somente para visualização.".
- CPF nunca aparece completo: somente `cpfMascara` (ex.: `***.456.789-**`).

## Autenticação

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/login` | público | Corpo `{ email, senha }`. Resposta `{ token, usuario }` (`LoginResposta`). Não há mais estado `EMAIL_NAO_VERIFICADO`: conta pendente não existe. |
| POST | `/auth/login-leitor` | público | Login do cliente: corpo `{ cpf, senha }` (aceita `identificador` como apelido). Busca a conta pelo hash do CPF. Resposta `{ token, usuario }` com `perfil: LEITOR`. |
| POST | `/auth/cadastro-leitor` | público | Corpo `{ nome, cpf, email, telefone, senha }` (campos de endereço opcionais, quando informados). Cria leitor, endereço e usuário ativo em **uma transação**: nada fica pendente e o cadastro já devolve sessão. `telefone` é obrigatório, aceita máscara, DDD nacional ou DDI explícito com `+` e é normalizado para `+DDI...`. Exige senha forte (10+ caracteres, maiúscula, minúscula, número e símbolo), CPF com dígitos locais válidos (com consulta BrasilAPI/ReceitaWS em produção; `VALIDAR_CPF_EXTERNO=0` apenas em dev/teste) e e-mail da allowlist abaixo. CPF repetido retorna `409 CPF_JA_CADASTRADO`; registros inativados liberam o número para recadastro. Resposta `201` com `{ mensagem, token, usuario }`; o token já inicia a sessão, no mesmo formato de `LoginResposta`. |
| POST | `/auth/cadastro-equipe` | público | Corpo `{ codigo, nome, email, senha }`. Exige convite administrativo de uso único (12 caracteres, gerado por ADMIN, armazenado como SHA-256, válido por 24 h, revogável e opcionalmente preso a um e-mail), senha forte e e-mail da mesma allowlist. O convite é consumido **imediatamente junto com a criação do usuário**, sem pendência nem confirmação posterior. Resposta `201` com `{ mensagem, token, usuario }`, com token de sessão no formato de `LoginResposta`. |
| GET | `/auth/me` | qualquer | Retorna `UsuarioLogado`. |
| POST | `/auth/ativar` | público | Corpo `{ email, codigo, novaSenha }` (aceita `senha` como apelido). Ativa usuário criado pelo ADMIN sem senha; é ativação administrativa, não verificação de e-mail. |

### Domínios de e-mail aceitos

Os cadastros públicos aceitam somente estes domínios, exatamente: `gmail.com`, `outlook.com`, `hotmail.com`, `live.com`, `yahoo.com`, `yahoo.com.br`, `icloud.com`, `uol.com.br`, `bol.com.br`.

A validação faz `trim`, ignora maiúsculas/minúsculas, exige exatamente um `@` com texto antes dele e compara o domínio de forma exata (sem sufixos ou subdomínios). Quando o domínio não atende à lista, a API responde com a mensagem: **"Use um e-mail Gmail, Outlook, Hotmail, Yahoo ou similar."**

Não existem as rotas `POST /auth/verificar-email`, `POST /auth/reenviar-verificacao` nem `POST /auth/cancelar-verificacao`. Não há código de 6 dígitos, pendência em memória, contagem de reenvio, cancelamento ao sair da tela nem atalho "Já cadastrei, mas não recebi o código": após o cadastro, a pessoa já entra no aplicativo com o token recebido.

## Catálogo (CRUD completo)

Para `autores`, `editoras`, `categorias`, `livros`, `exemplares`:

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/<entidade>` | ADMIN, LEITOR | Lista. Aceita `q`, `situacao`, `pagina`, `porPagina`; `livros` aceita `autorId`, `editoraId`, `categoriaId`, `disponivel=true|false`. |
| GET | `/<entidade>/:id` | ADMIN, LEITOR | Detalhe. |
| POST | `/<entidade>` | ADMIN | Cria. |
| PATCH | `/<entidade>/:id` | ADMIN | Atualiza somente campos permitidos. |
| DELETE | `/<entidade>/:id` | ADMIN | Inativa (`deleted_at`); nunca apaga histórico. Exceção: `DELETE /leitores/:id/definitivo`, que anonimiza os dados pessoais mantendo o histórico. |

Payloads de criação:

- `autores`, `editoras`, `categorias`: `{ nome }`.
- `livros`: `{ titulo, subtitulo?, isbn10?, isbn13?, editoraId?, anoPublicacao?, descricaoCurta?, capaUrl?, idioma?, autoresIds?: number[], categoriasIds?: number[], quantidadeExemplares?: number }`. `quantidadeExemplares` vai de `0` a `100`; se omitida, o cadastro cria `1` exemplar. Em `PATCH`, o número é ajustado inativando apenas exemplares `disponivel`; se não houver exemplares livres suficientes, a API responde `409 CONFLITO`.
- `exemplares`: `{ livroId, codigoTombamento, estadoConservacao, status?, localizacao?, adquiridoEm? }`. O tombamento é gerado automaticamente no formato `TOM-<livroId>-<sequência>`.

### Exclusão física segura

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| DELETE | `/:recurso/:id/exclusao-fisica` | ADMIN | Apaga definitivamente um registro **já inativo** e **sem vínculo histórico**. Recursos aceitos: `autores`, `editoras`, `categorias`, `livros`, `exemplares`, `leitores`, `usuarios`, `convites`, `emprestimos`, `reservas`, `agendamentos`, `multas`, `notificacoes`, `consentimentos-whatsapp`. Responde `204` sem corpo. |

Bloqueios: `400 DADOS_INVALIDOS` se o registro ainda estiver ativo ou o recurso não for permitido; `404 NAO_ENCONTRADO` se o id não existir; `409 CONFLITO` se houver histórico vinculado — nesse caso `erro.detalhes.vinculos` lista os motivos e nada é apagado.

## Pessoas (CRUD completo)

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/leitores` | ADMIN | Lista com `q` (nome **ou** CPF), `situacao`, `pagina`, `porPagina`. |
| GET | `/leitores/:id` | ADMIN | Detalhe com endereço e totais. |
| POST | `/leitores` | ADMIN | `{ nome, cpf, email?, telefone, cep?, logradouro?, numero?, complemento?, bairro?, cidade?, uf? }`. `telefone` é obrigatório e normalizado para `+DDI...`. |
| PATCH | `/leitores/:id` | ADMIN | Campos permitidos: nome, email, telefone, ativo, endereço. Se `telefone` for informado, é obrigatório e normalizado. |
| DELETE | `/leitores/:id` | ADMIN | Inativação lógica. |
| DELETE | `/leitores/:id/definitivo` | ADMIN | Exclusão definitiva: exige leitor já inativado; anonimiza CPF/e-mail/telefone/nome, apaga endereço e consentimentos e oculta o cadastro de todas as telas. `204` sem corpo; `400` se ainda estiver ativo, `404` se já excluído. O histórico anônimo permanece por auditoria. |
| GET | `/usuarios` | ADMIN | Lista (`q`, `pagina`, `porPagina`). |
| GET | `/usuarios/:id` | ADMIN | Detalhe sem segredos. |
| POST | `/usuarios` | ADMIN | `{ nome, email, perfil, leitorId?, senha? }`; sem senha, gera código de ativação. |
| PATCH | `/usuarios/:id` | ADMIN | nome, email, perfil, `leitorId`, ativo e `senha` opcional (senha forte com hash scrypt). Perfil `LEITOR` exige leitor vinculado. |
| DELETE | `/usuarios/:id` | ADMIN | Inativação lógica. |
| POST | `/admin/trocar-administrador` | ADMIN | Corpo `{ nome, email, senha }`. Cria o ADMIN do cliente já ativo e inativa o administrador local na mesma transação, preservando o histórico. Resposta `{ usuario, inativado: { id, nome, email } }`. |
| GET | `/enderecos` | ADMIN | Lista. |
| GET | `/enderecos/:id` | ADMIN | Detalhe. |
| POST | `/enderecos` | ADMIN | `{ leitorId, cep, logradouro, numero?, complemento?, bairro?, cidade, uf }`. |
| PATCH | `/enderecos/:id` | ADMIN | Campos do endereço. |
| DELETE | `/enderecos/:id` | ADMIN | Remove vínculo (restrição se operações dependentes). |

### Convites de administrador

Auto-registro de perfis privilegiados não é permitido: um administrador precisa gerar um convite individual de 12 caracteres. O código claro aparece **somente** na criação; o banco guarda apenas o hash SHA-256 e uma máscara. Cada convite vale 24 horas, tem uso único, pode ser revogado e pode ser limitado a um e-mail. O convite é consumido no mesmo instante em que `POST /auth/cadastro-equipe` cria o usuário, sem etapa de confirmação.

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/convites` | ADMIN | Lista os últimos 100 convites em `{ "itens": Convite[] }`, sem códigos completos. |
| POST | `/convites` | ADMIN | `{ perfil: 'ADMIN', email? }` → `{ codigo, convite }`. Qualquer outro perfil retorna `400 DADOS_INVALIDOS`. |
| DELETE | `/convites/:id` | ADMIN | Revoga um convite ainda não usado. |

`Convite`: `{ id, perfil, email, codigoMascara, criadoPorUsuarioId, criadoEm, expiraEm, usadoEm, revogadoEm, ativo }`.

## Operações

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/emprestimos` | ADMIN | Lista com `status=aberto|devolvido|cancelado`, `q`, `atrasados=true`, `vencendo=true`. |
| GET | `/emprestimos/:id` | ADMIN | Detalhe. |
| POST | `/emprestimos` | ADMIN | `{ leitorId, exemplarId, observacao? }`. Aplica limite, prazo e bloqueios. |
| PATCH | `/emprestimos/:id` | ADMIN | Atualiza `observacao`. |
| DELETE | `/emprestimos/:id` | ADMIN | Cancela (somente se aberto). |
| POST | `/emprestimos/:id/devolucao` | ADMIN | Registra devolução, calcula multa e promove a fila. |
| POST | `/emprestimos/:id/renovacao` | ADMIN | Uma renovação; bloqueada se houver fila. |
| GET | `/reservas` | ADMIN, LEITOR (próprias) | Lista com `livroId`, `leitorId`, `status`, `fila=true` (ordem FIFO). |
| GET | `/reservas/:id` | ADMIN, LEITOR (própria) | Detalhe. |
| POST | `/reservas` | ADMIN, LEITOR | `{ leitorId, livroId }`. Fila FIFO quando o livro está emprestado; agendamento separado quando disponível (use `/agendamentos`). |
| PATCH | `/reservas/:id` | ADMIN, LEITOR (própria) | Atualiza `status` para `cancelado`. |
| DELETE | `/reservas/:id` | ADMIN | Cancela. |
| POST | `/reservas/:id/retirada` | ADMIN | Confirma retirada do exemplar reservado e gera empréstimo. |
| GET | `/agendamentos` | ADMIN, LEITOR (próprios) | Lista. |
| GET | `/agendamentos/:id` | ADMIN, LEITOR (próprio) | Detalhe. |
| POST | `/agendamentos` | ADMIN, LEITOR | `{ leitorId, exemplarId, dataAgendada }` (até 3 dias à frente). |
| PATCH | `/agendamentos/:id` | ADMIN, LEITOR (próprio) | Cancela via `status: cancelado`. |
| DELETE | `/agendamentos/:id` | ADMIN | Cancela. |

No formulário **Nova reserva**, o campo **Livro** tem um botão que abre um modal com capa, título, descrição e demais metadados do livro (subtítulo, autores, categorias, ISBN-10/13, ano, idioma, editora quando disponível e exemplares totais/disponíveis). O modal reaproveita os dados já expostos pelo detalhe do livro e o padrão visual/acessível de `<dialog>` usado no restante da interface; não cria nova rota de API.

## Multas e configuração

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/multas` | ADMIN | Lista com `leitorId`, `status`. |
| GET | `/multas/:id` | ADMIN | Detalhe. |
| POST | `/multas` | ADMIN | Criação manual (`emprestimoId`, `diasAtraso`, `valorCentavos?`). |
| PATCH | `/multas/:id` | ADMIN | Perdão/estorno via `status`, `perdaoMotivo?`. |
| DELETE | `/multas/:id` | ADMIN | Estorna (nunca apaga). |
| GET | `/pagamentos-multa` | ADMIN | Lista. |
| GET | `/pagamentos-multa/:id` | ADMIN | Detalhe. |
| POST | `/pagamentos-multa` | ADMIN | `{ multaId, valorCentavos, forma }`. |
| PATCH | `/pagamentos-multa/:id` | ADMIN | Ajuste de comprovante. |
| DELETE | `/pagamentos-multa/:id` | ADMIN | Estorno (registra status da multa). |
| GET | `/configuracoes` | ADMIN, LEITOR | Política vigente. |
| PATCH | `/configuracoes` | ADMIN | Atualiza política com auditoria. |
| GET | `/notificacoes` | ADMIN, LEITOR (próprias) | Lista com `leitorId`, `status`, `tipo`. |
| GET | `/notificacoes/:id` | ADMIN, LEITOR (própria) | Detalhe. |
| POST | `/notificacoes` | ADMIN | Envio manual (`leitorId`, `tipo`, `mensagem`). |
| PATCH | `/notificacoes/:id` | ADMIN | Reenvio via `status: pendente`. |
| DELETE | `/notificacoes/:id` | ADMIN | Cancelamento lógico (status falhou com erro_resumo). |
| GET | `/consentimentos-whatsapp` | ADMIN, LEITOR (próprios) | Lista. |
| GET | `/consentimentos-whatsapp/:id` | ADMIN, LEITOR (próprio) | Detalhe. |
| POST | `/consentimentos-whatsapp` | ADMIN, LEITOR | `{ leitorId, telefone, consentimento: true, origem }`. |
| PATCH | `/consentimentos-whatsapp/:id` | ADMIN, LEITOR | Revogação (`consentimento: false`). |
| DELETE | `/consentimentos-whatsapp/:id` | ADMIN | Revoga em vez de apagar. |
| GET | `/auditoria-configuracoes` | ADMIN | Lista. |
| GET | `/auditoria-configuracoes/:id` | ADMIN | Detalhe. |

## Integrações (4 usos de API)

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/consulta/livros?q=&limite=` | ADMIN | Sugestões bibliográficas para cadastro: tenta Open Library e, se falhar ou não retornar itens, usa Google Books. Resposta `{ itens: LivroSugerido[] }`; se ambas falharem, HTTP 503 `SERVICO_INDISPONIVEL`. |
| POST | `/consulta/livros/importar` | ADMIN | Importa uma sugestão (o próprio objeto `LivroSugerido`) para o catálogo: cria autores, editora e categorias ausentes e grava o livro. Resposta `LivroImportado`; ISBN/título repetidos retornam `jaExistia: true` e HTTP 200. |
| GET | `/consulta/cep?cep=` | ADMIN | ViaCEP: preenche endereço. Resposta `EnderecoConsultado`. |
| GET | `/consulta/feriados?ano=` | ADMIN | BrasilAPI: feriados nacionais para prorrogar retirada. Resposta `{ itens: Feriado[] }`. |
| Uso próprio | aplicação Electron → API REST | todos | A própria API consumida pelo cliente desktop. |

## Resumo

| Método | Rota | Perfil | Descrição |
| --- | --- | --- | --- |
| GET | `/dashboard` | ADMIN | Números da visão geral (`ResumoDashboard`). |
| GET | `/dashboard/me` | LEITOR | Resumo somente do leitor autenticado. |
