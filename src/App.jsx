import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callAI, formatDate, isMissingRelation, relativeDays, sb, spineColor } from "./lib";

const ADMIN_EMAIL = "szxv7704@gmail.com";
const INVITE_TOKEN_KEY = "bookeunsungzang_invite_token";

const LIBRARY_CLASSES = [
  { code: "000", range: "000–099", name: "총류", note: "지식·정보·컴퓨터" },
  { code: "100", range: "100–199", name: "철학", note: "철학·심리·윤리" },
  { code: "200", range: "200–299", name: "종교", note: "종교·신앙·신화" },
  { code: "300", range: "300–399", name: "사회과학", note: "사회·경제·교육" },
  { code: "400", range: "400–499", name: "자연과학", note: "수학·과학·자연" },
  { code: "500", range: "500–599", name: "기술과학", note: "의학·공학·생활" },
  { code: "600", range: "600–699", name: "예술", note: "예술·취미·스포츠" },
  { code: "700", range: "700–799", name: "언어", note: "언어·국어·외국어" },
  { code: "800", range: "800–899", name: "문학", note: "소설·시·에세이" },
  { code: "900", range: "900–999", name: "역사", note: "역사·지리·여행" },
];

function classificationGroup(code) {
  const raw = String(code ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const value = raw.padStart(3, "0");
  return LIBRARY_CLASSES.find((item) => item.code[0] === value[0]) || null;
}

function classificationFromCategory(categoryName = "") {
  const name = categoryName.toLowerCase();
  const rules = [
    ["000", /컴퓨터|인터넷|잡지|백과|사전|도서관|문헌정보|출판/],
    ["100", /철학|심리|윤리|인문학/],
    ["200", /종교|기독교|불교|천주교|신화/],
    ["300", /사회과학|경제|경영|정치|법률|교육|육아|청소년/],
    ["400", /자연과학|수학|물리|화학|생명과학|지구과학|과학/],
    ["500", /기술|공학|의학|건강|건축|농업|요리|가정|생활과학/],
    ["600", /예술|대중문화|미술|음악|사진|디자인|영화|취미|스포츠/],
    ["700", /언어|외국어|국어|영어|일본어|중국어/],
    ["800", /소설|시|희곡|에세이|문학|고전/],
    ["900", /역사|지리|여행|전기|인물/],
  ];
  return rules.find(([, pattern]) => pattern.test(name))?.[0] || "";
}

function classificationSchemaMissing(error) {
  return /classification_code|source_category|schema cache/i.test(error?.message || "");
}

function pendingInviteToken() {
  const fromHash = window.location.hash.match(/^#\/invite\/([0-9a-f-]{36})$/i)?.[1] || "";
  if (fromHash) {
    try { window.sessionStorage.setItem(INVITE_TOKEN_KEY, fromHash); } catch { /* 일회성 초대 토큰 저장을 지원하지 않는 브라우저 */ }
    return fromHash;
  }
  try { return window.sessionStorage.getItem(INVITE_TOKEN_KEY) || ""; } catch { return ""; }
}

const SOURCE_LABELS = {
  revisit: "다시 읽고 나서",
  ai: "AI와 대화한 후",
  sarangbang: "사랑방에서 이야기한 후",
  reader: "다른 사람의 답을 읽은 후",
  life: "일상에서 문득",
};

function ErrorNote({ children }) {
  return children ? <div className="notice error">{children}</div> : null;
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><img src="/icon-192.png" alt="" /></span>
      <span>책은성장</span>
    </div>
  );
}

function Auth({ invited = false }) {
  const [error, setError] = useState("");
  const signIn = async () => {
    setError("");
    const { error: authError } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (authError) setError(authError.message);
  };

  return (
    <main className="auth-page">
      <div className="auth-seal"><img src="/icon-192.png" alt="책은성장 단청 처마" /></div>
      <h1>책은성장</h1>
      <p>{invited ? <>사랑방 초대장이 도착했습니다.<br />초대받은 Google 계정으로 들어오세요.</> : <>읽은 문장이 질문이 되고,<br />나눈 생각이 한 권의 책이 됩니다.</>}</p>
      <ErrorNote>{error}</ErrorNote>
      <button className="primary wide" onClick={signIn}>{invited ? "Google로 초대 수락하기" : "Google로 서재 열기"}</button>
      <small>나의 기록은 서재에, 함께 나눈 생각은 사랑방에 머뭅니다.</small>
    </main>
  );
}

function Nickname({ userId, onDone }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    if (!name.trim()) return;
    const { error: saveError } = await sb.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    if (saveError) setError(saveError.message);
    else onDone();
  };
  return (
    <main className="auth-page compact">
      <Brand />
      <h2>사랑방에서 불릴 이름</h2>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름 또는 별명" autoFocus />
      <ErrorNote>{error}</ErrorNote>
      <button className="primary wide" onClick={save}>서재에 들어가기</button>
    </main>
  );
}

function InviteOnly({ error = "" }) {
  return <main className="auth-page compact">
    <Brand />
    <h2>초대받은 사랑방입니다</h2>
    <p>책은성장은 초대받은 Google 계정으로만 들어올 수 있습니다.<br />초대를 받은 계정이 맞는지 확인해 주세요.</p>
    <ErrorNote>{error}</ErrorNote>
    <button className="secondary wide" onClick={() => sb.auth.signOut()}>다른 Google 계정으로 로그인</button>
  </main>;
}

async function loadThoughts(quoteIds) {
  if (!quoteIds.length) return { rows: [], available: true };
  const { data, error } = await sb.from("quote_thoughts").select("*").in("quote_id", quoteIds).order("created_at");
  if (isMissingRelation(error)) return { rows: [], available: false };
  if (error) throw error;
  return { rows: data || [], available: true };
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet-panel">
        <div className="sheet-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="닫기">×</button></div>
        {children}
      </section>
    </div>
  );
}

