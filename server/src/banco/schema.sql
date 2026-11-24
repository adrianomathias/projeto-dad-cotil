-- Schema da biblioteca comunitária (SQLite).
-- Tabelas históricas usam status/exclusão lógica: nunca são apagadas.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editoras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  deleted_at TEXT,
  criado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_editoras_nome ON editoras(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_editoras_nome ON editoras(nome);

CREATE TABLE IF NOT EXISTS autores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  deleted_at TEXT,
  criado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_autores_nome ON autores(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_autores_nome ON autores(nome);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  deleted_at TEXT,
  criado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_nome ON categorias(nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categorias_nome ON categorias(nome);

CREATE TABLE IF NOT EXISTS livros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  subtitulo TEXT,
  isbn10 TEXT CHECK (isbn10 IS NULL OR length(isbn10) = 10),
  isbn13 TEXT CHECK (isbn13 IS NULL OR length(isbn13) = 13),
  editora_id INTEGER REFERENCES editoras(id) ON DELETE RESTRICT,
  ano_publicacao INTEGER CHECK (ano_publicacao IS NULL OR ano_publicacao BETWEEN 0 AND 2100),
  descricao_curta TEXT,
  capa_url TEXT CHECK (capa_url IS NULL OR capa_url LIKE 'https://%'),
  idioma TEXT NOT NULL DEFAULT 'pt-BR',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_livros_isbn13 ON livros(isbn13) WHERE isbn13 IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_livros_isbn10 ON livros(isbn10) WHERE isbn10 IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_livros_titulo ON livros(titulo);
CREATE INDEX IF NOT EXISTS idx_livros_editora ON livros(editora_id);

CREATE TABLE IF NOT EXISTS livro_autores (
  livro_id INTEGER NOT NULL REFERENCES livros(id) ON DELETE RESTRICT,
  autor_id INTEGER NOT NULL REFERENCES autores(id) ON DELETE RESTRICT,
  ordem INTEGER NOT NULL DEFAULT 1 CHECK (ordem > 0),
  PRIMARY KEY (livro_id, autor_id)
);
CREATE INDEX IF NOT EXISTS idx_livro_autores_autor ON livro_autores(autor_id);

CREATE TABLE IF NOT EXISTS livro_categorias (
  livro_id INTEGER NOT NULL REFERENCES livros(id) ON DELETE RESTRICT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  PRIMARY KEY (livro_id, categoria_id)
);
CREATE INDEX IF NOT EXISTS idx_livro_categorias_categoria ON livro_categorias(categoria_id);

CREATE TABLE IF NOT EXISTS exemplares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  livro_id INTEGER NOT NULL REFERENCES livros(id) ON DELETE RESTRICT,
  codigo_tombamento TEXT NOT NULL UNIQUE CHECK (length(trim(codigo_tombamento)) > 0),
  estado_conservacao TEXT NOT NULL CHECK (estado_conservacao IN ('novo','bom','regular','danificado')),
  status TEXT NOT NULL CHECK (status IN ('disponivel','emprestado','reservado','agendado','em_manutencao','inativo')),
  localizacao TEXT,
  adquirido_em TEXT CHECK (adquirido_em IS NULL OR length(adquirido_em) = 10),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exemplares_livro ON exemplares(livro_id);
CREATE INDEX IF NOT EXISTS idx_exemplares_status ON exemplares(status);

CREATE TABLE IF NOT EXISTS leitores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  cpf_cifrado BLOB NOT NULL,
  cpf_hash BLOB NOT NULL CHECK (length(cpf_hash) = 32),
  cpf_mascara TEXT NOT NULL CHECK (length(cpf_mascara) BETWEEN 1 AND 20),
  email TEXT CHECK (email IS NULL OR email LIKE '%@%'),
  telefone TEXT CHECK (telefone IS NULL OR telefone LIKE '+%'),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  deleted_at TEXT,
  excluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_leitores_nome ON leitores(nome);
CREATE INDEX IF NOT EXISTS idx_leitores_ativo ON leitores(ativo, deleted_at);
-- Somente leitores ativos bloqueiam o CPF; registros inativados preservam o histórico
-- sem impedir um novo cadastro com o mesmo número.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leitores_cpf_ativo ON leitores(cpf_hash) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS enderecos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leitor_id INTEGER NOT NULL UNIQUE REFERENCES leitores(id) ON DELETE RESTRICT,
  cep TEXT NOT NULL CHECK (length(cep) = 8),
  logradouro TEXT NOT NULL CHECK (length(trim(logradouro)) > 0),
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT NOT NULL CHECK (length(trim(cidade)) > 0),
  uf TEXT NOT NULL CHECK (length(uf) = 2),
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enderecos_cep ON enderecos(cep);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leitor_id INTEGER UNIQUE REFERENCES leitores(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  email TEXT NOT NULL CHECK (email LIKE '%@%'),
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN','LEITOR')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  somente_leitura INTEGER NOT NULL DEFAULT 0 CHECK (somente_leitura IN (0,1)),
  codigo_ativacao_hash TEXT,
  codigo_ativacao_expira_em TEXT,
  codigo_ativacao_usado_em TEXT,
  email_verificado_em TEXT,
  verificacao_codigo_hash TEXT,
  verificacao_expira_em TEXT,
  verificacao_tentativas INTEGER NOT NULL DEFAULT 0,
  verificacao_enviado_em TEXT,
  ultimo_login_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (perfil <> 'LEITOR' OR leitor_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email ON usuarios(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);

-- Convites de um único uso para cadastro seguro de contas da equipe.
-- O código é guardado somente como hash; a texto claro aparece uma única vez.
CREATE TABLE IF NOT EXISTS convites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_hash TEXT NOT NULL UNIQUE CHECK (length(codigo_hash) = 64),
  codigo_mascara TEXT NOT NULL CHECK (length(codigo_mascara) <= 20),
  perfil TEXT NOT NULL CHECK (perfil = 'ADMIN'),
  email TEXT,
  criado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  revogado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_convites_situacao ON convites(usado_em, revogado_em, expira_em);
CREATE INDEX IF NOT EXISTS idx_convites_criado_por ON convites(criado_por_usuario_id);

CREATE TABLE IF NOT EXISTS emprestimos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exemplar_id INTEGER NOT NULL REFERENCES exemplares(id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  registrado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_emprestimo TEXT NOT NULL CHECK (length(data_emprestimo) = 10),
  data_devolucao_prevista TEXT NOT NULL CHECK (length(data_devolucao_prevista) = 10),
  data_devolucao_real TEXT CHECK (data_devolucao_real IS NULL OR length(data_devolucao_real) = 10),
  renovacoes INTEGER NOT NULL DEFAULT 0 CHECK (renovacoes BETWEEN 0 AND 1),
  status TEXT NOT NULL CHECK (status IN ('aberto','devolvido','cancelado')),
  observacao TEXT,
  criado_em TEXT NOT NULL,
  CHECK (data_devolucao_prevista >= data_emprestimo),
  CHECK (data_devolucao_real IS NULL OR data_devolucao_real >= data_emprestimo)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_emprestimos_exemplar_aberto ON emprestimos(exemplar_id) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS idx_emprestimos_leitor_status ON emprestimos(leitor_id, status);
CREATE INDEX IF NOT EXISTS idx_emprestimos_prevista ON emprestimos(data_devolucao_prevista);
CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos(status);

CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  livro_id INTEGER NOT NULL REFERENCES livros(id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  registrado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  entrada_em TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aguardando','disponivel_para_retirada','retirado','expirado','cancelado')),
  notificado_em TEXT,
  prazo_retirada_inicio TEXT,
  prazo_retirada_fim TEXT,
  exemplar_destinado_id INTEGER REFERENCES exemplares(id) ON DELETE RESTRICT,
  emprestimo_id INTEGER REFERENCES emprestimos(id) ON DELETE RESTRICT,
  atualizado_em TEXT NOT NULL,
  CHECK (status NOT IN ('disponivel_para_retirada','retirado') OR (prazo_retirada_inicio IS NOT NULL AND prazo_retirada_fim IS NOT NULL)),
  CHECK (prazo_retirada_fim IS NULL OR prazo_retirada_fim >= prazo_retirada_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservas_leitor_livro ON reservas(leitor_id, livro_id)
  WHERE status IN ('aguardando','disponivel_para_retirada');
CREATE INDEX IF NOT EXISTS idx_reservas_fila ON reservas(livro_id, status, entrada_em, id);
CREATE INDEX IF NOT EXISTS idx_reservas_leitor ON reservas(leitor_id, status);
CREATE INDEX IF NOT EXISTS idx_reservas_prazo ON reservas(prazo_retirada_fim);

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exemplar_id INTEGER NOT NULL REFERENCES exemplares(id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  registrado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_agendada TEXT NOT NULL CHECK (length(data_agendada) = 10),
  validade_ate TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ativo','retirado','expirado','cancelado')),
  emprestimo_id INTEGER REFERENCES emprestimos(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamentos_ativo ON agendamentos(leitor_id, exemplar_id, data_agendada) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_agendamentos_exemplar_data ON agendamentos(exemplar_id, data_agendada);
CREATE INDEX IF NOT EXISTS idx_agendamentos_validade ON agendamentos(validade_ate);

CREATE TABLE IF NOT EXISTS multas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emprestimo_id INTEGER NOT NULL UNIQUE REFERENCES emprestimos(id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  dias_atraso INTEGER NOT NULL CHECK (dias_atraso > 0),
  valor_diario_centavos INTEGER NOT NULL CHECK (valor_diario_centavos >= 0),
  teto_centavos INTEGER NOT NULL CHECK (teto_centavos >= 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0 AND valor_centavos <= teto_centavos),
  status TEXT NOT NULL CHECK (status IN ('pendente','paga','perdoada','estornada')),
  registrada_em TEXT NOT NULL,
  perdao_motivo TEXT,
  perdao_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  perdao_em TEXT,
  CHECK (status <> 'perdoada' OR (perdao_motivo IS NOT NULL AND perdao_por_usuario_id IS NOT NULL AND perdao_em IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_multas_leitor_status ON multas(leitor_id, status);
CREATE INDEX IF NOT EXISTS idx_multas_registrada ON multas(registrada_em);

CREATE TABLE IF NOT EXISTS pagamentos_multa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  multa_id INTEGER NOT NULL REFERENCES multas(id) ON DELETE RESTRICT,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  forma TEXT NOT NULL CHECK (forma IN ('dinheiro','pix','cartao','outro')),
  registrado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  registrado_em TEXT NOT NULL,
  comprovante TEXT
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_multa ON pagamentos_multa(multa_id);

CREATE TABLE IF NOT EXISTS configuracoes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  prazo_emprestimo_dias INTEGER NOT NULL CHECK (prazo_emprestimo_dias > 0),
  limite_exemplares_por_leitor INTEGER NOT NULL CHECK (limite_exemplares_por_leitor BETWEEN 1 AND 10),
  prazo_renovacao_dias INTEGER NOT NULL CHECK (prazo_renovacao_dias > 0),
  limite_reservas_ativas INTEGER NOT NULL CHECK (limite_reservas_ativas BETWEEN 1 AND 10),
  prazo_retirada_horas INTEGER NOT NULL CHECK (prazo_retirada_horas > 0),
  antecedencia_aviso_dias INTEGER NOT NULL CHECK (antecedencia_aviso_dias > 0),
  hora_aviso_atraso TEXT NOT NULL CHECK (length(hora_aviso_atraso) = 5),
  valor_diario_multa_centavos INTEGER NOT NULL CHECK (valor_diario_multa_centavos >= 0),
  teto_multa_centavos INTEGER NOT NULL CHECK (teto_multa_centavos >= 0),
  dias_max_agendamento INTEGER NOT NULL CHECK (dias_max_agendamento > 0),
  timezone TEXT NOT NULL CHECK (length(timezone) > 0),
  atualizado_em TEXT NOT NULL,
  atualizado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS configuracoes_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  configuracao_id INTEGER NOT NULL REFERENCES configuracoes(id) ON DELETE RESTRICT,
  alterado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  alterado_em TEXT NOT NULL,
  campo TEXT NOT NULL CHECK (length(trim(campo)) > 0),
  valor_anterior TEXT,
  valor_novo TEXT
);
CREATE INDEX IF NOT EXISTS idx_config_auditoria_data ON configuracoes_auditoria(configuracao_id, alterado_em);

CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  usuario_destinatario_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('ativacao','lembrete_vencimento','atraso','reserva_disponivel','multa','expiracao_reserva')),
  canal TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  status TEXT NOT NULL CHECK (status IN ('pendente','enviada','falhou','reenviada')),
  chave_idempotencia TEXT NOT NULL UNIQUE,
  destinatario_cifrado BLOB,
  destinatario_mascara TEXT NOT NULL,
  emprestimo_id INTEGER REFERENCES emprestimos(id) ON DELETE RESTRICT,
  reserva_id INTEGER REFERENCES reservas(id) ON DELETE RESTRICT,
  multa_id INTEGER REFERENCES multas(id) ON DELETE RESTRICT,
  assunto TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  enviado_em TEXT,
  erro_resumo TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0)
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_leitor_data ON notificacoes(leitor_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_notificacoes_status_data ON notificacoes(status, criado_em);

CREATE TABLE IF NOT EXISTS consentimentos_whatsapp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leitor_id INTEGER NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
  telefone_cifrado BLOB NOT NULL,
  telefone_mascara TEXT NOT NULL,
  consentimento INTEGER NOT NULL CHECK (consentimento IN (0,1)),
  registrado_em TEXT NOT NULL,
  revogado_em TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('formulario','atendente','importacao')),
  CHECK (consentimento = 1 OR revogado_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_consentimento_leitor ON consentimentos_whatsapp(leitor_id, consentimento);
