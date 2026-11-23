import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Section = 'inicio' | 'acervo' | 'leitores' | 'emprestimos' | 'reservas' | 'multas'
type Book = { id: number; title: string; author: string; isbn: string; copies: number; available: number }
type Reader = { id: number; name: string; email: string; activeLoans: number; activeReservations: number }
type Loan = { id: number; readerId: number; bookId: number; borrowedAt: string; dueAt: string; renewed: boolean; returned: boolean }
type Reservation = { id: number; readerId: number; bookId: number; createdAt: string; status: 'Na fila' | 'Avisado' }
type Fine = { id: number; readerId: number; loanId: number; amount: number; paid: boolean }
type Confirmation = { title: string; message: string; confirmLabel: string; onConfirm: () => void }

declare global {
  interface Window {
    biblioteca?: { readonly apiUrl: string }
  }
}

const initialBooks: Book[] = [
  { id: 1, title: 'O pequeno príncipe', author: 'Antoine de Saint-Exupéry', isbn: '9788522031435', copies: 4, available: 2 },
  { id: 2, title: 'Quarto de despejo', author: 'Carolina Maria de Jesus', isbn: '9788508171279', copies: 3, available: 1 },
  { id: 3, title: 'Capitães da Areia', author: 'Jorge Amado', isbn: '9788535911695', copies: 2, available: 0 }
]
const initialReaders: Reader[] = [
  { id: 1, name: 'Ana Souza', email: 'ana.souza@email.com', activeLoans: 1, activeReservations: 0 },
  { id: 2, name: 'Bruno Lima', email: 'bruno.lima@email.com', activeLoans: 2, activeReservations: 1 },
  { id: 3, name: 'Camila Rocha', email: 'camila.rocha@email.com', activeLoans: 0, activeReservations: 0 }
]
const today = new Date()
const dateAfter = (days: number): string => {
  const date = new Date(today)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const initialLoans: Loan[] = [
  { id: 1, readerId: 1, bookId: 1, borrowedAt: dateAfter(-5), dueAt: dateAfter(9), renewed: false, returned: false },
  { id: 2, readerId: 2, bookId: 3, borrowedAt: dateAfter(-19), dueAt: dateAfter(-5), renewed: false, returned: false },
  { id: 3, readerId: 2, bookId: 2, borrowedAt: dateAfter(-3), dueAt: dateAfter(11), renewed: true, returned: false }
]
const initialReservations: Reservation[] = [
  { id: 1, readerId: 2, bookId: 3, createdAt: dateAfter(-1), status: 'Na fila' }
]
const initialFines: Fine[] = [
  { id: 1, readerId: 2, loanId: 2, amount: 2.5, paid: false }
]
const demoPolicy = { loanDays: 14, maxLoans: 3, renewalDays: 7, maxReservations: 3, finePerDay: 0.5, maxFine: 15, reservationHours: 24 }

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Visão geral', icon: 'home' },
  { id: 'acervo', label: 'Acervo', icon: 'book' },
  { id: 'leitores', label: 'Leitores', icon: 'users' },
  { id: 'emprestimos', label: 'Empréstimos', icon: 'loan' },
  { id: 'reservas', label: 'Reservas', icon: 'queue' },
  { id: 'multas', label: 'Multas', icon: 'money' }
]

const sectionTitles: Record<Section, { title: string; description: string }> = {
  inicio: { title: 'Visão geral', description: 'Acompanhe a rotina da biblioteca.' },
  acervo: { title: 'Acervo', description: 'Consulte os livros e a disponibilidade de exemplares.' },
  leitores: { title: 'Leitores', description: 'Consulte e cadastre leitores da comunidade.' },
  emprestimos: { title: 'Empréstimos', description: 'Acompanhe prazos, renovações e devoluções.' },
  reservas: { title: 'Reservas', description: 'Veja a fila de espera por ordem de chegada.' },
  multas: { title: 'Multas', description: 'Consulte valores em aberto e pagamentos.' }
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function Icon({ name }: { name: string }): ReactNode {
  const paths: Record<string, ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z" /><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    loan: <><path d="M7 7h13l-3-3M17 17H4l3 3" /><path d="M20 7v5M4 17v-5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9H6m12 6h-1" /></>,
    queue: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>
  }
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.book}</svg>
}