function ThoughtEditor({ quote, thought, onClose, onSaved }) {
  const initial = thought?.content ?? quote?.memo ?? "";
  const [content, setContent] = useState(initial);
  const [source, setSource] = useState(thought?.source || "revisit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isInitial = thought?.kind === "initial";

  const save = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError("");
    let result;
    if (isInitial) {
      result = await sb.from("quotes").update({ memo: content.trim() }).eq("id", quote.id);
    } else if (thought?.id) {
      result = await sb.from("quote_thoughts").update({ content: content.trim(), source }).eq("id", thought.id);
    } else {
      result = await sb.from("quote_thoughts").insert({ quote_id: quote.id, book_id: quote.book_id, content: content.trim(), source });
    }
    setBusy(false);
    if (result.error) setError(isMissingRelation(result.error) ? "새 생각을 저장하려면 함께 추가된 데이터베이스 업데이트를 먼저 적용해야 합니다." : result.error.message);
    else onSaved();
  };

  return (
    <Sheet title={isInitial ? "생각 수정하기" : thought?.id ? "덧붙인 생각 수정하기" : "새로운 생각 덧붙이기"} onClose={onClose}>
      {!isInitial && (
        <label className="field"><span>생각이 생긴 계기</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>나의 생각</span>
        <textarea rows="7" value={content} onChange={(event) => setContent(event.target.value)} autoFocus placeholder="지금은 이 문장이 어떻게 다가오나요?" />
      </label>
      <ErrorNote>{error}</ErrorNote>
      <button className="primary wide" disabled={busy || !content.trim()} onClick={save}>{busy ? "담는 중…" : "생각 남기기"}</button>
    </Sheet>
  );
}

function ThoughtTimeline({ quote, thoughts, onEdit, onAppend, compact = false }) {
  const entries = [
    ...(quote.memo ? [{ id: `initial-${quote.id}`, kind: "initial", content: quote.memo, created_at: quote.created_at }] : []),
    ...thoughts,
  ];
  return (
    <div className={`thought-timeline ${compact ? "compact" : ""}`}>
      {entries.length ? entries.map((entry) => (
        <article className="thought-entry" key={entry.id}>
          <div className="thought-dot" />
          <div className="thought-body">
            <div className="thought-meta">
              <time>{formatDate(entry.created_at)}</time>
              {entry.source && <span>{SOURCE_LABELS[entry.source] || "덧붙인 생각"}</span>}
              {onEdit && <button onClick={() => onEdit(entry)}>수정</button>}
            </div>
            <p>{entry.content}</p>
          </div>
        </article>
      )) : <p className="muted">아직 남긴 생각이 없습니다.</p>}
      {onAppend && <button className="text-button append" onClick={onAppend}>＋ 새로운 생각 덧붙이기</button>}
    </div>
  );
}

function DailyQuote({ quote, book, thoughts, onOpen, onAppend }) {
  return (
    <section className="daily-quote">
      <div className="eyebrow">오늘 다시 만난 문장</div>
      <blockquote>“{quote.content}”</blockquote>
      <div className="quote-source">《{book?.title || "책"}》{quote.page ? ` · ${quote.page}쪽` : ""} · {relativeDays(quote.created_at)} 기록</div>
      <ThoughtTimeline quote={quote} thoughts={thoughts} compact />
      <div className="button-row">
        <button className="primary" onClick={onAppend}>지금의 생각 덧붙이기</button>
        <button className="secondary" onClick={onOpen}>관련 기록 보기</button>
      </div>
    </section>
  );
}

function NotificationBell({ me, onOpenShared }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("reading_notifications").select("*").eq("recipient_id", me.id).order("created_at", { ascending: false }).limit(40);
    if (error) { if (selectiveSharingError(error)) setAvailable(false); return; }
    setAvailable(true); setRows(data || []);
  }, [me.id]);
  useEffect(() => {
    load();
    const channel = sb.channel(`notifications-${me.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "reading_notifications", filter: `recipient_id=eq.${me.id}` }, load).subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load, me.id]);
  const unread = rows.filter((row) => !row.read_at).length;
  const show = async () => {
    setOpen(true);
    if (unread) {
      const now = new Date().toISOString();
      await sb.from("reading_notifications").update({ read_at: now }).eq("recipient_id", me.id).is("read_at", null);
      setRows(rows.map((row) => row.read_at ? row : { ...row, read_at: now }));
    }
  };
  if (!available) return null;
  return <>
    <button className="notification-button" onClick={show} aria-label={`알림 ${unread}개`}><span>알림</span>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}</button>
    {open && <Sheet title="사랑방 소식" onClose={() => setOpen(false)}>
      {!rows.length ? <div className="empty-state small"><span>아직 새 소식이 없습니다</span></div> : <div className="notification-list">{rows.map((row) => <button key={row.id} onClick={() => { setOpen(false); onOpenShared(row.book_id); }}><i>{(row.actor_name || "독").slice(0, 1)}</i><span><b>{row.actor_name}님이 《{row.book_title}》의 주제를 나눴습니다.</b><small>{row.topic_title}</small><time>{relativeDays(row.created_at)}</time></span></button>)}</div>}
    </Sheet>}
  </>;
}

function Home({ me, onOpenBook, onOpenShared, onManageInvites, onGoLibrary }) {
  const [data, setData] = useState({ books: [], quotes: [], thoughts: [], loading: true });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    const [{ data: books, error: bookError }, { data: quotes, error: quoteError }] = await Promise.all([
      sb.from("books").select("*").order("created_at", { ascending: false }),
      sb.from("quotes").select("*").order("created_at", { ascending: true }),
    ]);
    if (bookError || quoteError) { setError((bookError || quoteError).message); setData((old) => ({ ...old, loading: false })); return; }
    let thoughtResult = { rows: [] };
    try { thoughtResult = await loadThoughts((quotes || []).map((quote) => quote.id)); } catch (loadError) { setError(loadError.message); }
    setData({ books: books || [], quotes: quotes || [], thoughts: thoughtResult.rows, loading: false });
  }, []);
  useEffect(() => { load(); }, [load]);

  const bookMap = useMemo(() => Object.fromEntries(data.books.map((book) => [book.id, book])), [data.books]);
  const daily = useMemo(() => {
    if (!data.quotes.length) return null;
    const older = data.quotes.filter((quote) => Date.now() - new Date(quote.created_at).getTime() >= 7 * 86400000);
    const pool = older.length ? older : data.quotes;
    const day = Math.floor(Date.now() / 86400000);
    return pool[day % pool.length];
  }, [data.quotes]);
  const dailyThoughts = daily ? data.thoughts.filter((thought) => thought.quote_id === daily.id) : [];

  return (
    <main className="page home-page">
      <header className="page-header home-head"><Brand /><div className="home-actions">{me.email === ADMIN_EMAIL && <button className="admin-link" onClick={onManageInvites}>초대 관리</button>}<NotificationBell me={me} onOpenShared={onOpenShared} /><button className="profile-link" onClick={() => sb.auth.signOut()} title="로그아웃">{me.name}님의 오늘</button></div></header>
      <ErrorNote>{error}</ErrorNote>
      {data.loading ? <div className="loading">지난 문장을 꺼내는 중…</div> : daily ? (
        <DailyQuote quote={daily} book={bookMap[daily.book_id]} thoughts={dailyThoughts}
          onAppend={() => setEditing({ quote: daily })} onOpen={() => onOpenBook(bookMap[daily.book_id])} />
      ) : (
        <section className="empty-state"><span>첫 문장을 기다리는 서재</span><p>읽다가 마음을 멈춰 세운 문장을 담아보세요.</p><button className="primary" onClick={onGoLibrary}>서재로 가기</button></section>
      )}

      {editing && <ThoughtEditor quote={editing.quote} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </main>
  );
}

function CoverCard({ book, onClick, small = false, meta }) {
  return (
    <button className={`cover-card ${small ? "small" : ""}`} onClick={onClick}>
      <span className="cover-art">
        {book.cover_url ? <img src={book.cover_url} alt={`《${book.title}》 표지`} /> : <span className="cover-fallback" style={{ background: spineColor(book.title) }}>{book.title}</span>}
      </span>
      <strong>{book.title}</strong>
      {meta && <small>{meta}</small>}
    </button>
  );
}

function AddBook({ onClose, onAdded, initialClassification = "" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", publisher: "", classification: initialClassification });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/aladin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setResults(result.items || []);
    } catch (searchError) { setError(searchError.message); }
    setBusy(false);
  };
  const add = async (book) => {
    const inferred = book ? classificationFromCategory(book.categoryName) : form.classification;
    const row = book ? { title: book.title, author: book.author || null, publisher: book.publisher || null, pub_date: book.pubDate || null, isbn13: book.isbn13 || null, cover_url: book.cover || null, link: book.link || null, classification_code: inferred || initialClassification || null, source_category: book.categoryName || null }
      : { title: form.title.trim(), author: form.author.trim() || null, publisher: form.publisher.trim() || null, classification_code: form.classification || null };
    if (!row.title) return;
    const { error: insertError } = await sb.from("books").insert(row);
    if (insertError) setError(classificationSchemaMissing(insertError) ? "서가 분류 업데이트를 먼저 적용해 주세요. 기존 책은 그대로 보존됩니다." : insertError.message); else onAdded();
  };
  return (
    <Sheet title="서재에 책 꽂기" onClose={onClose}>
      {!manual ? <>
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="책 제목이나 저자" autoFocus /><button className="primary" onClick={search}>{busy ? "찾는 중" : "찾기"}</button></div>
        <ErrorNote>{error}</ErrorNote>
        <div className="search-results">{results?.map((book) => { const group = classificationGroup(classificationFromCategory(book.categoryName) || initialClassification); return <button key={book.isbn13 || book.link} onClick={() => add(book)}>{book.cover ? <img src={book.cover} alt="" /> : <i style={{ background: spineColor(book.title) }} />}<span><b>{book.title}</b><small>{book.author}{book.publisher ? ` · ${book.publisher}` : ""}</small>{group && <em>{group.code} {group.name}</em>}</span></button>; })}</div>
        <button className="text-button wide" onClick={() => setManual(true)}>찾는 책이 없나요? 직접 입력하기</button>
      </> : <>
        <label className="field"><span>책 제목</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus /></label>
        <label className="field"><span>저자</span><input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
        <label className="field"><span>출판사</span><input value={form.publisher} onChange={(event) => setForm({ ...form, publisher: event.target.value })} /></label>
        <label className="field"><span>서가 분류</span><select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value })}><option value="">나중에 분류하기</option>{LIBRARY_CLASSES.map((item) => <option key={item.code} value={item.code}>{item.range} {item.name}</option>)}</select></label>
        <ErrorNote>{error}</ErrorNote>
        <button className="primary wide" onClick={() => add(null)}>책장에 꽂기</button>
      </>}
    </Sheet>
  );
}

function Library({ me, onOpenBook }) {
  const [books, setBooks] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [adding, setAdding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [{ data: bookRows, error: bookError }, { data: quoteRows, error: quoteError }] = await Promise.all([
      sb.from("books").select("*").order("created_at", { ascending: false }), sb.from("quotes").select("*"),
    ]);
    if (bookError || quoteError) { setError((bookError || quoteError).message); setLoading(false); return; }
    let extra = { rows: [] };
    try { extra = await loadThoughts((quoteRows || []).map((quote) => quote.id)); } catch (loadError) { setError(loadError.message); }
    setBooks(bookRows || []); setQuotes(quoteRows || []); setThoughts(extra.rows); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const writtenByBook = useMemo(() => {
    const counts = {};
    quotes.forEach((quote) => { counts[quote.book_id] = (counts[quote.book_id] || 0) + (quote.memo || "").length; });
    thoughts.filter((thought) => !thought.user_id || thought.user_id === me.id).forEach((thought) => { counts[thought.book_id] = (counts[thought.book_id] || 0) + thought.content.length; });
    return counts;
  }, [quotes, thoughts, me.id]);

  const groupedBooks = useMemo(() => {
    const groups = Object.fromEntries(LIBRARY_CLASSES.map((item) => [item.code, []]));
    const pending = [];
    books.forEach((book) => {
      const group = classificationGroup(book.classification_code);
      if (group) groups[group.code].push(book); else pending.push(book);
    });
    return { groups, pending };
  }, [books]);
  const maxCategoryCount = Math.max(1, ...LIBRARY_CLASSES.map((item) => groupedBooks.groups[item.code].length));
  const openAddBook = (code = "") => setAdding({ code });

  const renderSpine = (book) => {
    const chars = writtenByBook[book.id] || 0;
    const width = Math.min(66, 29 + Math.sqrt(chars) * 1.05);
    return <button className="book-spine" key={book.id} style={{ width, background: spineColor(book.title) }} onClick={() => onOpenBook(book)} title={`${book.title} · 내가 쓴 글 ${chars.toLocaleString()}자`}>
      <span>{book.title}</span><small>{book.author}</small>
    </button>;
  };

  return (
    <main className="page library-page">
      <header className="page-header"><div><div className="eyebrow">000부터 999까지, 생각이 자라는 서가</div><h1>서재</h1></div><button className="round-button" onClick={() => openAddBook()} aria-label="책 추가">＋</button></header>
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div className="loading">책장을 여는 중…</div> : books.length ? (
        <>
          <section className="reading-map"><div className="reading-map-copy"><span>나의 독서 지도</span><b>{books.length}권이 만든 관심의 모양</b><small>분류별로 얼마나 읽었는지 한눈에 살펴보세요.</small></div><div className="reading-map-bars">{LIBRARY_CLASSES.map((item) => { const count = groupedBooks.groups[item.code].length; return <button key={item.code} onClick={() => document.getElementById(`shelf-${item.code}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} title={`${item.name} ${count}권`}><span>{item.code}</span><i><u style={{ height: `${Math.max(count ? 18 : 4, (count / maxCategoryCount) * 100)}%` }} /></i><b>{count}</b></button>; })}</div></section>
          <div className="library-cabinet">{LIBRARY_CLASSES.map((item, index) => { const shelfBooks = groupedBooks.groups[item.code]; const emptySlots = Math.max(3, 6 - Math.min(shelfBooks.length, 3)); return <section className={`classification-shelf tone-${index % 5}`} id={`shelf-${item.code}`} key={item.code}><header className="shelf-label"><span>{item.range}</span><div><b>{item.name}</b><small>{item.note}</small></div><em>{shelfBooks.length}권</em></header><div className="classified-books">{shelfBooks.map(renderSpine)}{Array.from({ length: emptySlots }, (_, slot) => <span className="empty-book-slot" key={slot} />)}<button className="shelf-add" onClick={() => openAddBook(item.code)} aria-label={`${item.name} 서가에 책 추가`}>＋</button></div><div className="shelf-board" /></section>; })}</div>
          {!!groupedBooks.pending.length && <section className="pending-shelf"><div><span>분류 대기</span><b>기존 책 {groupedBooks.pending.length}권</b><small>책을 열어 분야를 정하면 알맞은 서가로 옮겨집니다.</small></div><div className="pending-books">{groupedBooks.pending.map(renderSpine)}</div></section>}
          <p className="shelf-caption">내가 쓴 생각이 쌓일수록 책등은 두꺼워지고, 많이 읽은 분야의 서가는 풍성해집니다.</p>
        </>
      ) : <section className="empty-library"><div className="empty-library-light"><span>열 개의 서가가 첫 책을 기다립니다</span><p>000 총류부터 900 역사까지, 읽고 싶은 분야의 빈 칸을 하나씩 채워보세요.</p><button className="primary" onClick={() => openAddBook()}>첫 책 꽂기</button></div>{LIBRARY_CLASSES.map((item) => <div className="empty-class-row" key={item.code}><b>{item.code}</b><span>{item.name}</span><i /></div>)}</section>}
      {adding && <AddBook initialClassification={adding.code} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); load(); }} />}
    </main>
  );
}

