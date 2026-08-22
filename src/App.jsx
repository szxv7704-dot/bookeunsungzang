import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callAI, formatDate, isMissingRelation, relativeDays, sb, spineColor } from "./lib";

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
      <span className="brand-mark">冊</span>
      <span>책은성장</span>
    </div>
  );
}

function Auth() {
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
      <div className="auth-seal">冊</div>
      <h1>책은성장</h1>
      <p>읽은 문장이 질문이 되고,<br />나눈 생각이 한 권의 책이 됩니다.</p>
      <ErrorNote>{error}</ErrorNote>
      <button className="primary wide" onClick={signIn}>Google로 서재 열기</button>
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

function Home({ me, onOpenBook, onGoLibrary, onGoRooms }) {
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
      <header className="page-header home-head"><Brand /><button className="profile-link" onClick={() => sb.auth.signOut()} title="로그아웃">{me.name}님의 오늘</button></header>
      <div className="home-intro">
        <p>읽는 사람의 시간이<br />조용히 깊어지는 곳.</p>
        <span>PRIVATE READING ROOM · SEOUL</span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {data.loading ? <div className="loading">지난 문장을 꺼내는 중…</div> : daily ? (
        <DailyQuote quote={daily} book={bookMap[daily.book_id]} thoughts={dailyThoughts}
          onAppend={() => setEditing({ quote: daily })} onOpen={() => onOpenBook(bookMap[daily.book_id])} />
      ) : (
        <section className="empty-state"><span>첫 문장을 기다리는 서재</span><p>읽다가 마음을 멈춰 세운 문장을 담아보세요.</p><button className="primary" onClick={onGoLibrary}>서재로 가기</button></section>
      )}

      <section className="home-section">
        <div className="section-title"><h2>이어서 읽기</h2><button onClick={onGoLibrary}>서재 전체 보기</button></div>
        <div className="continue-row">
          {data.books.slice(0, 3).map((book) => <CoverCard key={book.id} book={book} onClick={() => onOpenBook(book)} small />)}
        </div>
      </section>

      <button className="room-callout" onClick={onGoRooms}>
        <span className="room-icon">舍</span><span><b>사랑방에 들러보세요</b><small>함께 읽는 책의 질문과 새로운 답을 확인합니다.</small></span><i>→</i>
      </button>
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

function AddBook({ onClose, onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", publisher: "" });
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
    const row = book ? { title: book.title, author: book.author || null, publisher: book.publisher || null, pub_date: book.pubDate || null, isbn13: book.isbn13 || null, cover_url: book.cover || null, link: book.link || null }
      : { title: form.title.trim(), author: form.author.trim() || null, publisher: form.publisher.trim() || null };
    if (!row.title) return;
    const { error: insertError } = await sb.from("books").insert(row);
    if (insertError) setError(insertError.message); else onAdded();
  };
  return (
    <Sheet title="서재에 책 꽂기" onClose={onClose}>
      {!manual ? <>
        <div className="search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="책 제목이나 저자" autoFocus /><button className="primary" onClick={search}>{busy ? "찾는 중" : "찾기"}</button></div>
        <ErrorNote>{error}</ErrorNote>
        <div className="search-results">{results?.map((book) => <button key={book.isbn13 || book.link} onClick={() => add(book)}>{book.cover ? <img src={book.cover} alt="" /> : <i style={{ background: spineColor(book.title) }} />}<span><b>{book.title}</b><small>{book.author}{book.publisher ? ` · ${book.publisher}` : ""}</small></span></button>)}</div>
        <button className="text-button wide" onClick={() => setManual(true)}>찾는 책이 없나요? 직접 입력하기</button>
      </> : <>
        <label className="field"><span>책 제목</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus /></label>
        <label className="field"><span>저자</span><input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
        <label className="field"><span>출판사</span><input value={form.publisher} onChange={(event) => setForm({ ...form, publisher: event.target.value })} /></label>
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
  const [adding, setAdding] = useState(false);
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

  return (
    <main className="page library-page">
      <header className="page-header"><div><div className="eyebrow">나만의 기록이 머무는 곳</div><h1>서재</h1></div><button className="round-button" onClick={() => setAdding(true)} aria-label="책 추가">＋</button></header>
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div className="loading">책장을 여는 중…</div> : books.length ? (
        <div className="bookshelf"><div className="shelf-books">
          {books.map((book) => {
            const chars = writtenByBook[book.id] || 0;
            const width = Math.min(74, 34 + Math.sqrt(chars) * 1.15);
            return <button className="book-spine" key={book.id} style={{ width, background: spineColor(book.title) }} onClick={() => onOpenBook(book)} title={`${book.title} · 내가 쓴 글 ${chars.toLocaleString()}자`}>
              {book.shared_at && <i className="seal-dot" />}<span>{book.title}</span><small>{book.author}</small>
            </button>;
          })}
        </div><div className="shelf-board" /><p className="shelf-caption">내가 쓴 생각이 쌓일수록 책등도 조금씩 두꺼워집니다.</p></div>
      ) : <section className="empty-state"><span>아직 비어 있는 첫 번째 칸</span><p>책을 꽂고, 기억하고 싶은 문장을 남겨보세요.</p><button className="primary" onClick={() => setAdding(true)}>첫 책 꽂기</button></section>}
      {adding && <AddBook onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
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

function Talk({ book, quotes, me, shared = false, onOrganized }) {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const title = shared ? "사랑방 공동 AI 대화" : "개인 대화";

  useEffect(() => {
    let channel;
    (async () => {
      let query = sb.from("sessions").select("*").eq("book_id", book.id).eq("status", "open").order("created_at", { ascending: false }).limit(1);
      query = shared ? query.eq("title", title) : query.in("title", ["대화", "개인 대화"]);
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
  }, [book.id, shared, title]);
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
    if (!window.confirm("여기까지 나눈 대화를 주제별 질문으로 정리합니다. AI 대화 원문은 공개되지 않고, 정리된 질문과 근거·의견만 질문 탭과 사랑방에 반영됩니다.")) return;
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
      <div className="talk-intro"><b>{shared ? "함께 생각을 넓히는 대화" : "나만의 생각 탐색"}</b><p>{shared ? "이곳의 대화는 사랑방 구성원에게 보입니다. 개인적인 탐색은 서재에서 이어가세요." : "AI의 해석은 정답이 아니라 다른 관점입니다. 남기고 싶은 부분만 사랑방에 가져가세요."}</p></div>
      <div className="messages">{messages.map((message) => <article className={`message ${message.role === "ai" ? "ai" : "human"}`} key={message.id}><small>{message.author_name || (message.role === "ai" ? "AI" : "독자")}</small><p>{message.content}</p></article>)}<div ref={endRef} /></div>
      <ErrorNote>{error}</ErrorNote>
      {!shared && messages.length >= 2 && <section className="organize-callout"><div><b>이 대화를 질문으로 남기기</b><p>흩어진 생각을 주제별 질문·근거 문장·각자의 의견으로 엮습니다. 정리 결과만 사랑방에 공유됩니다.</p></div><button className="primary" onClick={organize} disabled={organizing || busy}>{organizing ? "주제를 엮는 중…" : "여기까지 정리하기"}</button></section>}
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
    const { data: sessionRows } = await sb.from("sessions").select("id").eq("book_id", bookId).eq("title", "사랑방 질문지").limit(1);
    let questionSessionId = sessionRows?.[0]?.id;
    if (!questionSessionId) {
      const { data: made, error: sessionError } = await sb.from("sessions").insert({ book_id: bookId, title: "사랑방 질문지", status: "open" }).select("id").single();
      if (sessionError) { setError(sessionError.message); return; }
      questionSessionId = made.id;
    }
    const { data, error: insertError } = await sb.from("topics").insert({ book_id: bookId, session_id: questionSessionId, keyword: "함께 묻기", title: question.title.trim(), summary: question.rationale.trim() || null, order_no: nextOrder }).select().single();
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
      <div className="section-title"><div><div className="eyebrow">책에서 시작한 물음</div><h2>함께 묻고 답하기</h2></div>{canAsk && <button className="secondary" onClick={() => setAsking(true)}>질문 제안</button>}</div>
      <ErrorNote>{error}</ErrorNote>
      {!topics.length && <div className="empty-state small"><span>아직 모인 질문이 없습니다</span><p>마음에 걸린 장면과 그 이유를 질문으로 건네보세요.</p></div>}
      {topics.map((topic, index) => {
        const evidence = links.filter((link) => link.topic_id === topic.id).map((link) => quoteMap[link.quote_id]).filter(Boolean);
        const answers = opinions.filter((opinion) => opinion.topic_id === topic.id);
        return <article className="question-card" key={topic.id}>
          <div className="question-number">{topic.keyword && topic.keyword !== "함께 묻기" ? `대화에서 엮은 주제 · ${topic.keyword}` : `물음 ${String(index + 1).padStart(2, "0")}`}</div><h3>{topic.title}</h3>
          {topic.summary && <p className="rationale">{topic.summary}</p>}
          {evidence.map((quote) => <blockquote key={quote.id}>“{quote.content}”<small>{quote.page ? `${quote.page}쪽` : "책 속 문장"}</small></blockquote>)}
          {topic.unresolved && <div className="topic-note unresolved"><b>아직 남은 물음</b><p>{topic.unresolved}</p></div>}
          {topic.apply_note && <div className="topic-note apply"><b>삶에 이어볼 점</b><p>{topic.apply_note}</p></div>}
          <div className="answers"><h4>각자의 생각 <span>{answers.length}</span></h4>{answers.map((item) => <div className={`answer ${item.user_id === me.id ? "mine" : ""}`} key={item.id}><b>{item.author_name}</b><p>{item.content}</p></div>)}</div>
          <div className="answer-box"><textarea rows="3" value={drafts[topic.id] || ""} onChange={(event) => setDrafts({ ...drafts, [topic.id]: event.target.value })} placeholder="내 생각과 책 속 근거를 함께 남겨보세요." /><button className="primary" onClick={() => answer(topic.id)}>답 남기기</button></div>
        </article>;
      })}
      {asking && <Sheet title="사랑방에 질문 건네기" onClose={() => setAsking(false)}>
        <label className="field"><span>함께 나누고 싶은 질문</span><textarea rows="4" value={question.title} onChange={(event) => setQuestion({ ...question, title: event.target.value })} autoFocus /></label>
        <label className="field"><span>이 질문이 생긴 이유</span><textarea rows="4" value={question.rationale} onChange={(event) => setQuestion({ ...question, rationale: event.target.value })} /></label>
        <label className="field"><span>근거가 된 문장</span><select value={question.quoteId} onChange={(event) => setQuestion({ ...question, quoteId: event.target.value })}><option value="">선택하지 않음</option>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.page ? `${quote.page}쪽 · ` : ""}{quote.content.slice(0, 45)}</option>)}</select></label>
        <button className="primary wide" onClick={submitQuestion}>질문 제안하기</button>
      </Sheet>}
    </section>
  );
}

function BookView({ book, me, onBack, onShared }) {
  const [quotes, setQuotes] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [tab, setTab] = useState("records");
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState(book.share_note || "");
  const [shared, setShared] = useState(!!book.shared_at);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: quoteError } = await sb.from("quotes").select("*").eq("book_id", book.id).order("created_at");
    if (quoteError) { setError(quoteError.message); return; }
    let result = { rows: [] };
    try { result = await loadThoughts((data || []).map((quote) => quote.id)); } catch (loadError) { setError(loadError.message); }
    setQuotes(data || []); setThoughts(result.rows);
  }, [book.id]);
  useEffect(() => { load(); }, [load]);
  const publish = async () => {
    const { error: updateError } = await sb.from("books").update({ shared_at: new Date().toISOString(), share_note: shareNote.trim() || null }).eq("id", book.id);
    if (updateError) setError(updateError.message); else { setShared(true); setSharing(false); onShared?.(); }
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/#/b/${book.id}`);
  };

  return (
    <main className="page book-page">
      <button className="back-button" onClick={onBack}>← 서재로</button>
      <header className="book-hero">
        <span className="book-cover-mini">{book.cover_url ? <img src={book.cover_url} alt="" /> : <i style={{ background: spineColor(book.title) }}>{book.title}</i>}</span>
        <div><div className="eyebrow">나의 독서책</div><h1>{book.title}</h1><p>{book.author}</p><button className="text-button" onClick={() => setSharing(true)}>{shared ? "사랑방 소개 수정" : "사랑방에 함께 읽기 제안"}</button>{shared && <button className="text-button share-link" onClick={copyLink}>초대 링크 복사</button>}</div>
      </header>
      <nav className="tabs"><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>문장과 생각</button><button className={tab === "talk" ? "active" : ""} onClick={() => setTab("talk")}>AI와 생각 나누기</button><button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>정리한 질문</button></nav>
      <ErrorNote>{error}</ErrorNote>
      {tab === "records" && <><div className="section-title"><h2>기억한 문장</h2><button className="secondary" onClick={() => setAdding(true)}>문장 담기</button></div>{quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} thoughts={thoughts.filter((thought) => thought.quote_id === quote.id)} onReload={load} />)}{!quotes.length && <div className="empty-state small"><span>첫 문장을 기다리고 있어요</span></div>}</>}
      {tab === "talk" && <Talk book={book} quotes={quotes} me={me} onOrganized={() => setTab("questions")} />}
      {tab === "questions" && <QuestionBoard bookId={book.id} me={me} canAsk />}
      {adding && <QuoteEditor book={book} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {sharing && <Sheet title="사랑방에 책 내어놓기" onClose={() => setSharing(false)}><p className="sheet-copy">표지가 사랑방에 전시되고, 질문과 답을 함께 발전시킬 수 있습니다. 개인 AI 대화와 비공개 생각은 공개되지 않습니다.</p><label className="field"><span>함께 읽는 사람들에게</span><textarea rows="4" value={shareNote} onChange={(event) => setShareNote(event.target.value)} placeholder="함께 이야기하고 싶은 이유를 적어주세요." /></label><button className="primary wide" onClick={publish}>사랑방에 내어놓기</button></Sheet>}
    </main>
  );
}

