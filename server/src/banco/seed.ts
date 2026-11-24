import { capaUrlPorIsbn } from '@biblioteca/shared'
import type { Banco } from './conexao.js'

interface OpcoesSeed {
  adminEmail: string
  adminSenha: string
  senhaInicialLeitor?: string
  gerarHash: (senha: string) => string
  cifrar: (texto: string) => Buffer
  hashCpf: (cpf: string) => Buffer
  mascarar: (cpf: string) => string
  incluirExemplos: boolean
}

function dataRelativa(dias: number): string {
  const data = new Date()
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

function agora(): string {
  return new Date().toISOString()
}

/** Cria contas de leitor para os leitores já cadastrados, sem sobrescrever contas existentes. */
function garantirUsuariosLeitores(db: Banco, opcoes: OpcoesSeed): void {
  const senha = opcoes.senhaInicialLeitor
  if (senha === undefined || senha.trim() === '') return

  const agoraIso = agora()
  const leitores = db.prepare(`
    SELECT l.id, l.nome, l.email FROM leitores l
    LEFT JOIN usuarios u ON u.leitor_id = l.id AND u.deleted_at IS NULL
    WHERE u.id IS NULL AND l.deleted_at IS NULL AND l.ativo = 1
  `).all() as Array<{ id: number; nome: string; email: string | null }>

  for (const leitor of leitores) {
    const preferido = typeof leitor.email === 'string' && leitor.email.includes('@')
      ? leitor.email.trim().toLowerCase()
      : `leitor-${leitor.id}@biblioteca.local`
    let email = preferido
    let tentativa = 1
    while (db.prepare('SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL').get(email) !== undefined) {
      const [nomeUsuario, dominio] = preferido.split('@')
      email = `${nomeUsuario}-${tentativa}@${dominio ?? 'biblioteca.local'}`
      tentativa += 1
    }

    db.prepare(`
      INSERT INTO usuarios (nome, email, senha_hash, perfil, leitor_id, ativo, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'LEITOR', ?, 1, ?, ?)
    `).run(leitor.nome, email, opcoes.gerarHash(senha), leitor.id, agoraIso, agoraIso)
  }
}

/**
 * Preenche capas ausentes com o endpoint público de imagens do Google Books,
 * usando o ISBN já catalogado. A URL é carregada pelo renderer; se falhar,
 * CapaLivro mostra o substituto acessível.
 */
function preencherCapasPorIsbn(db: Banco): void {
  const livros = db.prepare(`
    SELECT id, isbn10, isbn13 FROM livros
    WHERE capa_url IS NULL
  `).all() as Array<{ id: number; isbn10: string | null; isbn13: string | null }>
  const atualizar = db.prepare('UPDATE livros SET capa_url = ?, atualizado_em = ? WHERE id = ?')
  const agoraIso = agora()
  for (const livro of livros) {
    const url = capaUrlPorIsbn(livro)
    if (url !== null) atualizar.run(url, agoraIso, livro.id)
  }
}

function criarExemplos(db: Banco, opcoes: OpcoesSeed): void {
  const total = db.prepare('SELECT COUNT(*) AS total FROM livros').get() as { total: number }
  if (total.total > 0) return

  const agoraIso = agora()
  const editora = Number(db.prepare('INSERT INTO editoras (nome, criado_em) VALUES (?, ?)').run('Editora Comunitária', agoraIso).lastInsertRowid)
  const jkRowling = Number(db.prepare('INSERT INTO autores (nome, criado_em) VALUES (?, ?)').run('J. K. Rowling', agoraIso).lastInsertRowid)
  const carolina = Number(db.prepare('INSERT INTO autores (nome, criado_em) VALUES (?, ?)').run('Carolina Maria de Jesus', agoraIso).lastInsertRowid)

  const livros = [
    { titulo: 'Harry Potter e a Pedra Filosofal', isbn: '9788532511010', autor: jkRowling },
    { titulo: 'Harry Potter e a Câmara dos Segredos', isbn: '9788532512499', autor: jkRowling },
    { titulo: 'Quarto de Despejo', isbn: '9788508171279', autor: carolina }
  ]
  const idsLivros: number[] = []
  for (const livro of livros) {
    const id = Number(db.prepare(`
      INSERT INTO livros (titulo, isbn13, editora_id, idioma, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'pt-BR', ?, ?)
    `).run(livro.titulo, livro.isbn, editora, agoraIso, agoraIso).lastInsertRowid)
    idsLivros.push(id)
    db.prepare('INSERT INTO livro_autores (livro_id, autor_id, ordem) VALUES (?, ?, 1)').run(id, livro.autor)
  }

  const idsExemplares: number[] = []
  let contador = 1
  for (const livroId of idsLivros) {
    for (let copia = 0; copia < 2; copia += 1) {
      const id = Number(db.prepare(`
        INSERT INTO exemplares (livro_id, codigo_tombamento, estado_conservacao, status, localizacao, criado_em, atualizado_em)
        VALUES (?, ?, 'bom', 'disponivel', ?, ?, ?)
      `).run(livroId, `TOMB-${String(contador).padStart(4, '0')}`, `Prateleira ${contador}`, agoraIso, agoraIso).lastInsertRowid)
      idsExemplares.push(id)
      contador += 1
    }
  }

  const admin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(opcoes.adminEmail) as { id: number }
  const leitores = [
    { nome: 'Ana Souza', cpf: '52998224725', email: 'ana@example.com' },
    { nome: 'Bruno Lima', cpf: '16899535009', email: 'bruno@example.com' },
    { nome: 'Camila Rocha', cpf: '11144477735', email: 'camila@example.com' }
  ]
  const idsLeitores: number[] = []
  for (const leitor of leitores) {
    const id = Number(db.prepare(`
      INSERT INTO leitores (nome, cpf_cifrado, cpf_hash, cpf_mascara, email, ativo, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      leitor.nome,
      opcoes.cifrar(leitor.cpf),
      opcoes.hashCpf(leitor.cpf),
      opcoes.mascarar(leitor.cpf),
      leitor.email,
      agoraIso,
      agoraIso
    ).lastInsertRowid)
    idsLeitores.push(id)
  }

  const emprestimos = [
    { exemplar: idsExemplares[0] as number, leitor: idsLeitores[0] as number, retirada: dataRelativa(-20), prevista: dataRelativa(-6) },
    { exemplar: idsExemplares[2] as number, leitor: idsLeitores[1] as number, retirada: dataRelativa(-12), prevista: dataRelativa(2) }
  ]
  const idsEmprestimos: number[] = []
  for (const emprestimo of emprestimos) {
    const id = Number(db.prepare(`
      INSERT INTO emprestimos (exemplar_id, leitor_id, registrado_por_usuario_id, data_emprestimo,
        data_devolucao_prevista, status, criado_em)
      VALUES (?, ?, ?, ?, ?, 'aberto', ?)
    `).run(emprestimo.exemplar, emprestimo.leitor, admin.id, emprestimo.retirada, emprestimo.prevista, agoraIso).lastInsertRowid)
    idsEmprestimos.push(id)
    db.prepare("UPDATE exemplares SET status = 'emprestado', atualizado_em = ? WHERE id = ?").run(agoraIso, emprestimo.exemplar)
  }

  db.prepare(`
    INSERT INTO multas (emprestimo_id, leitor_id, dias_atraso, valor_diario_centavos, teto_centavos,
      valor_centavos, status, registrada_em)
    VALUES (?, ?, 6, 50, 1500, 300, 'pendente', ?)
  `).run(idsEmprestimos[0], idsLeitores[0], agoraIso)

  const reservas = [
    { livro: idsLivros[0] as number, leitor: idsLeitores[1] as number, entrada: dataRelativa(-2) },
    { livro: idsLivros[0] as number, leitor: idsLeitores[2] as number, entrada: dataRelativa(-1) }
  ]
  for (const reserva of reservas) {
    db.prepare(`
      INSERT INTO reservas (livro_id, leitor_id, registrado_por_usuario_id, entrada_em, status, atualizado_em)
      VALUES (?, ?, ?, ?, 'aguardando', ?)
    `).run(reserva.livro, reserva.leitor, admin.id, `${reserva.entrada}T12:00:00Z`, agoraIso)
  }
}

export function executarSeed(db: Banco, opcoes: OpcoesSeed): void {
  const transacao = db.transaction(() => {
    let admin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(opcoes.adminEmail) as { id: number } | undefined
    if (admin === undefined) {
      const id = Number(db.prepare(`
        INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em)
        VALUES ('Administrador', ?, ?, 'ADMIN', 1, ?, ?)
      `).run(opcoes.adminEmail, opcoes.gerarHash(opcoes.adminSenha), agora(), agora()).lastInsertRowid)
      admin = { id }
    }

    const config = db.prepare('SELECT id FROM configuracoes WHERE id = 1').get()
    if (config === undefined) {
      db.prepare(`
        INSERT INTO configuracoes (id, prazo_emprestimo_dias, limite_exemplares_por_leitor, prazo_renovacao_dias,
          limite_reservas_ativas, prazo_retirada_horas, antecedencia_aviso_dias, hora_aviso_atraso,
          valor_diario_multa_centavos, teto_multa_centavos, dias_max_agendamento, timezone,
          atualizado_em, atualizado_por_usuario_id)
        VALUES (1, 14, 3, 7, 3, 24, 2, '08:00', 50, 1500, 3, 'America/Sao_Paulo', ?, ?)
      `).run(agora(), admin.id)
    }

    if (opcoes.incluirExemplos) {
      criarExemplos(db, opcoes)
      preencherCapasPorIsbn(db)
    }
    garantirUsuariosLeitores(db, opcoes)
  })
  transacao()
}