function QuoteEditor({ book, quote, onClose, onSaved }) {
  const [form, setForm] = useState({ page: quote?.page || "", content: quote?.content || "", memo: quote?.memo || "" });
  const [error, setError] = useState("");
  const save = async () => {
    if (!form.content.trim()) return;
    const body = { page: form.page.trim() || null, content: form.content.trim(), memo: form.memo.trim() || null };
    const result = quote ? await sb.from("quotes").update(body).eq("id", quote.id) : await sb.from("quotes").insert({ ...body, book_id: book.id, input_type: "typed" });
    if (result.error) setError(result.error.message); else onSaved();
  };
  return (
    <Sheet title={quote ? "문장 수정하기" : "기억할 문장 담기"} onClose={onClose}>
      <label className="field"><span>쪽수 또는 위치</span><input value={form.page} onChange={(event) => setForm({ ...form, page: event.target.value })} /></label>
      <label className="field"><span>책 속 문장</span><textarea rows="5" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} autoFocus /></label>
      <label className="field"><span>그때의 생각</span><textarea rows="4" value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} placeholder="이 문장이 마음에 남은 이유" /></label>
      <ErrorNote>{error}</ErrorNote><button className="primary wide" onClick={save}>기록하기</button>
    </Sheet>
  );
}

function QuoteCard({ quote, thoughts, onReload }) {
  const [editingQuote, setEditingQuote] = useState(false);
  const [editingThought, setEditingThought] = useState(null);
  return (
    <article className="quote-card">
      <div className="quote-card-head"><span>{quote.page ? `${quote.page}쪽` : "기록한 문장"}</span><button onClick={() => setEditingQuote(true)}>문장 수정</button></div>
      <blockquote>{quote.content}</blockquote>
      <ThoughtTimeline quote={quote} thoughts={thoughts} onEdit={(thought) => setEditingThought(thought)} onAppend={() => setEditingThought({})} />
      {editingQuote && <QuoteEditor book={{ id: quote.book_id }} quote={quote} onClose={() => setEditingQuote(false)} onSaved={() => { setEditingQuote(false); onReload(); }} />}
      {editingThought && <ThoughtEditor quote={quote} thought={editingThought.id || editingThought.kind ? editingThought : null} onClose={() => setEditingThought(null)} onSaved={() => { setEditingThought(null); onReload(); }} />}
    </article>
  );
}

