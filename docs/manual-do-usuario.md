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
11. [Funcionalidades pendentes](#11-funcionalidades-pendentes)
12. [Informações técnicas de apoio](#12-informações-técnicas-de-apoio)

---

## 1. Introdução ao sistema

A **Biblioteca Comunitária** é um sistema desenvolvido como Projeto Final da disciplina de Desenvolvimento de Aplicações Desktop (DAD).

O sistema é formado por três partes:

| Parte | Pasta | Função |
|---|---|---|
| Aplicativo desktop | `app/` | Interface usada pelo usuário. Feito com Electron, React e TypeScript. |
| Servidor | `server/` | Recebe os pedidos do aplicativo, aplica as regras de negócio e acessa os dados. Feito com Express e TypeScript. |
| Tipos compartilhados | `shared/` | Tipos e interfaces usados pelo aplicativo e pelo servidor. |

O aplicativo desktop se comunica com o servidor por meio de uma **API REST**. O aplicativo não acessa o banco de dados diretamente. Por isso, o servidor precisa estar em execução para que o aplicativo funcione por completo.

Este manual descreve a **interface e a utilização do aplicativo desktop**.

---

## 2. Objetivo da aplicação

O objetivo da Biblioteca Comunitária é oferecer um sistema desktop para apoiar a gestão de uma biblioteca comunitária, com uma interface simples, segura e integrada a um servidor.

> **Nota:** a lista detalhada das operações disponíveis (por exemplo, cadastros e consultas) será descrita na [seção 6](#6-funcionalidades-do-sistema) quando as telas do aplicativo forem documentadas.

---

## 3. Requisitos para utilização

### 3.1 Para executar o projeto em ambiente de desenvolvimento

| Requisito | Detalhe |
|---|---|
| Node.js | Versão 20 ou superior |
| npm | Instalado junto com o Node.js |
| Sistema operacional | Windows, macOS ou Linux |
| Servidor da aplicação | Deve estar em execução (veja a seção 4) |
| Porta do servidor | Por padrão, o aplicativo procura o servidor em `http://localhost:3000/api` |

### 3.2 Para executar o aplicativo instalado

> **Pendente:** o instalador do aplicativo ainda não foi preparado ou verificado. Os requisitos para o aplicativo instalado serão descritos aqui depois que a distribuição for definida (veja a seção 11).

---

## 4. Inicialização do aplicativo

As instruções abaixo valem para o **ambiente de desenvolvimento**. Execute os comandos no terminal, na pasta principal do projeto (a pasta que contém `app/`, `server/` e `shared/`).

### 4.1 Instalar as dependências (apenas na primeira vez)

```bash
npm install
```

### 4.2 Iniciar o servidor e o aplicativo juntos

```bash
npm run dev
```

Esse comando inicia ao mesmo tempo:

- o **servidor** (identificado como `server` no terminal);
- o **aplicativo desktop** (identificado como `app` no terminal).

Depois de alguns instantes, a janela do aplicativo é aberta.

### 4.3 Iniciar as partes separadamente (opcional)

| Comando | O que faz |
|---|---|
| `npm run dev:server` | Inicia somente o servidor em modo de desenvolvimento |
| `npm run dev:app` | Inicia somente o aplicativo desktop em modo de desenvolvimento |
| `npm run build` | Gera a versão de produção (tipos compartilhados, servidor e aplicativo, nesta ordem) |
| `npm run typecheck` | Verifica os tipos do TypeScript em todas as partes do projeto |
| `npm run start` | Inicia somente o servidor (versão compilada) |

### 4.4 Janela do aplicativo

Ao iniciar, o aplicativo abre uma janela de **1200 x 800 pixels** com o título "Biblioteca Comunitaria".

### 4.5 Endereço do servidor

O aplicativo usa o endereço `http://localhost:3000/api` como padrão. Esse valor pode ser alterado com a variável de ambiente `VITE_API_URL`, definida antes de iniciar o aplicativo.

> **Atenção:** a configuração do endereço do servidor para o aplicativo já instalado depende da definição de hospedagem do projeto (veja a seção 11).

---

## 5. Orientações de navegação

Orientações gerais, válidas para toda a aplicação:

- **Links externos:** links que começam com `https://` são abertos no **navegador padrão do computador**, e não dentro do aplicativo. Outros tipos de link são bloqueados por segurança.
- **Navegação protegida:** o aplicativo não permite navegar para endereços fora dele. Isso evita que a janela seja redirecionada para páginas externas.
- **Janela principal:** o aplicativo trabalha com uma janela principal. Não há abertura de novas janelas do próprio aplicativo.

> **Pendente:** o menu, a barra de navegação e a organização das telas serão descritos aqui depois que os arquivos da interface forem analisados.

---

## 6. Funcionalidades do sistema

> **Pendente:** nenhuma funcionalidade do renderer (telas e formulários) pôde ser verificada nesta versão do manual, pois os arquivos da interface ainda não foram analisados. Para evitar informações incorretas, esta seção será preenchida somente com o que estiver realmente implementado.

Funcionalidades confirmadas nos arquivos analisados (base técnica do aplicativo):

| Funcionalidade | Descrição |
|---|---|
| Janela desktop | Abre a interface do sistema em uma janela própria, com tamanho inicial de 1200 x 800 |
| Comunicação com a API | O aplicativo recebe o endereço da API ao iniciar e o disponibiliza para a interface |
| Abertura de links externos | Links `https://` abrem no navegador do sistema |
| Proteção de navegação | Bloqueia navegação para endereços não permitidos |

---

## 7. Utilização de cada tela

> **Pendente:** as telas do aplicativo ainda não foram verificadas. Para cada tela implementada, esta seção deve seguir o modelo abaixo.

### Modelo para cada tela

```text
7.X Nome da tela
- Para que serve:
- Como acessar:
- Campos e botões existentes:
- Passo a passo de uso:
- Mensagens possíveis:
```

Telas previstas pelo escopo do projeto, que dependem de confirmação da implementação:

| Tela | Situação |
|---|---|
| Login | A confirmar |
| Ativação | A confirmar |
| Demais telas e formulários | A confirmar |

---

## 8. Perfis de acesso e permissões

> **Pendente:** os perfis de acesso não foram identificados nos arquivos analisados. As regras de acesso são definidas no servidor (Função 3: Núcleo, Regras de Negócio e Segurança), e não no aplicativo.

Depois de confirmados os perfis, preencher a tabela abaixo:

| Perfil | O que pode fazer | O que não pode fazer |
|---|---|---|
| (a definir) | (a definir) | (a definir) |

---

## 9. Mensagens de erro e orientações básicas

As mensagens exibidas ao usuário ainda não foram verificadas no código. Por isso, esta seção traz orientações gerais baseadas no funcionamento do sistema.

| Situação | Possível causa | O que fazer |
|---|---|---|
| A janela abre, mas os dados não aparecem ou há falha de conexão | O servidor não está em execução ou está em outro endereço | Verifique se o servidor foi iniciado (`npm run dev` ou `npm run dev:server`) e se responde em `http://localhost:3000/api` |
| O aplicativo não abre | Dependências não instaladas ou versão do Node.js inferior à 20 | Execute `npm install` e confira a versão com `node --version` |
| Um link não abre dentro do aplicativo | Por segurança, links são abertos no navegador do sistema; links que não usam `https://` são bloqueados | Use o navegador do computador para acessar o endereço |
| Erro ao compilar | Problema de tipos ou de código | Execute `npm run typecheck` e informe a mensagem à equipe de desenvolvimento |

> **Pendente:** a lista de mensagens de erro exibidas na interface (por exemplo, login inválido ou campos obrigatórios) será incluída depois da análise das telas.

---

## 10. Encerramento da aplicação

| Sistema operacional | Como o aplicativo é encerrado |
|---|---|
| Windows e Linux | Ao fechar a janela principal, o aplicativo é encerrado por completo |
| macOS | Ao fechar a janela, o aplicativo continua ativo no Dock. Para encerrá-lo, use o menu do aplicativo ou o atalho `Cmd + Q`. Ao clicar no ícone do Dock, a janela é aberta novamente |

**Em ambiente de desenvolvimento:** o servidor e o aplicativo foram iniciados pelo mesmo comando no terminal. Para encerrar tudo, feche a janela do aplicativo e pressione `Ctrl + C` no terminal.

---

## 11. Funcionalidades pendentes

Itens ainda não confirmados ou não implementados nos arquivos analisados. **Não devem ser considerados parte do sistema até a verificação.**

| Item | Situação | Observação |
|---|---|---|
| Telas e formulários da interface | Não analisados | Dependem dos arquivos do renderer |
| Login e ativação | Não verificados | Previstos no escopo da Função 1 |
| Perfis de acesso e permissões | Não verificados | Regras ficam no servidor |
| Instalador / distribuição | Não identificado | Nenhuma configuração de empacotamento foi vista |
| Endereço da API no app instalado | A definir | Depende da hospedagem (Função 4) |
| Mensagens de erro da interface | Não verificadas | Dependem das telas |
| Capturas de tela no manual | Não incluídas | Devem ser adicionadas após a validação das telas |

---

## 12. Informações técnicas de apoio

Esta seção ajuda a equipe e os avaliadores a entender como o aplicativo é protegido.

### 12.1 Segurança do aplicativo

O aplicativo desktop usa as seguintes configurações de segurança do Electron:

| Configuração | Valor | Para que serve |
|---|---|---|
| `contextIsolation` | `true` | Separa o código da interface do código interno do Electron |
| `sandbox` | `true` | Executa a interface em ambiente restrito |
| `nodeIntegration` | `false` | Impede que a interface acesse recursos do Node.js diretamente |

### 12.2 Comunicação entre as partes

- **Processo principal (main):** cria a janela e define as regras de segurança. Informa o endereço da API ao carregar a janela.
- **Preload:** recebe esse endereço e o disponibiliza para a interface de forma controlada, com o nome `biblioteca`.
- **Interface (renderer):** usa o endereço recebido para conversar com o servidor por meio da API.
- **Servidor:** aplica as regras de negócio e acessa os dados.

### 12.3 Estrutura do projeto

```text
biblioteca-comunitaria/
├── app/       Aplicativo desktop (Electron + React + TypeScript)
├── server/    Servidor (Express + TypeScript)
├── shared/    Tipos e interfaces compartilhados
└── docs/      Documentação (este manual)
```

---

*Este manual deve ser atualizado sempre que uma tela ou funcionalidade for incluída, alterada ou removida.*