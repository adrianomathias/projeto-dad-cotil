# Manual do Usuário — Biblioteca Comunitária

**Projeto Final — Desenvolvimento de Aplicações Desktop (DAD)**
**Versão do aplicativo:** 0.1.0
**Documento:** Manual de utilização do aplicativo desktop

---

## Sumário

1. [Introdução ao sistema](#1-introdução-ao-sistema)
2. [Objetivo da aplicação](#2-objetivo-da-aplicação)
3. [Requisitos para utilização](#3-requisitos-para-utilização)
4. [Inicialização do aplicativo](#4-inicialização-do-aplicativo)
5. [Orientações de navegação](#5-orientações-de-navegação)
6. [Funcionalidades do sistema](#6-funcionalidades-do-sistema)
7. [Utilização de cada tela](#7-utilização-de-cada-tela)
8. [Perfis de acesso e permissões](#8-perfis-de-acesso-e-permissões)
9. [Mensagens de erro e orientações básicas](#9-mensagens-de-erro-e-orientações-básicas)
10. [Encerramento da aplicação](#10-encerramento-da-aplicação)
11. [Limitações conhecidas](#11-limitações-conhecidas)
12. [Informações técnicas de apoio](#12-informações-técnicas-de-apoio)

---

## 1. Introdução ao sistema

A **Biblioteca Comunitária** é um sistema desenvolvido como Projeto Final da disciplina de Desenvolvimento de Aplicações Desktop (DAD).

O sistema é formado por três partes:

| Parte | Pasta | Função |
| --- | --- | --- |
| Aplicativo desktop | `app/` | Interface usada pelo usuário. Feito com Electron, React e TypeScript. |
| Servidor | `server/` | Recebe os pedidos, aplica as regras de negócio e acessa o banco. Feito com Express e TypeScript. |
| Tipos compartilhados | `shared/` | Tipos e interfaces usados pelo aplicativo e pelo servidor. |

O aplicativo desktop se comunica com o servidor por meio de uma **API REST**. Ele não acessa o banco diretamente. Por isso, o servidor precisa estar em execução para que os dados apareçam.

---

## 2. Objetivo da aplicação

O sistema apoia a gestão de uma biblioteca comunitária: cadastro do acervo e dos leitores, empréstimos, renovações, devoluções, fila de reservas, agendamentos, multas, notificações e configuração das regras da biblioteca.

A interface foi pensada para ser simples e acessível: tema claro com vermelho suave, fonte legível, botões grandes, rótulos nos campos, mensagens em português e confirmação antes de gravar ou cancelar operações importantes.

---

## 3. Requisitos para utilização

| Requisito | Detalhe |
| --- | --- |
| Node.js | Versão 22 ou superior |
| npm | Instalado junto com o Node.js |
| Sistema operacional | Windows, macOS ou Linux |
| Servidor da aplicação | Deve estar em execução |
| Endereço padrão da API | `http://localhost:3000/api` |

No Windows, use `npm.cmd` no terminal: o script `npm.ps1` pode ser bloqueado pela política de execução do PowerShell.

---

## 4. Inicialização do aplicativo

Execute os comandos na pasta principal do projeto, aquela que contém `app/`, `server/` e `shared/`.

### 4.1 Instalar as dependências (apenas na primeira vez)

```powershell
npm.cmd install
Copy-Item -LiteralPath '.env.example' -Destination '.env'
```

Ajuste o `.env` se precisar trocar porta, origem CORS ou credenciais. Nunca use CPF, e-mail ou telefone reais de pessoas nos dados de exemplo.

### 4.2 Iniciar servidor e aplicativo juntos

```powershell
npm.cmd run dev
```

Esse comando inicia ao mesmo tempo o **servidor** e o **aplicativo desktop**. Depois de alguns instantes, a janela do aplicativo é aberta.

### 4.3 Iniciar as partes separadamente

| Comando | O que faz |
| --- | --- |
| `npm.cmd run dev:server` | Somente servidor em modo de desenvolvimento |
| `npm.cmd run dev:app` | Somente aplicativo Electron |
| `npm.cmd run build` | Gera a versão de produção de `shared`, `server` e `app` |
| `npm.cmd run typecheck` | Verifica os tipos do TypeScript |
| `npm.cmd test -w @biblioteca/server` | Executa os testes do servidor |
| `npm.cmd start` | Inicia o servidor compilado |

### 4.4 Primeiro acesso

Na primeira execução em desenvolvimento, o banco recebe um administrador e alguns exemplos fictícios:

```text
Administrador:
E-mail: admin@biblioteca.local
Senha:  Admin@123

Cliente/leitor:
CPF:    529.982.247-25
Senha:  Leitor@123
```

Alterne `ADMIN_EMAIL`, `ADMIN_SENHA` e `LEITOR_SENHA_INICIAL` no `.env` antes de usar o sistema fora do computador local. As contas de leitores de exemplo são criadas automaticamente para Ana Souza, Bruno Lima e Camila Rocha; seus CPFs aparecem na tela **Leitores** de forma mascarada.

### 4.5 Endereço do servidor

O padrão é `http://localhost:3000/api`. Para mudar, defina `VITE_API_URL` antes de iniciar o aplicativo. No aplicativo empacotado com `file://`, o servidor precisa aceitar a origem opaca: defina `CORS_ORIGIN=null` no `.env`.

---

## 5. Orientações de navegação

- A janela abre com **1200 x 800 pixels** e título "Biblioteca Comunitaria".
- O menu lateral agrupa as seções em **Principal**, **Acervo**, **Pessoas**, **Operação** e **Sistema**. O usuário vê apenas as seções permitidas para seu perfil.
- Cada seção possui título, descrição, filtros, tabela ou cartões e ações no topo da página.
- Em janelas estreitas (até 1180 px) as tabelas viram cartões com o rótulo de cada campo, e o menu lateral vira um seletor de seção: não há mais barras de rolagem horizontal na página. Em janelas um pouco maiores, se uma tabela com muitas colunas não couber, a rolagem fica restrita ao próprio painel. As barras verticais restantes seguem o tema vinho/bege.
- Links externos que começam com `https://` abrem no navegador padrão; outros tipos de link são bloqueados.
- A navegação para endereços fora do aplicativo é bloqueada por segurança.
- Campos têm rótulos visíveis, tabelas usam cabeçalhos semânticos, estados de carregamento são anunciados e mensagens de erro usam `role="alert"`.
- Antes de criar, editar, inativar, pagar, renovar, devolver ou cancelar, aparece um diálogo de confirmação.

---

## 6. Funcionalidades do sistema

| Funcionalidade | Descrição |
| --- | --- |
| Login e cadastro | Abas para **Equipe** (e-mail e senha) e **Sou leitor** (CPF e senha), com cadastro público de leitor e cadastro de equipe por convite; os dois cadastros criam a conta ativa e já devolvem token de sessão, sem verificação de e-mail. O token fica apenas na memória da sessão, e contas inativadas são rejeitadas mesmo com token válido. |
| Visão geral | Números da biblioteca ou resumo pessoal do leitor. |
| Acervo | Cadastro e consulta de livros, com busca e importação automática de metadados por título/ISBN. |
| Autores | Cadastro, edição e inativação de autores. |
| Editoras | Cadastro, edição e inativação de editoras. |
| Categorias | Cadastro, edição e inativação de categorias. |
| Leitores | Cadastro com CPF, endereço e busca por nome ou CPF; CPF aparece mascarado. |
| Usuários | Controles de acesso por perfil, com senha ou código de ativação, e convites individuais para cadastro da equipe. |
| Empréstimos | Retirada, prazo de 14 dias, renovação única, devolução e multa. |
| Reservas | Fila por ordem de entrada, aviso na devolução e prazo de retirada. |
| Agendamentos | Retirada de exemplar disponível em data escolhida, até 3 dias à frente. |
| Multas | Cálculo por atraso, pagamentos parciais, perdão e estorno. |
| Configurações | Ajuste das regras com registro de auditoria. |
| Notificações | Histórico de e-mails e avisos, com reenvio e cancelamento. |
| Consentimento de WhatsApp (API) | Registro e revogação do consentimento do leitor, disponíveis nas rotas `/consentimentos-whatsapp`. |

---

## 7. Utilização de cada tela

### 7.1 Login

A tela tem duas abas:

- **Administrador:** informe e-mail e senha e clique em **Entrar**. Use `admin@biblioteca.local` / `Admin@123` no primeiro acesso.
- **Sou leitor:** informe o CPF (com ou sem pontos) e a senha do cliente e clique em **Entrar como leitor**. No primeiro acesso, use `529.982.247-25` / `Leitor@123`.

Abaixo do botão de entrada aparece somente o cadastro da aba selecionada:

- Na aba **Sou leitor**, o botão **Cadastrar leitor** abre o cadastro público com nome, CPF, e-mail, telefone obrigatório e senha. Digite o telefone como preferir (`11999998888` ou `(11) 99999-8888`): o campo formata automaticamente e envia `+5511999998888`; para outro país, comece com `+`. Os dígitos do CPF são conferidos localmente e o número é consultado na BrasilAPI (com fallback para ReceitaWS) em produção: CPFs fictícios ou não encontrados são recusados. São aceitos somente estes domínios de e-mail: `gmail.com`, `outlook.com`, `hotmail.com`, `live.com`, `yahoo.com`, `yahoo.com.br`, `icloud.com`, `uol.com.br` e `bol.com.br`. A validação ignora espaços e maiúsculas/minúsculas, exige exatamente um `@` com texto antes dele e compara o domínio de forma exata; se o domínio não estiver na lista, aparece "Use um e-mail Gmail, Outlook, Hotmail, Yahoo ou similar.". CPF e e-mail não podem ser repetidos. O botão de administrador não aparece nessa aba.
- Na aba **Administrador**, o botão **Cadastrar administrador** abre o cadastro restrito, que exige um código de convite de 12 caracteres entregue por um administrador e usa a mesma lista de domínios de e-mail e a mesma regra de senha forte do cadastro de leitor. Não é possível criar conta de administrador sem convite. O botão de leitor não aparece nessa aba.

A senha dos cadastros públicos precisa ter ao menos 10 caracteres, com letra maiúscula, minúscula, número e símbolo. Ela é armazenada somente como hash scrypt com salt. O CPF é cifrado e buscado por HMAC; a interface mostra apenas a máscara. No login e nos formulários de senha há o ícone de olho para mostrar ou ocultar o que foi digitado.

Depois de enviar o cadastro (leitor ou administrador), a conta é criada na hora, em uma transação: leitor, endereço (quando informado) e usuário ativo, no caso do leitor; usuário e consumo imediato do convite, no caso do administrador. Não há código de confirmação, e-mail a aguardar nem cadastro pendente em memória. A resposta já traz o token de sessão e a pessoa entra no aplicativo automaticamente. Não existe reenvio de código, cancelamento ao sair da tela nem o atalho "Já cadastrei, mas não recebi o código".

Se as credenciais estiverem erradas, aparece "E-mail ou senha incorretos." ou "CPF ou senha incorretos.". O token JWT permanece apenas na memória da aplicação; ao fechar a janela, entre novamente.

### 7.2 Visão geral

Mostra totais de títulos, exemplares, leitores ativos, empréstimos, atrasos, reservas e multas. Para leitor, mostra somente seus empréstimos, reservas, agendamentos e multas. Há atalhos para as seções mais usadas.

### 7.3 Acervo

- **Para que serve:** consultar e manter livros e exemplares.
- **Filtros:** busca por título, autor ou ISBN; autor, editora, categoria e disponibilidade.
- **Ações:** **Adicionar livro**, **Importar da API**, **Editar** e **Inativar**.
- **Busca e importação de metadados:** clique em **Adicionar livro** ou **Importar da API**, informe título ou ISBN e clique em **Buscar dados do livro**. A consulta tenta o Open Library e, se ele falhar ou não retornar itens, usa o Google Books; a origem e a capa (quando disponível) aparecem em cada sugestão. Para cada sugestão você pode:
  - **Conferir e usar:** mostra a capa na confirmação e preenche o formulário para revisão antes de salvar manualmente;
  - **Importar para o acervo:** mostra a capa na confirmação e grava livro, autores, editora, categorias, ISBN, capa e sinopse no banco local. Se o ISBN ou o título já existir, o sistema reaproveita o registro existente em vez de duplicá-lo.
- **Exemplares:** cada livro pode ter vários exemplares com tombamento, estado de conservação e localização.

### 7.4 Autores

- Busque pelo nome e use **Novo autor**, **Editar** ou **Inativar**.
- A inativação não apaga o registro e é bloqueada se o autor estiver ligado a livros.

### 7.5 Editoras

- Mesmo fluxo de Autores, com o botão **Nova editora**.
- A inativação é bloqueada se a editora estiver ligada a livros.

### 7.6 Categorias

- Mesmo fluxo de Autores, com o botão **Nova categoria**.
- A inativação é bloqueada se a categoria estiver ligada a livros.

### 7.7 Leitores

- **Cadastro:** nome, CPF, e-mail, telefone obrigatório (formatado com `+55` automaticamente) e endereço. O CEP pode ser preenchido pelo ViaCEP.
- **Busca:** campo "Nome ou CPF do leitor". Para CPF, digite os números; o sistema busca pelo hash sem revelar o valor completo. A opção **Mostrar leitores inativos** fica sempre marcada: ativos e inativos aparecem juntos para auditoria.
- **Ações:** **Cadastrar leitor**, **Editar** e **Inativar**. Não é possível inativar quem tem empréstimo aberto; nesses casos o botão **Inativar** fica desabilitado. Devolva os exemplares antes de tentar novamente.
- **Exibição:** a tabela mostra `cpfMascara`, nunca o CPF completo.
- **Inativação:** ao confirmar, a conta de login do leitor é desativada, tokens antigos deixam de funcionar, reservas e agendamentos ativos são cancelados, exemplares reservados/agendados voltam a ficar disponíveis e o consentimento de WhatsApp é revogado. O histórico permanece no banco por auditoria, mas o nome do leitor é exibido como **Leitor inativo** em empréstimos, reservas, agendamentos, multas e notificações; o leitor não volta a aparecer em buscas, filas ou notificações futuras.
- **Reaproveitamento de CPF:** somente cadastros ativos bloqueiam o CPF. Depois de inativar, o mesmo número pode ser usado em um novo cadastro. O registro antigo aparece na lista com a situação **Inativo**. Inativar a conta em **Usuários** também inativa o leitor vinculado, evitando que o CPF fique preso sem aparecer na tela.
- **Exclusão definitiva (somente ADMIN):** leitores já inativados ganham o botão **Excluir**. Ele remove CPF, e-mail, telefone e endereço, tira o cadastro de todas as telas e mantém apenas um registro anônimo para não quebrar o histórico de empréstimos, reservas e multas. Não é possível desfazer.

### 7.8 Usuários

Somente administradores veem esta tela. Use **Novo usuário** e informe nome, e-mail, perfil, leitor vinculado (quando o perfil for Leitor) e, se quiser, uma senha. Ao editar, é possível alterar nome, e-mail, perfil, **Usuário ativo**, **Leitor vinculado** e, no campo **Nova senha (opcional)**, trocar o hash scrypt; deixe a senha em branco para manter a atual. Usuários com perfil Leitor precisam ter um leitor vinculado. Se a senha for deixada em branco na criação, o sistema mostra um **código de ativação** de 6 dígitos; ele deve ser entregue ao usuário para definir a senha pela API `/auth/ativar`. Esse código é exclusivo de ativação administrativa e não é usado nos cadastros públicos nem para confirmar e-mail.

A área **Administrador da biblioteca** permite trocar a conta local de desenvolvimento pela conta definitiva do cliente: informe nome, e-mail e senha e confirme. Um novo `ADMIN` é criado já ativo e a conta antiga é inativada na mesma operação, sem apagar registros históricos; o sistema desconecta a sessão atual para que o próximo acesso use o e-mail e a senha informados.

A mesma tela tem a área **Convites de administrador**. Informe opcionalmente o e-mail destinatário e clique em **Gerar convite**. O código completo aparece uma única vez nessa tela: copie e entregue apenas à pessoa autorizada. O convite vale 24 horas, pode ser usado uma única vez e, se um e-mail tiver sido informado, só aquela conta poderá usá-lo. A tabela mostra a máscara do código, a validade e a situação; **Revogar** invalida imediatamente um convite ainda disponível. O código completo nunca volta a ser exibido nem fica gravado no banco.

### 7.9 Empréstimos

- **Registrar retirada:** escolha leitor e exemplar disponível. O prazo padrão é de 14 dias.
- **Filtros:** busca por leitor ou livro, situação, **Somente atrasados** e **Vencendo em breve**.
- **Ações por linha:** observação, **Renovar** (uma vez, bloqueada se houver fila), **Devolver** e **Cancelar**.
- A devolução calcula dias de atraso, cria ou atualiza a multa e promove o primeiro da fila.

### 7.10 Reservas

- **Nova reserva:** escolha leitor e livro. Só é permitido quando não há exemplar disponível; para exemplar disponível use agendamento.
- **Ficha do livro:** no campo **Livro** há um botão que abre um modal com capa, título, descrição e demais metadados (subtítulo, autores, categorias, ISBN-10/13, ano, idioma, editora quando disponível e exemplares totais/disponíveis). O modal reaproveita o padrão visual e acessível de `<dialog>` já usado na interface.
- **Fila:** a coluna "Posição" mostra a ordem FIFO. **Somente fila** filtra os aguardando.
- **Leitor:** vê somente suas reservas e pode cancelar as próprias.
- **Equipe:** vê todas, filtra por livro/leitor/situação e usa **Retirar** quando a reserva estiver disponível.
- O prazo de retirada é de 24 horas, prorrogado para o próximo dia útil quando termina em fim de semana ou feriado.

### 7.11 Agendamentos

- **Novo agendamento:** escolha exemplar disponível e data de hoje até 3 dias à frente.
- Abaixo do campo **Exemplar disponível**, use **Buscar livro no catálogo** para abrir a modal de consulta: há barra de pesquisa por título, autor, ISBN ou editora, filtros por categoria, editora e disponibilidade, e painel com capa, descrição e demais dados catalogados. **Usar este livro** seleciona automaticamente o primeiro exemplar livre daquele título.
- As capas dos livros sem imagem são preenchidas pelo servidor com a URL pública do Google Books montada a partir do ISBN; o aplicativo também usa essa URL como fallback imediato se o registro ainda não tiver `capaUrl`. Livros importados da consulta externa já trazem a capa devolvida pela API. Se a imagem não carregar, aparece o ícone de substituto.
- O exemplar fica reservado para a data escolhida; se não for retirado, volta a ficar disponível.
- **Leitor:** vê e cancela somente os próprios. **Equipe:** também confirma a retirada na data.

### 7.12 Multas

Mostra leitor, livro, dias de atraso, valor e situação. Use **Registrar pagamento** para informar valor e forma (dinheiro, Pix, cartão ou outro). Pagamentos parciais são somados; a multa só é baixada quando o total é atingido. Administradores também podem perdoar ou estornar.

### 7.13 Configurações

Administradores clicam em **Editar regras** para ajustar prazos, limites, antecedência dos avisos, valor diário da multa, teto da multa, prazo de retirada e fuso horário. Cada alteração gera registro em auditoria.

### 7.14 Notificações

Histórico de avisos com destinatário mascarado, tipo, situação e data. Administradores podem criar avisos manualmente, **Reenviar** ou **Cancelar**.

O registro e a revogação de consentimento de WhatsApp são feitos pelas rotas `/consentimentos-whatsapp`; nesta versão não há item de menu dedicado. A revogação é registrada com data e nenhum número completo aparece nas respostas.

---

## 8. Perfis de acesso e permissões

| Perfil | O que pode fazer | O que não pode fazer |
| --- | --- | --- |
| **Administrador** | Tudo: cadastros, operações, multas, configurações, auditoria, notificações e usuários. | — |
| **Leitor** | Ver a própria visão geral, reservas e agendamentos; criar e cancelar os próprios pedidos; consultar a própria API de notificações e consentimento. | Ver acervo administrativo, outros leitores, usuários, empréstimos gerais, multas de terceiros ou configurações. |

Mesmo que uma pessoa digite o ID de outro leitor na URL, o servidor bloqueia o acesso.

---

## 9. Mensagens de erro e orientações básicas

| Situação | Possível causa | O que fazer |
| --- | --- | --- |
| "Faça login para continuar." | Sessão expirada ou token ausente | Entre novamente |
| "Sua sessão expirou. Faça login novamente." | Token vencido | Entre novamente |
| "Você só pode acessar seus próprios dados." | Tentativa de acessar dados de outro leitor | Volte à sua lista |
| "E-mail ou senha incorretos." | Credenciais inválidas | Confira os dados |
| "Use um e-mail Gmail, Outlook, Hotmail, Yahoo ou similar." | Domínio de e-mail fora da lista permitida no cadastro | Informe um e-mail de `gmail.com`, `outlook.com`, `hotmail.com`, `live.com`, `yahoo.com`, `yahoo.com.br`, `icloud.com`, `uol.com.br` ou `bol.com.br` |
| "Este livro tem exemplar disponível. Use o agendamento." | Tentativa de reserva com acervo disponível | Use **Novo agendamento** |
| "Não é possível renovar: há leitores aguardando este livro." | Existe fila | Devolva o livro |
| "O prazo de retirada venceu." | Reserva expirada | Procure a biblioteca |
| "Este leitor já atingiu o limite de 3 reservas ativas." | Limite da política | Cancele uma reserva ou agendamento |
| "Error: Electron uninstall" | Binário do Electron não foi baixado na instalação | Execute `node node_modules\electron\install.js` e inicie novamente |
| "A janela abre, mas os dados não aparecem" | Servidor desligado ou endereço diferente | Inicie `npm.cmd run dev:server` e confira `VITE_API_URL` |
| "Erro ao compilar" | Tipos ou dependências | Execute `npm.cmd run typecheck` e `npm.cmd install` |

---

## 10. Encerramento da aplicação

| Sistema operacional | Como o aplicativo é encerrado |
| --- | --- |
| Windows e Linux | Ao fechar a janela principal, o aplicativo é encerrado por completo |
| macOS | Ao fechar a janela, o aplicativo continua no Dock; use o menu do aplicativo ou `Cmd + Q` |

Em desenvolvimento, pressione `Ctrl + C` no terminal para encerrar o servidor e o aplicativo iniciados por `npm.cmd run dev`.

---

## 11. Limitações conhecidas

- Ainda não há instalador nem hospedagem definida para distribuição.
- O envio de e-mail é simulado quando não há SMTP configurado; ele atende avisos e ativação administrativa. Os cadastros públicos não enviam nem exigem código por e-mail.
- O WhatsApp depende de token e consentimento; sem configuração, nenhuma mensagem é enviada.
- A tela de login não cria senha sozinha: o código de ativação aparece somente quando o administrador cria o usuário sem senha e não participa dos cadastros públicos.
- Não há tela dedicada ao consentimento de WhatsApp nesta versão; o registro é feito pela API.
- A API roda em HTTP local no desenvolvimento; para uso remoto é necessário HTTPS e ajuste de CORS.

---

## 12. Informações técnicas de apoio

### 12.1 Segurança do aplicativo

| Configuração | Valor | Para que serve |
| --- | --- | --- |
| `contextIsolation` | `true` | Separa a interface do código interno do Electron |
| `sandbox` | `true` | Executa a interface em ambiente restrito |
| `nodeIntegration` | `false` | Impede acesso direto ao Node.js pela interface |
| Preload | Expõe somente `window.biblioteca.apiUrl` | A interface recebe o endereço da API sem acessar segredos |

### 12.2 Comunicação entre as partes

- **Processo principal:** cria a janela e informa a base da API.
- **Preload:** disponibiliza `window.biblioteca.apiUrl` de forma controlada.
- **Renderer:** usa `ApiCliente` para enviar requisições com o token JWT no cabeçalho.
- **Servidor:** valida, autoriza, aplica regras e grava no SQLite.

### 12.3 Estrutura do projeto

```text
biblioteca-comunitaria/
├── app/       Aplicativo desktop (Electron + React + TypeScript)
├── server/    Servidor (Express + TypeScript + SQLite)
├── shared/    Tipos e interfaces compartilhados
└── docs/      Contrato, modelo, manual e cobertura de requisitos
```

---

*Este manual deve ser atualizado sempre que uma tela ou funcionalidade for incluída, alterada ou removida.*