function Talk({ book, quotes, me, onOrganized }) {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const title = "개인 대화";

  useEffect(() => {
    let channel;
    (async () => {
      const query = sb.from("sessions").select("*").eq("book_id", book.id).eq("status", "open").in("title", ["대화", "개인 대화"]).order("created_at", { ascending: false }).limit(1);
      const { data } = await query;
      let found = data?.[0];
      if (!found) {
        const { data: made, error: makeError } = await sb.from("sessions").insert({ book_id: book.id, title }).select().single();
        if (makeError) { setError(makeError.message); return; }
        found = made;
      }
      setSession(found);
      const { data: rows } = await sb.from("messages").select("*").eq("session_id", found.id).order("created_at");
      setMessages(rows || []);
      channel = sb.channel(`talk-${found.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${found.id}` }, (payload) => setMessages((old) => old.some((item) => item.id === payload.new.id) ? old : [...old, payload.new])).subscribe();
    })();
    return () => { if (channel) sb.removeChannel(channel); };
  }, [book.id]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const requestAnswer = async (history) => {
    try {
      const { text: answer } = await callAI("chat", { book: { title: book.title, author: book.author }, quotes: quotes.map(({ page, content: quoteText, memo }) => ({ page, content: quoteText, memo })), history: history.map((message) => ({ role: message.role === "ai" ? "ai" : "human", content: message.content })) });
      const { data: savedAnswer, error: answerSaveError } = await sb.from("messages").insert({ session_id: session.id, role: "ai", author_name: "AI", content: answer }).select().single();
      if (answerSaveError) throw answerSaveError;
      setMessages((current) => current.some((message) => message.id === savedAnswer.id) ? current : [...current, savedAnswer]);
    } catch (sendError) { setError(sendError.message); }
    setBusy(false);
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !session || busy) return;
    setText(""); setBusy(true); setError("");
    const human = { session_id: session.id, role: "human", author_name: me.name, content };
    const { data: saved, error: saveError } = await sb.from("messages").insert(human).select().single();
    if (saveError) { setError(saveError.message); setBusy(false); return; }
    const next = [...messages, saved];
    setMessages(next);
    await requestAnswer(next);
  };

  const retry = async () => {
    if (busy || messages.at(-1)?.role !== "human") return;
    setBusy(true); setError("");
    await requestAnswer(messages);
  };

  const organize = async () => {
    if (organizing || messages.length < 2) return;
    if (!window.confirm("여기까지 나눈 대화를 나의 독후감으로 정리합니다. 정리 결과는 내 서재에만 저장되며 사랑방에는 공유되지 않습니다.")) return;
    setOrganizing(true); setError("");
    try {
      const quoteMap = {};
      quotes.forEach((quote, index) => { quoteMap[`q${index + 1}`] = quote.id; });
      const { topics } = await callAI("organize", {
        book: { title: book.title, author: book.author },
        quotes: quotes.map((quote, index) => ({ id: `q${index + 1}`, page: quote.page, content: quote.content })),
        messages: messages.map((message) => ({ who: message.author_name || (message.role === "ai" ? "AI" : me.name), content: message.content })),
      });
      const { data: base, error: orderError } = await sb.from("topics").select("order_no").eq("book_id", book.id).order("order_no", { ascending: false }).limit(1);
      if (orderError) throw orderError;
      const start = base?.[0] ? (base[0].order_no || 0) + 1 : 0;
      for (let index = 0; index < topics.length; index += 1) {
        const topic = topics[index];
        const rawTitle = String(topic.title || "").trim();
        if (!rawTitle) continue;
        const questionTitle = /[?？]$/.test(rawTitle) ? rawTitle : `${rawTitle}?`;
        const { data: savedTopic, error: topicError } = await sb.from("topics").insert({
          book_id: book.id,
          session_id: session.id,
          title: questionTitle,
          summary: topic.summary || null,
          keyword: topic.keyword || "대화에서 나온 질문",
          unresolved: topic.unresolved || null,
          apply_note: topic.apply_note || null,
          order_no: start + index,
        }).select().single();
        if (topicError) throw topicError;
        const links = (topic.quote_ids || []).map((key) => quoteMap[key]).filter(Boolean).map((quoteId) => ({ topic_id: savedTopic.id, quote_id: quoteId }));
        if (links.length) {
          const { error: linkError } = await sb.from("topic_quotes").insert(links);
          if (linkError) throw linkError;
        }
        const opinions = (topic.opinions || []).filter((opinion) => opinion.content?.trim()).map((opinion) => ({
          topic_id: savedTopic.id,
          author_name: opinion.author_name || me.name,
          content: opinion.content.trim(),
        }));
        if (opinions.length) {
          const { error: opinionError } = await sb.from("topic_opinions").insert(opinions);
          if (opinionError) throw opinionError;
        }
      }
      onOrganized?.(topics.length);
    } catch (organizeError) {
      setError(organizeError.message || "대화를 정리하지 못했습니다.");
    }
    setOrganizing(false);
  };

  return (
    <section className="talk-panel">
      <div className="talk-intro"><b>나만의 생각 탐색</b><p>AI의 해석은 정답이 아니라 다른 관점입니다. 이 대화는 내 서재에만 머물며, 사랑방에는 내가 고른 정리 주제만 별도로 나눌 수 있습니다.</p></div>
      <div className="messages">{messages.map((message) => <article className={`message ${message.role === "ai" ? "ai" : "human"}`} key={message.id}><small>{message.author_name || (message.role === "ai" ? "AI" : "독자")}</small><p>{message.content}</p></article>)}<div ref={endRef} /></div>
      <ErrorNote>{error}</ErrorNote>
      {messages.length >= 2 && <section className="organize-callout"><div><b>나의 독후감으로 정리하기</b><p>흩어진 생각을 주제별 질문·근거 문장·생각의 흐름으로 엮어 내 서재에만 보관합니다. 사랑방 공유는 나중에 원하는 주제와 사람을 직접 고를 때만 이루어집니다.</p></div><button className="primary" onClick={organize} disabled={organizing || busy}>{organizing ? "독후감을 엮는 중…" : "여기까지 정리하기"}</button></section>}
      {messages.at(-1)?.role === "human" && !busy && <div className="ai-retry"><small>아직 AI 답변이 도착하지 않았습니다.</small><button className="secondary" onClick={retry}>AI 답변 다시 받기</button></div>}
      <div className="composer"><textarea rows="2" value={text} onChange={(event) => setText(event.target.value)} placeholder="무엇이 궁금한가요?" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="primary" onClick={send} disabled={busy}>{busy ? "생각 중" : "보내기"}</button></div>
    </section>
  );
}