function Sarangbang({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: roomError } = await sb.rpc("sarangbang");
    if (roomError) setError(roomError.message); else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <main className="page rooms-page">
      <header className="page-header"><div><div className="eyebrow">함께 읽고 다르게 생각하는 곳</div><h1>사랑방</h1></div><span className="room-seal">舍</span></header>
      <p className="room-lead">책의 얼굴을 마주 보고, 질문의 근거와 각자의 답을 한자리에 모읍니다.</p>
      <ErrorNote>{error}</ErrorNote>
      {loading ? <div className="loading">사랑방 문을 여는 중…</div> : rows.length ? <div className="display-shelf">{rows.map((row) => <CoverCard key={row.id} book={row} onClick={() => onOpen(row.id)} meta={`${row.owner_name} · 질문 ${row.topic_count || 0} · 답 ${row.opinion_count || 0}`} />)}</div> : <div className="empty-state"><span>아직 전시된 책이 없습니다</span><p>서재의 책에서 ‘사랑방에 함께 읽기 제안’을 눌러보세요.</p></div>}
    </main>
  );
}

function SharedBook({ bookId, me, onBack }) {
  const [book, setBook] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState("questions");
  const [error, setError] = useState("");
  useEffect(() => { (async () => {
    const { data, error: infoError } = await sb.rpc("open_shared_book", { b_id: bookId });
    if (infoError) { setError(infoError.message); return; }
    const info = data?.[0]; setBook(info);
    const { data: quoteRows } = await sb.from("quotes").select("*").eq("book_id", bookId).order("created_at");
    setQuotes(quoteRows || []);
  })(); }, [bookId]);
  if (error) return <main className="page"><button className="back-button" onClick={onBack}>← 사랑방으로</button><ErrorNote>{error}</ErrorNote></main>;
  if (!book) return <main className="page"><div className="loading">책을 펼치는 중…</div></main>;
  return (
    <main className="page shared-book-page">
      <button className="back-button" onClick={onBack}>← 사랑방으로</button>
      <header className="shared-hero"><span>{book.cover_url ? <img src={book.cover_url} alt="" /> : <i style={{ background: spineColor(book.title) }}>{book.title}</i>}</span><div><div className="eyebrow">{book.owner_name}님이 내어놓은 책</div><h1>{book.title}</h1><p>{book.author}</p>{book.share_note && <blockquote>{book.share_note}</blockquote>}</div></header>
      <nav className="tabs"><button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>질문과 답</button><button className={tab === "talk" ? "active" : ""} onClick={() => setTab("talk")}>공동 AI 대화</button></nav>
      {tab === "questions" ? <QuestionBoard bookId={bookId} me={me} canAsk /> : <Talk book={{ ...book, id: bookId }} quotes={quotes} me={me} shared />}
    </main>
  );
}