function App() {
  const [section, setSection] = useState<Section>('inicio')
  const [books, setBooks] = useState(initialBooks)
  const [readers, setReaders] = useState(initialReaders)
  const [loans, setLoans] = useState(initialLoans)
  const [reservations, setReservations] = useState(initialReservations)
  const [fines, setFines] = useState(initialFines)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editingReader, setEditingReader] = useState<Reader | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null)
  const [activeForm, setActiveForm] = useState<'book' | 'reader' | 'loan' | null>(null)
  const apiUrl = window.biblioteca?.apiUrl

  const activeLoans = loans.filter((loan) => !loan.returned)
  const openFines = fines.filter((fine) => !fine.paid)
  const overdueLoans = activeLoans.filter((loan) => loan.dueAt < dateAfter(0))
  const title = sectionTitles[section]

  const filteredBooks = useMemo(() => books.filter((book) => `${book.title} ${book.author} ${book.isbn}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [books, search])
  const filteredReaders = useMemo(() => readers.filter((reader) => `${reader.name} ${reader.email}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [readers, search])
  const filteredLoans = useMemo(() => activeLoans.filter((loan) => {
    const reader = readers.find((item) => item.id === loan.readerId)?.name ?? ''
    const book = books.find((item) => item.id === loan.bookId)?.title ?? ''
    return `${reader} ${book}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  }), [activeLoans, books, readers, search])

  function showNotice(message: string, tone: 'success' | 'error' | 'info' = 'success'): void {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 4500)
  }

  function addBook(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const titleValue = String(form.get('title') ?? '').trim()
    const author = String(form.get('author') ?? '').trim()
    const isbn = String(form.get('isbn') ?? '').trim()
    const copies = Number(form.get('copies'))
    if (!titleValue || !author || !/^\d{10}(\d{3})?$/.test(isbn) || !Number.isInteger(copies) || copies < 1) {
      showNotice('Confira os campos: ISBN deve ter 10 ou 13 números e o acervo precisa de ao menos um exemplar.', 'error')
      return
    }
    if (editingBook) {
      const checkedOut = editingBook.copies - editingBook.available
      if (copies < checkedOut) {
        showNotice(`Há ${checkedOut} exemplar${checkedOut === 1 ? '' : 'es'} emprestado${checkedOut === 1 ? '' : 's'}. O total não pode ficar abaixo disso.`, 'error')
        return
      }
      setBooks((current) => current.map((book) => book.id === editingBook.id ? { ...book, title: titleValue, author, isbn, copies, available: copies - checkedOut } : book))
      setEditingBook(null)
      setActiveForm(null)
      showNotice('Cadastro do livro atualizado nos dados demonstrativos.')
      return
    }
    setBooks((current) => [{ id: Date.now(), title: titleValue, author, isbn, copies, available: copies }, ...current])
    setActiveForm(null)
    showNotice('Livro adicionado ao acervo demonstrativo.')
  }

  function addReader(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showNotice('Informe o nome completo e um e-mail válido.', 'error')
      return
    }
    if (editingReader) {
      setReaders((current) => current.map((reader) => reader.id === editingReader.id ? { ...reader, name, email } : reader))
      setEditingReader(null)
      setActiveForm(null)
      showNotice('Cadastro do leitor atualizado nos dados demonstrativos.')
      return
    }
    setReaders((current) => [{ id: Date.now(), name, email, activeLoans: 0, activeReservations: 0 }, ...current])
    setActiveForm(null)
    showNotice('Leitor adicionado ao cadastro demonstrativo.')
  }

  function addLoan(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const readerId = Number(form.get('readerId'))
    const bookId = Number(form.get('bookId'))
    const reader = readers.find((item) => item.id === readerId)
    const book = books.find((item) => item.id === bookId)
    if (!reader || !book) {
      showNotice('Selecione um leitor e um livro válidos.', 'error')
      return
    }
    const readerLoans = activeLoans.filter((loan) => loan.readerId === readerId).length
    if (readerLoans >= demoPolicy.maxLoans) {
      showNotice(`Este leitor já atingiu o limite de ${demoPolicy.maxLoans} empréstimos ativos.`, 'error')
      return
    }
    if (book.available < 1) {
      showNotice('Não há exemplares disponíveis. Consulte a fila de reservas.', 'error')
      return
    }
    const borrowedAt = dateAfter(0)
    const dueAt = dateAfter(demoPolicy.loanDays)
    setLoans((current) => [{ id: Date.now(), readerId, bookId, borrowedAt, dueAt, renewed: false, returned: false }, ...current])
    setBooks((current) => current.map((item) => item.id === bookId ? { ...item, available: item.available - 1 } : item))
    setReaders((current) => current.map((item) => item.id === readerId ? { ...item, activeLoans: item.activeLoans + 1 } : item))
    setActiveForm(null)
    showNotice(`Empréstimo registrado. Devolução prevista para ${formatDate(dueAt)}.`)
  }

  function returnLoan(loan: Loan): void {
    setConfirmation({
      title: 'Confirmar devolução',
      message: 'Confirma que este exemplar foi devolvido?',
      confirmLabel: 'Registrar devolução',
      onConfirm: () => completeReturn(loan)
    })
  }

  function completeReturn(loan: Loan): void {
    setLoans((current) => current.map((item) => item.id === loan.id ? { ...item, returned: true } : item))
    setBooks((current) => current.map((item) => item.id === loan.bookId ? { ...item, available: item.available + 1 } : item))
    setReaders((current) => current.map((item) => item.id === loan.readerId ? { ...item, activeLoans: Math.max(0, item.activeLoans - 1) } : item))
    if (loan.dueAt < dateAfter(0)) {
      const daysLate = Math.max(1, Math.floor((today.getTime() - new Date(`${loan.dueAt}T12:00:00`).getTime()) / 86400000))
      const amount = Math.min(daysLate * demoPolicy.finePerDay, demoPolicy.maxFine)
      setFines((current) => [...current, { id: Date.now(), readerId: loan.readerId, loanId: loan.id, amount, paid: false }])
      showNotice(`Devolução registrada. Multa calculada: ${formatMoney(amount)}.`)
    } else {
      showNotice('Devolução registrada.')
    }
  }

  function renewLoan(loan: Loan): void {
    if (loan.renewed) {
      showNotice('Este empréstimo já usou a renovação permitida.', 'error')
      return
    }
    if (reservations.some((reservation) => reservation.bookId === loan.bookId && reservation.status === 'Na fila')) {
      showNotice('Não é possível renovar: há leitores aguardando este livro.', 'error')
      return
    }
    const date = new Date(`${loan.dueAt}T12:00:00`)
    date.setDate(date.getDate() + demoPolicy.renewalDays)
    const dueAt = date.toISOString().slice(0, 10)
    setLoans((current) => current.map((item) => item.id === loan.id ? { ...item, dueAt, renewed: true } : item))
    showNotice(`Empréstimo renovado até ${formatDate(dueAt)}.`)
  }

  function reserveBook(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const readerId = Number(form.get('readerId'))
    const bookId = Number(form.get('bookId'))
    const reader = readers.find((item) => item.id === readerId)
    const book = books.find((item) => item.id === bookId)
    const currentReservations = reservations.filter((item) => item.readerId === readerId).length
    if (!reader || !book) {
      showNotice('Selecione um leitor e um livro válidos.', 'error')
      return
    }
    if (currentReservations >= demoPolicy.maxReservations) {
      showNotice(`Este leitor já atingiu o limite de ${demoPolicy.maxReservations} reservas ativas.`, 'error')
      return
    }
    if (book.available > 0) {
      showNotice('Este livro tem exemplar disponível. O agendamento depende da integração da API.', 'info')
      return
    }
    setReservations((current) => [...current, { id: Date.now(), readerId, bookId, createdAt: dateAfter(0), status: 'Na fila' }])
    setReaders((current) => current.map((item) => item.id === readerId ? { ...item, activeReservations: item.activeReservations + 1 } : item))
    setActiveForm(null)
    showNotice('Leitor incluído no fim da fila de espera.')
  }

  function payFine(fine: Fine): void {
    setConfirmation({
      title: 'Confirmar pagamento',
      message: `Confirma o registro do pagamento de ${formatMoney(fine.amount)}?`,
      confirmLabel: 'Registrar pagamento',
      onConfirm: () => completeFinePayment(fine)
    })
  }

  function completeFinePayment(fine: Fine): void {
    setFines((current) => current.map((item) => item.id === fine.id ? { ...item, paid: true } : item))
    showNotice('Pagamento registrado nos dados demonstrativos.')
  }

  function cancelReservation(reservation: Reservation): void {
    setConfirmation({
      title: 'Remover da fila de espera',
      message: 'O leitor deixará de aguardar este livro. Deseja continuar?',
      confirmLabel: 'Sair da fila',
      onConfirm: () => completeReservationCancellation(reservation)
    })
  }

  function completeReservationCancellation(reservation: Reservation): void {
    setReservations((current) => current.filter((item) => item.id !== reservation.id))
    setReaders((current) => current.map((reader) => reader.id === reservation.readerId ? { ...reader, activeReservations: Math.max(0, reader.activeReservations - 1) } : reader))
    showNotice('Reserva removida da fila demonstrativa.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Icon name="book" /></div>
          <div><strong>Biblioteca</strong><span>Comunitária</span></div>
        </div>
        <div className="nav-caption">MENU</div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button className={`nav-item ${section === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSection(item.id); setSearch(''); setActiveForm(null) }} aria-current={section === item.id ? 'page' : undefined}>
              <span className="nav-symbol"><Icon name={item.icon} /></span>{item.label}
              {item.id === 'multas' && openFines.length > 0 && <span className="nav-count">{openFines.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-label"><span className="status-dot" />Modo demonstrativo</div>
          <p>Os dados desta tela ficam somente nesta sessão e não são enviados ao servidor.</p>
          <p className="api-caption">{apiUrl ? `API configurada: ${apiUrl}` : 'URL da API não disponível pelo preload'}</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Biblioteca</span><span aria-hidden="true">/</span><strong>{title.title}</strong></div>
          <div className="topbar-status"><span className="status-dot" />Dados locais de demonstração</div>
        </header>
        <div className="content-wrap">
          <section className="page-heading">
            <div><h1>{title.title}</h1><p>{title.description}</p></div>
            <div className="heading-actions">
              {(section === 'acervo' || section === 'leitores') && <button className="button primary" onClick={() => { setEditingBook(null); setEditingReader(null); setActiveForm(section === 'acervo' ? 'book' : 'reader') }}><Icon name="plus" />{section === 'acervo' ? 'Adicionar livro' : 'Cadastrar leitor'}</button>}
              {section === 'emprestimos' && <button className="button primary" onClick={() => setActiveForm('loan')}><Icon name="plus" />Novo empréstimo</button>}
              {section === 'reservas' && <button className="button primary" onClick={() => setActiveForm('loan')}><Icon name="plus" />Entrar na fila</button>}
            </div>
          </section>

          {activeForm && <InlineForm kind={activeForm} books={books} readers={readers} editingBook={editingBook} editingReader={editingReader} reservationFirst={section === 'reservas'} onClose={() => { setActiveForm(null); setEditingBook(null); setEditingReader(null) }} onBook={addBook} onReader={addReader} onLoan={addLoan} onReservation={reserveBook} />}

          {section === 'inicio' && <Dashboard books={books} readers={readers} loans={activeLoans} overdue={overdueLoans.length} openFines={openFines.length} reservations={reservations} onNavigate={setSection} />}
          {section === 'acervo' && <BooksPage books={filteredBooks} search={search} onSearch={setSearch} onEdit={(book) => { setEditingBook(book); setEditingReader(null); setActiveForm('book') }} />}
          {section === 'leitores' && <ReadersPage readers={filteredReaders} search={search} onSearch={setSearch} onEdit={(reader) => { setEditingReader(reader); setEditingBook(null); setActiveForm('reader') }} />}
          {section === 'emprestimos' && <LoansPage loans={filteredLoans} books={books} readers={readers} onReturn={returnLoan} onRenew={renewLoan} search={search} onSearch={setSearch} />}
          {section === 'reservas' && <ReservationsPage reservations={reservations} books={books} readers={readers} onCancel={cancelReservation} />}
          {section === 'multas' && <FinesPage fines={fines} readers={readers} onPay={payFine} />}
          <footer className="page-footer">Biblioteca Comunitária <span>•</span> Protótipo de interface · sem persistência</footer>
        </div>
      </main>
      {notice && <div className={`toast ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span className="toast-icon"><Icon name={notice.tone === 'success' ? 'check' : notice.tone === 'error' ? 'close' : 'clock'} /></span><span>{notice.message}</span><button aria-label="Fechar aviso" onClick={() => setNotice(null)}><Icon name="close" /></button></div>}
      {confirmation && <ConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  )
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }): ReactNode {
  return <label className="search-box"><Icon name="search" /><span className="sr-only">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} /></label>
}

function InlineForm({ kind, books, readers, editingBook, editingReader, reservationFirst, onClose, onBook, onReader, onLoan, onReservation }: {
  kind: 'book' | 'reader' | 'loan'; books: Book[]; readers: Reader[]; editingBook: Book | null; editingReader: Reader | null; reservationFirst: boolean; onClose: () => void;
  onBook: (event: FormEvent<HTMLFormElement>) => void; onReader: (event: FormEvent<HTMLFormElement>) => void;
  onLoan: (event: FormEvent<HTMLFormElement>) => void; onReservation: (event: FormEvent<HTMLFormElement>) => void
}): ReactNode {
  const title = kind === 'book' ? editingBook ? 'Editar livro do acervo' : 'Adicionar livro ao acervo' : kind === 'reader' ? editingReader ? 'Editar cadastro do leitor' : 'Cadastrar leitor' : 'Registrar empréstimo ou reserva'
  const submit = kind === 'book' ? onBook : kind === 'reader' ? onReader : onLoan
  const [mode, setMode] = useState<'loan' | 'reservation'>(reservationFirst ? 'reservation' : 'loan')
  const handleSubmit = mode === 'reservation' ? onReservation : submit
  return (
    <section className="inline-form" aria-labelledby="form-title">
      <div className="form-heading"><div><h2 id="form-title">{title}</h2><p>Campos com * são obrigatórios.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar formulário"><Icon name="close" /></button></div>
      {kind === 'book' && <form onSubmit={onBook} className="form-grid">
        <Field label="Título *" name="title" required placeholder="Ex.: O pequeno príncipe" defaultValue={editingBook?.title} />
        <Field label="Autor *" name="author" required placeholder="Nome do autor" defaultValue={editingBook?.author} />
        <Field label="ISBN *" name="isbn" required inputMode="numeric" minLength={10} maxLength={13} placeholder="10 ou 13 números" defaultValue={editingBook?.isbn} />
        <Field label="Exemplares *" name="copies" required type="number" min={1} defaultValue={String(editingBook?.copies ?? 1)} />
        <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">{editingBook ? 'Salvar alterações' : 'Adicionar ao acervo'}</button></div>
      </form>}
      {kind === 'reader' && <form onSubmit={onReader} className="form-grid">
        <Field label="Nome completo *" name="name" required minLength={3} placeholder="Nome do leitor" defaultValue={editingReader?.name} />
        <Field label="E-mail *" name="email" type="email" required placeholder="nome@email.com" defaultValue={editingReader?.email} />
        <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">{editingReader ? 'Salvar alterações' : 'Cadastrar leitor'}</button></div>
      </form>}
      {kind === 'loan' && <>
        <div className="mode-switch" role="group" aria-label="Tipo de operação"><button className={mode === 'loan' ? 'active' : ''} onClick={() => setMode('loan')}>Empréstimo</button><button className={mode === 'reservation' ? 'active' : ''} onClick={() => setMode('reservation')}>Fila de espera</button></div>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field"><span>Leitor *</span><select name="readerId" required defaultValue=""><option value="" disabled>Selecione um leitor</option>{readers.map((reader) => <option key={reader.id} value={reader.id}>{reader.name} · {reader.activeLoans} empréstimos ativos</option>)}</select></label>
          <label className="field"><span>Livro *</span><select name="bookId" required defaultValue=""><option value="" disabled>Selecione um livro</option>{books.map((book) => <option key={book.id} value={book.id} disabled={mode === 'loan' ? book.available < 1 : book.available > 0}>{book.title} · {mode === 'loan' ? `${book.available} disponíveis` : `${book.available > 0 ? 'Disponível' : 'Na fila'}`}</option>)}</select></label>
          <p className="form-hint">{mode === 'loan' ? `Prazo inicial de ${demoPolicy.loanDays} dias. Limite de ${demoPolicy.maxLoans} empréstimos ativos por leitor.` : `A fila segue ordem de chegada. Limite de ${demoPolicy.maxReservations} reservas ativas por leitor.`}</p>
          <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">{mode === 'loan' ? 'Registrar empréstimo' : 'Entrar na fila'}</button></div>
        </form>
      </>}
    </section>
  )
}

function Field(props: { label: string; name: string; type?: string; required?: boolean; min?: number; minLength?: number; maxLength?: number; inputMode?: 'numeric'; placeholder?: string; defaultValue?: string }): ReactNode {
  return <label className="field"><span>{props.label}</span><input name={props.name} type={props.type ?? 'text'} required={props.required} min={props.min} minLength={props.minLength} maxLength={props.maxLength} inputMode={props.inputMode} placeholder={props.placeholder} defaultValue={props.defaultValue} /></label>
}

function ConfirmDialog({ request, onClose }: { request: Confirmation; onClose: () => void }): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  return <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="confirmation-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="confirm-content">
      <h2 id="confirmation-title">{request.title}</h2>
      <p>{request.message}</p>
      <div className="form-actions"><button type="button" className="button secondary" autoFocus onClick={onClose}>Cancelar</button><button type="button" className="button primary" onClick={() => { request.onConfirm(); onClose() }}>{request.confirmLabel}</button></div>
    </div>
  </dialog>
}

function Dashboard({ books, readers, loans, overdue, openFines, reservations, onNavigate }: { books: Book[]; readers: Reader[]; loans: Loan[]; overdue: number; openFines: number; reservations: Reservation[]; onNavigate: (section: Section) => void }): ReactNode {
  const metrics = [
    { label: 'Livros no acervo', value: books.reduce((total, book) => total + book.copies, 0), note: `${books.length} títulos cadastrados`, icon: 'book', section: 'acervo' as Section },
    { label: 'Leitores ativos', value: readers.length, note: 'Cadastros demonstrativos', icon: 'users', section: 'leitores' as Section },
    { label: 'Empréstimos ativos', value: loans.length, note: `${overdue} em atraso`, icon: 'loan', section: 'emprestimos' as Section },
    { label: 'Reservas na fila', value: reservations.length, note: `${openFines} multas em aberto`, icon: 'clock', section: 'reservas' as Section }
  ]
  return <>
    <section className="welcome-banner"><div><span className="banner-icon"><Icon name="book" /></span><div><h2>Bem-vindo à biblioteca</h2><p>Este protótipo usa dados demonstrativos. As alterações valem apenas durante esta sessão.</p></div></div><button className="button light" onClick={() => onNavigate('acervo')}>Consultar acervo <Icon name="arrow" /></button></section>
    <section className="metric-grid" aria-label="Resumo da biblioteca">{metrics.map((metric) => <button className="metric-card" key={metric.label} onClick={() => onNavigate(metric.section)}><span className="metric-icon"><Icon name={metric.icon} /></span><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><span className="metric-note">{metric.note}</span></button>)}</section>
    <section className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Atalhos</h2><p>Acesse as áreas principais.</p></div></div><div className="shortcut-list">{navItems.slice(1).map((item) => <button key={item.id} className="shortcut" onClick={() => onNavigate(item.id)}><span className="shortcut-symbol"><Icon name={item.icon} /></span><span>{item.label}</span><Icon name="arrow" /></button>)}</div></div><div className="panel rules-panel"><div className="panel-heading"><div><h2>Regras da biblioteca</h2><p>Parâmetros definidos no projeto.</p></div></div><ul className="rules-list"><li><span>Prazo de empréstimo</span><strong>{demoPolicy.loanDays} dias</strong></li><li><span>Limite por leitor</span><strong>{demoPolicy.maxLoans} exemplares</strong></li><li><span>Renovação</span><strong>1 vez · +{demoPolicy.renewalDays} dias</strong></li><li><span>Multa diária</span><strong>{formatMoney(demoPolicy.finePerDay)} · teto {formatMoney(demoPolicy.maxFine)}</strong></li><li><span>Reserva ativa</span><strong>Até {demoPolicy.maxReservations} por leitor</strong></li></ul></div></section>
  </>
}

function BooksPage({ books, search, onSearch, onEdit }: { books: Book[]; search: string; onSearch: (value: string) => void; onEdit: (book: Book) => void }): ReactNode {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Livros cadastrados</h2><p>{books.length} resultado{books.length === 1 ? '' : 's'}</p></div><SearchBox value={search} onChange={onSearch} label="Buscar por título, autor ou ISBN" /></div>{books.length === 0 ? <EmptyState title="Nenhum livro encontrado" detail="Tente outro termo ou adicione um título ao acervo." /> : <div className="table-scroll"><table><thead><tr><th scope="col">Livro</th><th scope="col">ISBN</th><th scope="col">Exemplares</th><th scope="col">Disponibilidade</th><th scope="col">Ação</th></tr></thead><tbody>{books.map((book) => <tr key={book.id}><td><strong>{book.title}</strong><span className="cell-subtitle">{book.author}</span></td><td className="mono">{book.isbn}</td><td>{book.copies}</td><td><Availability available={book.available} /></td><td><button className="button small secondary" onClick={() => onEdit(book)}>Editar</button></td></tr>)}</tbody></table></div>}</section>
}

function ReadersPage({ readers, search, onSearch, onEdit }: { readers: Reader[]; search: string; onSearch: (value: string) => void; onEdit: (reader: Reader) => void }): ReactNode {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Leitores cadastrados</h2><p>{readers.length} resultado{readers.length === 1 ? '' : 's'}</p></div><SearchBox value={search} onChange={onSearch} label="Buscar por nome ou e-mail" /></div>{readers.length === 0 ? <EmptyState title="Nenhum leitor encontrado" detail="Tente outro termo ou cadastre um leitor." /> : <div className="table-scroll"><table><thead><tr><th scope="col">Leitor</th><th scope="col">Empréstimos ativos</th><th scope="col">Reservas ativas</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead><tbody>{readers.map((reader) => <tr key={reader.id}><td><strong>{reader.name}</strong><span className="cell-subtitle">{reader.email}</span></td><td>{reader.activeLoans} de {demoPolicy.maxLoans}</td><td>{reader.activeReservations} de {demoPolicy.maxReservations}</td><td><span className="badge good">Ativo</span></td><td><button className="button small secondary" onClick={() => onEdit(reader)}>Editar</button></td></tr>)}</tbody></table></div>}</section>
}

function LoansPage({ loans, books, readers, onReturn, onRenew, search, onSearch }: { loans: Loan[]; books: Book[]; readers: Reader[]; onReturn: (loan: Loan) => void; onRenew: (loan: Loan) => void; search: string; onSearch: (value: string) => void }): ReactNode {
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Empréstimos em andamento</h2><p>{loans.length} empréstimo{loans.length === 1 ? '' : 's'}</p></div><SearchBox value={search} onChange={onSearch} label="Buscar por leitor ou livro" /></div>{loans.length === 0 ? <EmptyState title="Nenhum empréstimo ativo" detail="Use “Novo empréstimo” para registrar uma retirada." /> : <div className="table-scroll"><table><thead><tr><th scope="col">Leitor e livro</th><th scope="col">Retirada</th><th scope="col">Devolução</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>{loans.map((loan) => { const reader = readers.find((item) => item.id === loan.readerId); const book = books.find((item) => item.id === loan.bookId); const late = loan.dueAt < dateAfter(0); return <tr key={loan.id}><td><strong>{reader?.name ?? 'Leitor indisponível'}</strong><span className="cell-subtitle">{book?.title ?? 'Livro indisponível'}</span></td><td>{formatDate(loan.borrowedAt)}</td><td>{formatDate(loan.dueAt)}</td><td><span className={`badge ${late ? 'danger' : 'good'}`}>{late ? 'Em atraso' : 'Em dia'}</span>{loan.renewed && <span className="cell-subtitle">Renovado</span>}</td><td><div className="row-actions"><button className="button small secondary" onClick={() => onRenew(loan)} disabled={loan.renewed} title={loan.renewed ? 'Renovação já utilizada' : 'Renovar por 7 dias'}>Renovar</button><button className="button small primary" onClick={() => onReturn(loan)}>Devolver</button></div></td></tr> })}</tbody></table></div>}</section>
}

function ReservationsPage({ reservations, books, readers, onCancel }: { reservations: Reservation[]; books: Book[]; readers: Reader[]; onCancel: (reservation: Reservation) => void }): ReactNode {
  const ordered = [...reservations].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
  return <section className="panel table-panel"><div className="table-toolbar"><div><h2>Fila de espera</h2><p>Ordem de chegada · {ordered.length} reserva{ordered.length === 1 ? '' : 's'} ativa{ordered.length === 1 ? '' : 's'}</p></div></div>{ordered.length === 0 ? <EmptyState title="Fila vazia" detail="Quando um livro estiver indisponível, você poderá incluir um leitor na fila." /> : <div className="table-scroll"><table><thead><tr><th scope="col">Posição</th><th scope="col">Leitor</th><th scope="col">Livro</th><th scope="col">Entrada na fila</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead><tbody>{ordered.map((reservation, index) => <tr key={reservation.id}><td><span className="queue-position">{index + 1}</span></td><td><strong>{readers.find((reader) => reader.id === reservation.readerId)?.name ?? 'Leitor indisponível'}</strong></td><td>{books.find((book) => book.id === reservation.bookId)?.title ?? 'Livro indisponível'}</td><td>{formatDate(reservation.createdAt)}</td><td><span className="badge info">{reservation.status}</span></td><td><button className="button small secondary" onClick={() => onCancel(reservation)}>Sair da fila</button></td></tr>)}</tbody></table></div>}<p className="notice-line"><Icon name="clock" /> A pessoa avisada tem {demoPolicy.reservationHours} horas para retirar. O prazo pode ser prorrogado em fins de semana e feriados.</p></section>
}

function FinesPage({ fines, readers, onPay }: { fines: Fine[]; readers: Reader[]; onPay: (fine: Fine) => void }): ReactNode {
  const open = fines.filter((fine) => !fine.paid)
  const paid = fines.filter((fine) => fine.paid)
  return <><section className="fine-summary"><div><span>Em aberto</span><strong>{formatMoney(open.reduce((total, fine) => total + fine.amount, 0))}</strong><small>{open.length} cobrança{open.length === 1 ? '' : 's'} pendente{open.length === 1 ? '' : 's'}</small></div><div><span>Pago</span><strong>{formatMoney(paid.reduce((total, fine) => total + fine.amount, 0))}</strong><small>{paid.length} pagamento{paid.length === 1 ? '' : 's'} registrado{paid.length === 1 ? '' : 's'}</small></div></section><section className="panel table-panel"><div className="table-toolbar"><div><h2>Multas registradas</h2><p>{formatMoney(demoPolicy.finePerDay)} por dia de atraso · limite de {formatMoney(demoPolicy.maxFine)}</p></div></div>{fines.length === 0 ? <EmptyState title="Nenhuma multa registrada" detail="Multas são calculadas quando um livro em atraso é devolvido." /> : <div className="table-scroll"><table><thead><tr><th scope="col">Leitor</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead><tbody>{fines.map((fine) => <tr key={fine.id}><td><strong>{readers.find((reader) => reader.id === fine.readerId)?.name ?? 'Leitor indisponível'}</strong><span className="cell-subtitle">Empréstimo #{fine.loanId}</span></td><td className="money">{formatMoney(fine.amount)}</td><td><span className={`badge ${fine.paid ? 'good' : 'warning'}`}>{fine.paid ? 'Paga' : 'Em aberto'}</span></td><td>{!fine.paid && <button className="button small secondary" onClick={() => onPay(fine)}>Registrar pagamento</button>}</td></tr>)}</tbody></table></div>}</section></>
}

function Availability({ available }: { available: number }): ReactNode {
  return <span className={`availability ${available === 0 ? 'unavailable' : ''}`}><span />{available > 0 ? `${available} ${available === 1 ? 'disponível' : 'disponíveis'}` : 'Indisponível'}</span>
}

function EmptyState({ title, detail }: { title: string; detail: string }): ReactNode {
  return <div className="empty-state"><span className="empty-mark"><Icon name="search" /></span><strong>{title}</strong><p>{detail}</p></div>
}

const elemento = document.getElementById('root')
if (elemento === null) throw new Error('Elemento #root não encontrado')

createRoot(elemento).render(<StrictMode><App /></StrictMode>)