function QuestionBoard({ bookId, me, canAsk = false }) {
  const [topics, setTopics] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [links, setLinks] = useState([]);
  const [opinions, setOpinions] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState({ title: "", rationale: "", quoteId: "" });
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data: topicRows, error: topicError } = await sb.from("topics").select("*").eq("book_id", bookId).order("order_no");
    if (topicError) { setError(topicError.message); return; }
    const ids = (topicRows || []).map((topic) => topic.id);
    const [{ data: quoteRows }, linkResult, opinionResult] = await Promise.all([
      sb.from("quotes").select("*").eq("book_id", bookId),
      ids.length ? sb.from("topic_quotes").select("*").in("topic_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("topic_opinions").select("*").in("topic_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    ]);
    setTopics(topicRows || []); setQuotes(quoteRows || []); setLinks(linkResult.data || []); setOpinions(opinionResult.data || []);
  }, [bookId]);
  useEffect(() => {
    load();
    const channel = sb.channel(`questions-${bookId}`).on("postgres_changes", { event: "*", schema: "public", table: "topics", filter: `book_id=eq.${bookId}` }, load).on("postgres_changes", { event: "*", schema: "public", table: "topic_opinions" }, load).subscribe();
    return () => { sb.removeChannel(channel); };
  }, [bookId, load]);

  const submitQuestion = async () => {
    if (!question.title.trim()) return;
    const nextOrder = topics.length ? Math.max(...topics.map((topic) => topic.order_no || 0)) + 1 : 0;
    const { data: sessionRows } = await sb.from("sessions").select("id").eq("book_id", bookId).eq("title", "나의 독후감 질문").limit(1);
    let questionSessionId = sessionRows?.[0]?.id;
    if (!questionSessionId) {
      const { data: made, error: sessionError } = await sb.from("sessions").insert({ book_id: bookId, title: "나의 독후감 질문", status: "open" }).select("id").single();
      if (sessionError) { setError(sessionError.message); return; }
      questionSessionId = made.id;
    }
    const { data, error: insertError } = await sb.from("topics").insert({ book_id: bookId, session_id: questionSessionId, keyword: "직접 적은 질문", title: question.title.trim(), summary: question.rationale.trim() || null, order_no: nextOrder }).select().single();
    if (insertError) { setError(insertError.message); return; }
    if (question.quoteId) await sb.from("topic_quotes").insert({ topic_id: data.id, quote_id: question.quoteId });
    setQuestion({ title: "", rationale: "", quoteId: "" }); setAsking(false); load();
  };
  const answer = async (topicId) => {
    const content = (drafts[topicId] || "").trim();
    if (!content) return;
    const { error: answerError } = await sb.from("topic_opinions").insert({ topic_id: topicId, author_name: me.name, content });
    if (answerError) setError(answerError.message); else { setDrafts({ ...drafts, [topicId]: "" }); load(); }
  };
  const quoteMap = Object.fromEntries(quotes.map((quote) => [quote.id, quote]));

  return (
    <section className="question-board">
      <div className="section-title"><div><div className="eyebrow">대화가 남긴 생각</div><h2>나의 독후감</h2></div>{canAsk && <button className="secondary" onClick={() => setAsking(true)}>질문 직접 쓰기</button>}</div>
      <ErrorNote>{error}</ErrorNote>
      {!topics.length && <div className="empty-state small"><span>아직 모인 질문이 없습니다</span><p>마음에 걸린 장면과 그 이유를 질문으로 건네보세요.</p></div>}
      {topics.map((topic, index) => {
        const evidence = links.filter((link) => link.topic_id === topic.id).map((link) => quoteMap[link.quote_id]).filter(Boolean);
        const answers = opinions.filter((opinion) => opinion.topic_id === topic.id);
        return <article className="question-card" key={topic.id}>
          <div className="question-number">{topic.keyword === "직접 적은 질문" ? "직접 적은 질문" : topic.keyword ? `대화에서 엮은 주제 · ${topic.keyword}` : `물음 ${String(index + 1).padStart(2, "0")}`}</div><h3>{topic.title}</h3>
          {topic.summary && <p className="rationale">{topic.summary}</p>}
          {evidence.map((quote) => <blockquote key={quote.id}>“{quote.content}”<small>{quote.page ? `${quote.page}쪽` : "책 속 문장"}</small></blockquote>)}
          {topic.unresolved && <div className="topic-note unresolved"><b>아직 남은 물음</b><p>{topic.unresolved}</p></div>}
          {topic.apply_note && <div className="topic-note apply"><b>삶에 이어볼 점</b><p>{topic.apply_note}</p></div>}
          <div className="answers"><h4>각자의 생각 <span>{answers.length}</span></h4>{answers.map((item) => <div className={`answer ${item.user_id === me.id ? "mine" : ""}`} key={item.id}><b>{item.author_name}</b><p>{item.content}</p></div>)}</div>
          <div className="answer-box"><textarea rows="3" value={drafts[topic.id] || ""} onChange={(event) => setDrafts({ ...drafts, [topic.id]: event.target.value })} placeholder="내 생각과 책 속 근거를 함께 남겨보세요." /><button className="primary" onClick={() => answer(topic.id)}>답 남기기</button></div>
        </article>;
      })}
      {asking && <Sheet title="내 독후감에 질문 더하기" onClose={() => setAsking(false)}>
        <p className="sheet-copy">이 질문은 내 서재에만 저장됩니다. 사랑방에는 별도로 공유할 때만 보입니다.</p>
        <label className="field"><span>오래 붙들어 두고 싶은 질문</span><textarea rows="4" value={question.title} onChange={(event) => setQuestion({ ...question, title: event.target.value })} autoFocus /></label>
        <label className="field"><span>이 질문이 생긴 이유</span><textarea rows="4" value={question.rationale} onChange={(event) => setQuestion({ ...question, rationale: event.target.value })} /></label>
        <label className="field"><span>근거가 된 문장</span><select value={question.quoteId} onChange={(event) => setQuestion({ ...question, quoteId: event.target.value })}><option value="">선택하지 않음</option>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.page ? `${quote.page}쪽 · ` : ""}{quote.content.slice(0, 45)}</option>)}</select></label>
        <button className="primary wide" onClick={submitQuestion}>내 독후감에 남기기</button>
      </Sheet>}
    </section>
  );
}

function selectiveSharingError(error) {
  return error?.code === "PGRST202" || isMissingRelation(error) || /share_candidates|share_topics|shared_topics|schema cache/i.test(error?.message || "");
}