function DemoApp() {
  const quote = { id: "demo", book_id: "book", content: "사람은 자신이 사랑하는 것에 의해 만들어진다.", page: "127", memo: "무엇을 좋아하는지가 결국 나를 설명해준다는 뜻으로 읽었다.", created_at: "2026-03-12T00:00:00Z" };
  const thoughts = [{ id: "t1", quote_id: "demo", content: "지금은 좋아하는 대상뿐 아니라 그것을 사랑하는 방식도 나를 만든다고 생각한다.", source: "revisit", created_at: "2026-08-22T00:00:00Z" }];
  const demoBooks = [
    { id: "b1", title: "모국어는 차라리 침묵", author: "목정원" },
    { id: "b2", title: "소년이 온다", author: "한강" },
    { id: "b3", title: "명상록", author: "마르쿠스 아우렐리우스" },
  ];
  return <div className="app-shell"><main className="page home-page"><header className="page-header home-head"><Brand /><span>독자님의 오늘</span></header><div className="home-intro"><p>읽는 사람의 시간이<br />조용히 깊어지는 곳.</p><span>PRIVATE READING ROOM · SEOUL</span></div><DailyQuote quote={quote} book={{ title: "모국어는 차라리 침묵" }} thoughts={thoughts} onAppend={() => {}} onOpen={() => {}} /><section className="home-section"><div className="section-title"><h2>이어서 읽기</h2><button>서재 전체 보기</button></div><div className="continue-row">{demoBooks.map((book) => <CoverCard key={book.id} book={book} small />)}</div></section><button className="room-callout"><span className="room-icon">舍</span><span><b>사랑방에 들러보세요</b><small>답변을 기다리는 질문이 2개 있습니다.</small></span><i>→</i></button></main><nav className="bottom-nav"><button className="active">오늘</button><button>서재</button><button>사랑방</button></nav><div className="demo-badge">디자인 미리보기</div></div>;
}

export function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("home");
  const [route, setRoute] = useState(null);
  const loadMe = useCallback(async (userId) => {
    const [{ data: profile }, { data: member }] = await Promise.all([sb.from("profiles").select("*").eq("id", userId).single(), sb.rpc("is_member")]);
    setMe({ id: userId, name: profile?.display_name || null, member: !!member, shelfPublic: !!profile?.shelf_public });
  }, []);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session?.user) loadMe(session.user.id); else setMe(null); }, [session, loadMe]);
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
  if (!session) return <Auth />;
  if (!me) return <div className="loading fullscreen">서재를 여는 중…</div>;
  if (!me.name) return <Nickname userId={me.id} onDone={() => loadMe(me.id)} />;

  let content;
  if (route?.type === "book") content = <BookView book={route.book} me={me} onBack={closeRoute} />;
  else if (route?.type === "shared") content = <SharedBook bookId={route.id} me={me} onBack={closeRoute} />;
  else if (tab === "home") content = <Home me={me} onOpenBook={(book) => book && setRoute({ type: "book", book })} onGoLibrary={() => setTab("library")} onGoRooms={() => setTab("rooms")} />;
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