function ShareTopicsSheet({ book, onClose, onShared }) {
  const [topics, setTopics] = useState([]);
  const [people, setPeople] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { (async () => {
    const [{ data: topicRows, error: topicError }, peopleResult] = await Promise.all([
      sb.from("topics").select("id,title,keyword,summary").eq("book_id", book.id).order("order_no"),
      sb.rpc("share_candidates"),
    ]);
    if (topicError) setError(topicError.message);
    else setTopics(topicRows || []);
    if (peopleResult.error) setError(selectiveSharingError(peopleResult.error) ? "선택 공유용 데이터베이스 업데이트가 아직 적용되지 않았습니다." : peopleResult.error.message);
    else setPeople(peopleResult.data || []);
    setLoading(false);
  })(); }, [book.id]);

  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const share = async () => {
    if (!selectedTopics.length || !selectedPeople.length || busy) return;
    setBusy(true); setError("");
    const { data, error: shareError } = await sb.rpc("share_topics", {
      p_topic_ids: selectedTopics,
      p_recipient_ids: selectedPeople,
      p_message: message.trim() || null,
    });
    setBusy(false);
    if (shareError) {
      setError(selectiveSharingError(shareError) ? "선택 공유용 데이터베이스 업데이트가 아직 적용되지 않았습니다." : shareError.message);
      return;
    }
    onShared?.(data || 0);
    onClose();
  };

  return (
    <Sheet title="사랑방에 주제 나누기" onClose={onClose}>
      <p className="privacy-note"><b>내가 고른 내용만 공개됩니다.</b><span>AI 대화 원문, 선택하지 않은 주제, 다른 문장과 생각은 내 서재에 그대로 남습니다. 공유 뒤 서재에서 고친 내용도 다시 공유하지 않는 한 사랑방에 자동 반영되지 않습니다.</span></p>
      {loading ? <div className="loading">사랑방 식구를 불러오는 중…</div> : <>
        <fieldset className="share-picker"><legend>1. 나눌 주제</legend>
          {!topics.length && <p className="muted">먼저 AI 대화를 정리하거나 질문을 직접 남겨주세요.</p>}
          {topics.map((topic) => <label className="check-card" key={topic.id}><input type="checkbox" checked={selectedTopics.includes(topic.id)} onChange={() => toggle(selectedTopics, setSelectedTopics, topic.id)} /><span><small>{topic.keyword || "독후감 주제"}</small><b>{topic.title}</b></span></label>)}
        </fieldset>
        <fieldset className="share-picker"><legend>2. 보여줄 사람</legend>
          {!!people.length && <button type="button" className="text-button picker-all" onClick={() => setSelectedPeople(selectedPeople.length === people.length ? [] : people.map((person) => person.id))}>{selectedPeople.length === people.length ? "모두 선택 해제" : "사랑방 식구 모두 선택"}</button>}
          {!people.length && <p className="muted">아직 함께할 사람이 없습니다. 초대받아 Google로 로그인한 사람이 여기에 표시됩니다.</p>}
          <div className="people-picker">{people.map((person) => <label className="person-chip" key={person.id}><input type="checkbox" checked={selectedPeople.includes(person.id)} onChange={() => toggle(selectedPeople, setSelectedPeople, person.id)} /><i>{(person.display_name || "독").slice(0, 1)}</i><span>{person.display_name || "독자"}</span></label>)}</div>
        </fieldset>
        <label className="field"><span>함께 읽는 사람들에게 · 선택</span><textarea rows="3" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="왜 이 주제를 함께 이야기하고 싶은지 적어보세요." /></label>
      </>}
      <ErrorNote>{error}</ErrorNote>
      <button className="primary wide" disabled={busy || !selectedTopics.length || !selectedPeople.length} onClick={share}>{busy ? "사랑방에 놓는 중…" : `${selectedTopics.length || 0}개 주제를 ${selectedPeople.length || 0}명에게 공유`}</button>
    </Sheet>
  );
}

function SharedQuestionBoard({ bookId, me }) {
  const [topics, setTopics] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: loadError } = await sb.rpc("shared_topics", { p_book_id: bookId });
    if (loadError) setError(selectiveSharingError(loadError) ? "이 사랑방은 선택 공유 업데이트가 필요합니다." : loadError.message);
    else { setTopics(data || []); setError(""); }
    setLoading(false);
  }, [bookId]);
  useEffect(() => { load(); }, [load]);

  const answer = async (topicId) => {
    const content = (drafts[topicId] || "").trim();
    if (!content) return;
    const { error: answerError } = await sb.rpc("add_shared_opinion", { p_topic_id: topicId, p_content: content });
    if (answerError) setError(answerError.message);
    else { setDrafts({ ...drafts, [topicId]: "" }); load(); }
  };

  if (loading) return <div className="loading">공유된 질문을 펼치는 중…</div>;
  return <section className="question-board shared-questions">
    <div className="section-title"><div><div className="eyebrow">선택해 건넨 생각</div><h2>함께 읽을 질문</h2></div></div>
    <ErrorNote>{error}</ErrorNote>
    {!topics.length && !error && <div className="empty-state small"><span>공유된 질문이 없습니다</span></div>}
    {topics.map((topic, index) => <article className="question-card" key={topic.id}>
      <div className="question-number">나눈 주제 {String(index + 1).padStart(2, "0")}{topic.keyword ? ` · ${topic.keyword}` : ""}</div>
      <h3>{topic.title}</h3>
      {topic.summary && <p className="rationale">{topic.summary}</p>}
      {(topic.evidence || []).map((quote) => <blockquote key={quote.id}>“{quote.content}”<small>{quote.page ? `${quote.page}쪽` : "책 속 문장"}</small></blockquote>)}
      {topic.unresolved && <div className="topic-note unresolved"><b>아직 남은 물음</b><p>{topic.unresolved}</p></div>}
      {topic.apply_note && <div className="topic-note apply"><b>삶에 이어볼 점</b><p>{topic.apply_note}</p></div>}
      <div className="answers"><h4>각자의 생각 <span>{(topic.opinions || []).length}</span></h4>{(topic.opinions || []).map((item) => <div className={`answer ${item.user_id === me.id ? "mine" : ""}`} key={item.id}><b>{item.author_name}</b><p>{item.content}</p></div>)}</div>
      <div className="answer-box"><textarea rows="3" value={drafts[topic.id] || ""} onChange={(event) => setDrafts({ ...drafts, [topic.id]: event.target.value })} placeholder="이 질문에 대한 나의 생각을 남겨보세요." /><button className="primary" onClick={() => answer(topic.id)}>답 남기기</button></div>
    </article>)}
  </section>;
}

function BookView({ book, me, onBack }) {
  const [quotes, setQuotes] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [tab, setTab] = useState("records");
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedMessage, setSharedMessage] = useState("");
  const [classification, setClassification] = useState(classificationGroup(book.classification_code)?.code || "");
  const [savingClassification, setSavingClassification] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: quoteError } = await sb.from("quotes").select("*").eq("book_id", book.id).order("created_at");
    if (quoteError) { setError(quoteError.message); return; }
    let result = { rows: [] };
    try { result = await loadThoughts((data || []).map((quote) => quote.id)); } catch (loadError) { setError(loadError.message); }
    setQuotes(data || []); setThoughts(result.rows);
  }, [book.id]);
  useEffect(() => { load(); }, [load]);

  const saveClassification = async () => {
    setSavingClassification(true); setError("");
    const { error: classificationError } = await sb.from("books").update({ classification_code: classification || null }).eq("id", book.id);
    setSavingClassification(false);
    if (classificationError) setError(classificationSchemaMissing(classificationError) ? "서가 분류 업데이트를 먼저 적용해 주세요." : classificationError.message);
    else setSharedMessage(`${classificationGroup(classification)?.name || "분류 대기"} 서가에 저장했습니다.`);
  };

  return (
    <main className="page book-page">
      <button className="back-button" onClick={onBack}>← 서재로</button>
      <header className="book-hero">
        <span className="book-cover-mini">{book.cover_url ? <img src={book.cover_url} alt="" /> : <i style={{ background: spineColor(book.title) }}>{book.title}</i>}</span>
        <div><div className="eyebrow">나의 독서책 · 비공개</div><h1>{book.title}</h1><p>{book.author}</p><div className="book-classification"><select aria-label="서가 분류" value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">분류 대기</option>{LIBRARY_CLASSES.map((item) => <option value={item.code} key={item.code}>{item.code} {item.name}</option>)}</select><button className="secondary" disabled={savingClassification} onClick={saveClassification}>{savingClassification ? "옮기는 중…" : "서가 저장"}</button></div><button className="text-button share-topic-button" onClick={() => setSharing(true)}>원하는 주제만 사랑방에 나누기</button></div>
      </header>
      <nav className="tabs"><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>문장과 생각</button><button className={tab === "talk" ? "active" : ""} onClick={() => setTab("talk")}>AI와 생각 나누기</button><button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>나의 독후감</button></nav>
      <ErrorNote>{error}</ErrorNote>
      {sharedMessage && <div className="notice success">{sharedMessage}</div>}
      {tab === "records" && <><div className="section-title"><h2>기억한 문장</h2><button className="secondary" onClick={() => setAdding(true)}>문장 담기</button></div>{quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} thoughts={thoughts.filter((thought) => thought.quote_id === quote.id)} onReload={load} />)}{!quotes.length && <div className="empty-state small"><span>첫 문장을 기다리고 있어요</span></div>}</>}
      {tab === "talk" && <Talk book={book} quotes={quotes} me={me} onOrganized={() => setTab("questions")} />}
      {tab === "questions" && <QuestionBoard bookId={book.id} me={me} canAsk />}
      {adding && <QuoteEditor book={book} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {sharing && <ShareTopicsSheet book={book} onClose={() => setSharing(false)} onShared={(count) => setSharedMessage(`${count}명에게 선택한 주제를 건넸습니다. 사랑방에는 이 책의 표지와 선택한 내용만 보입니다.`)} />}
    </main>
  );
}

const INVITE_STATUS = { pending: "수락 대기", accepted: "입장 완료", revoked: "초대 취소", expired: "기간 만료" };

function invitationLink(token) {
  return `${window.location.origin}/#/invite/${token}`;
}

function gmailComposeUrl(invitation) {
  const link = invitationLink(invitation.token);
  const subject = "책은성장 사랑방에 초대합니다";
  const body = `안녕하세요.\n\n책을 읽고 남긴 문장과 생각을 함께 나누는 ‘책은성장’ 사랑방에 초대합니다.\n\n아래 초대장을 열고, 이 메일을 받은 Google 계정으로 로그인해 주세요.\n${link}\n\n초대장은 30일 동안 유효합니다.`;
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(ADMIN_EMAIL)}&view=cm&fs=1&to=${encodeURIComponent(invitation.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function InviteAdmin({ me, onBack }) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [members, setMembers] = useState([]);
  const [lastInvitation, setLastInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [inviteResult, memberResult] = await Promise.all([
      sb.rpc("list_reading_invitations"),
      sb.rpc("list_reading_circle_members"),
    ]);
    const loadError = inviteResult.error || memberResult.error;
    if (loadError) setError(selectiveSharingError(loadError) ? "초대 관리용 데이터베이스 업데이트가 아직 적용되지 않았습니다." : loadError.message);
    else { setInvitations(inviteResult.data || []); setMembers(memberResult.data || []); setError(""); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openGmail = (invitation) => window.open(gmailComposeUrl(invitation), "_blank", "noopener,noreferrer");
  const copyLink = async (invitation) => {
    await navigator.clipboard.writeText(invitationLink(invitation.token));
    setLastInvitation(invitation);
  };
  const create = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || busy) return;
    const composeWindow = window.open("about:blank", "_blank");
    setBusy(true); setError("");
    const { data, error: createError } = await sb.rpc("create_reading_invitation", { p_email: normalized });
    setBusy(false);
    const invitation = data?.[0];
    if (createError || !invitation) {
      composeWindow?.close();
      setError(selectiveSharingError(createError) ? "초대 관리용 데이터베이스 업데이트가 아직 적용되지 않았습니다." : createError?.message || "초대장을 만들지 못했습니다.");
      return;
    }
    setEmail(""); setLastInvitation(invitation);
    if (composeWindow) { composeWindow.opener = null; composeWindow.location.replace(gmailComposeUrl(invitation)); }
    await load();
  };
  const revoke = async (invitation) => {
    const message = invitation.status === "accepted" ? `${invitation.display_name || invitation.email}님을 사랑방에서 내보낼까요?` : `${invitation.email} 초대를 취소할까요?`;
    if (!window.confirm(message)) return;
    const { error: revokeError } = await sb.rpc("revoke_reading_invitation", { p_id: invitation.id });
    if (revokeError) setError(revokeError.message); else load();
  };
  const removeMember = async (member) => {
    if (!window.confirm(`${member.display_name || member.email || "이 구성원"}님을 사랑방에서 내보낼까요? 다시 초대하기 전에는 들어올 수 없습니다.`)) return;
    const { error: removeError } = await sb.rpc("remove_reading_circle_member", { p_user_id: member.user_id });
    if (removeError) setError(removeError.message); else load();
  };

  if (me.email !== ADMIN_EMAIL) return <main className="page"><button className="back-button" onClick={onBack}>← 돌아가기</button><ErrorNote>관리자만 초대 관리를 열 수 있습니다.</ErrorNote></main>;

  return <main className="page invite-admin-page">
    <button className="back-button" onClick={onBack}>← 오늘로</button>
    <header className="page-header"><div><div className="eyebrow">관리자 전용</div><h1>사랑방 초대 관리</h1></div><span className="room-seal">招</span></header>
    <p className="room-lead">초대할 이메일을 등록하고 Gmail에서 메일을 보냅니다. 받은 사람은 같은 Google 계정으로만 입장할 수 있습니다.</p>
    <section className="invite-create-card">
      <label className="field"><span>초대할 Google 이메일</span><div className="invite-email-row"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder="reader@gmail.com" /><button className="primary" disabled={busy || !email.trim()} onClick={create}>{busy ? "초대장 만드는 중…" : "Gmail로 초대하기"}</button></div></label>
      <small>초대 기록을 만든 뒤 Gmail 작성창이 열립니다. 내용을 확인하고 보내기를 눌러주세요.</small>
    </section>
    {lastInvitation && <div className="notice success invite-ready"><span><b>{lastInvitation.email}</b> 초대 링크가 준비됐습니다.</span><button className="secondary" onClick={() => copyLink(lastInvitation)}>링크 복사</button></div>}
    <ErrorNote>{error}</ErrorNote>
    {loading ? <div className="loading">초대 명단을 불러오는 중…</div> : <>
      <section className="admin-section"><div className="section-title"><h2>초대 현황</h2><span>{invitations.length}건</span></div>
        {!invitations.length ? <div className="empty-state small"><span>아직 보낸 초대가 없습니다</span></div> : <div className="invite-list">{invitations.map((invitation) => <article key={invitation.id}><div><span className={`status-badge ${invitation.status}`}>{INVITE_STATUS[invitation.status] || invitation.status}</span><b>{invitation.display_name || invitation.email}</b>{invitation.display_name && <small>{invitation.email}</small>}<time>{formatDate(invitation.created_at)} 초대 · {formatDate(invitation.expires_at)}까지</time></div><div className="invite-actions">{invitation.status === "pending" && <><button className="secondary" onClick={() => openGmail(invitation)}>메일 다시 열기</button><button className="secondary" onClick={() => copyLink(invitation)}>링크 복사</button></>} {(invitation.status === "pending" || invitation.status === "accepted") && <button className="text-button danger" onClick={() => revoke(invitation)}>{invitation.status === "accepted" ? "입장 취소" : "초대 취소"}</button>}{(invitation.status === "revoked" || invitation.status === "expired") && <button className="secondary" onClick={() => setEmail(invitation.email)}>다시 초대</button>}</div></article>)}</div>}
      </section>
      <section className="admin-section"><div className="section-title"><h2>현재 사랑방 식구</h2><span>{members.length}명</span></div>
        {!members.length ? <div className="empty-state small"><span>아직 입장한 사람이 없습니다</span></div> : <div className="member-list">{members.map((member) => <article key={member.user_id}><i>{(member.display_name || member.email || "독").slice(0, 1)}</i><div><b>{member.display_name || "이름 미등록"}</b><small>{member.email || "다음 로그인 때 이메일이 확인됩니다."}</small><time>{formatDate(member.joined_at)} 입장</time></div><button className="text-button danger" onClick={() => removeMember(member)}>내보내기</button></article>)}</div>}
      </section>
    </>}
  </main>;
}

function Sarangbang({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: roomError } = await sb.rpc("my_sarangbang");
    if (roomError) setError(selectiveSharingError(roomError) ? "사랑방 선택 공유 업데이트가 아직 적용되지 않았습니다." : roomError.message); else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <main className="page rooms-page">
      <header className="page-header"><div><div className="eyebrow">함께 읽고 다르게 생각하는 곳</div><h1>사랑방</h1></div><span className="room-seal">舍</span></header>
      <p className="room-lead">나에게 건네진 책과 질문만 머무는 초대형 공간입니다.</p>
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div className="loading">사랑방 문을 여는 중…</div> : rows.length ? <div className="display-shelf">{rows.map((row) => <CoverCard key={row.id} book={row} onClick={() => onOpen(row.id)} meta={`${row.is_mine ? "내가 나눔" : `${row.owner_name}님`} · 공유된 질문 ${row.topic_count || 0}`} />)}</div> : <div className="empty-state"><span>아직 건네진 책이 없습니다</span><p>서재에서 주제와 사람을 골라 나누면 이곳에 책 표지가 놓입니다.</p></div>}
    </main>
  );
}

function SharedBook({ bookId, me, onBack }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { (async () => {
    const { data, error: infoError } = await sb.rpc("open_selective_shared_book", { p_book_id: bookId });
    if (infoError) { setError(selectiveSharingError(infoError) ? "이 책은 현재 나에게 공유되어 있지 않거나 선택 공유 업데이트가 필요합니다." : infoError.message); return; }
    if (!data?.[0]) setError("이 책의 주제를 공유받은 사람만 들어올 수 있습니다.");
    else setBook(data[0]);
  })(); }, [bookId]);
  if (error) return <main className="page"><button className="back-button" onClick={onBack}>← 사랑방으로</button><ErrorNote>{error}</ErrorNote></main>;
  if (!book) return <main className="page"><div className="loading">책을 펼치는 중…</div></main>;
  return (
    <main className="page shared-book-page">
      <button className="back-button" onClick={onBack}>← 사랑방으로</button>
      <header className="shared-hero"><span>{book.cover_url ? <img src={book.cover_url} alt="" /> : <i style={{ background: spineColor(book.title) }}>{book.title}</i>}</span><div><div className="eyebrow">{book.is_mine ? "내가 사랑방에 나눈 책" : `${book.owner_name}님이 나에게 건넨 책`}</div><h1>{book.title}</h1><p>{book.author}</p>{book.share_note && <blockquote>{book.share_note}</blockquote>}</div></header>
      <SharedQuestionBoard bookId={bookId} me={me} />
    </main>
  );
}

function DemoApp() {
  const quote = { id: "demo", book_id: "book", content: "사람은 자신이 사랑하는 것에 의해 만들어진다.", page: "127", memo: "무엇을 좋아하는지가 결국 나를 설명해준다는 뜻으로 읽었다.", created_at: "2026-03-12T00:00:00Z" };
  const thoughts = [{ id: "t1", quote_id: "demo", content: "지금은 좋아하는 대상뿐 아니라 그것을 사랑하는 방식도 나를 만든다고 생각한다.", source: "revisit", created_at: "2026-08-22T00:00:00Z" }];
  return <div className="app-shell"><main className="page home-page"><header className="page-header home-head"><Brand /><span>독자님의 오늘</span></header><DailyQuote quote={quote} book={{ title: "모국어는 차라리 침묵" }} thoughts={thoughts} onAppend={() => {}} onOpen={() => {}} /></main><nav className="bottom-nav"><button className="active">오늘</button><button>서재</button><button>사랑방</button></nav><div className="demo-badge">디자인 미리보기</div></div>;
}

export function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("home");
  const [route, setRoute] = useState(null);
  const [inviteToken, setInviteToken] = useState(() => pendingInviteToken());
  const [inviteError, setInviteError] = useState("");
  const loadMe = useCallback(async (userId, emailAddress) => {
    const profilePromise = sb.from("profiles").select("*").eq("id", userId).single();
    let memberResult = await sb.rpc("reading_access");
    if (memberResult.error && selectiveSharingError(memberResult.error)) memberResult = await sb.rpc("is_member");
    const profileResult = await profilePromise;
    const member = !!memberResult.data;
    if (member) await sb.rpc("register_reading_circle_member");
    setMe({ id: userId, email: String(emailAddress || "").toLowerCase(), name: profileResult.data?.display_name || null, member, shelfPublic: !!profileResult.data?.shelf_public });
  }, []);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    if (!session?.user) { setMe(null); return undefined; }
    (async () => {
      if (inviteToken) {
        const { error } = await sb.rpc("accept_reading_invitation", { p_token: inviteToken });
        if (!active) return;
        if (error) setInviteError(selectiveSharingError(error) ? "초대 기능용 데이터베이스 업데이트가 아직 적용되지 않았습니다." : error.message);
        else {
          setInviteError(""); setInviteToken("");
          try { window.sessionStorage.removeItem(INVITE_TOKEN_KEY); } catch { /* 저장소 미지원 */ }
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
      if (active) await loadMe(session.user.id, session.user.email);
    })();
    return () => { active = false; };
  }, [session, inviteToken, loadMe]);
  useEffect(() => {
    if (!me) return;
    const match = window.location.hash.match(/^#\/b\/([0-9a-f-]{36})$/i);
    if (match) { setTab("rooms"); setRoute({ type: "shared", id: match[1] }); }
  }, [me]);

  const openShared = (id) => {
    window.history.replaceState(null, "", `/#/b/${id}`);
    setRoute({ type: "shared", id });
  };
  const closeRoute = () => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    setRoute(null);
  };

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) return <DemoApp />;
  if (session === undefined) return null;
  if (!session) return <Auth invited={!!inviteToken} />;
  if (!me) return <div className="loading fullscreen">서재를 여는 중…</div>;
  if (!me.member) return <InviteOnly error={inviteError} />;
  if (!me.name) return <Nickname userId={me.id} onDone={() => loadMe(me.id, me.email)} />;

  let content;
  if (route?.type === "invites") content = <InviteAdmin me={me} onBack={closeRoute} />;
  else if (route?.type === "book") content = <BookView book={route.book} me={me} onBack={closeRoute} />;
  else if (route?.type === "shared") content = <SharedBook bookId={route.id} me={me} onBack={closeRoute} />;
  else if (tab === "home") content = <Home me={me} onOpenBook={(book) => book && setRoute({ type: "book", book })} onOpenShared={openShared} onManageInvites={() => setRoute({ type: "invites" })} onGoLibrary={() => setTab("library")} />;
  else if (tab === "library") content = <Library me={me} onOpenBook={(book) => setRoute({ type: "book", book })} />;
  else content = <Sarangbang onOpen={openShared} />;

  return (
    <div className="app-shell">
      {content}
      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button className={tab === "home" && !route ? "active" : ""} onClick={() => { closeRoute(); setTab("home"); }}>오늘</button>
        <button className={tab === "library" && !route ? "active" : ""} onClick={() => { closeRoute(); setTab("library"); }}>서재</button>
        <button className={tab === "rooms" && !route ? "active" : ""} onClick={() => { closeRoute(); setTab("rooms"); }}>사랑방</button>
      </nav>
    </div>
  );
}
