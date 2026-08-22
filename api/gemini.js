// api/gemini.js — Vercel 서버리스 함수 (OpenAI)
//
// ※ 파일 이름은 gemini.js 그대로 둡니다. index.html이 /api/gemini 를 호출하기 때문입니다.
//    나중에 OCR(Gemini)을 이 파일에 같이 붙일 예정이라 이름은 그대로 두는 편이 낫습니다.
//
// Vercel > Settings > Environment Variables 에 OPENAI_API_KEY 등록 필요.

// ── 모델 ──────────────────────────────────────────────
// 모델을 바꾸려면 OPENAI_MODEL 환경 변수를 설정합니다.
const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_SUPABASE_URL = "https://whyoeekvnvqtsgqmlywj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoeW9lZWt2bnZxdHNncW1seXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjM1NDAsImV4cCI6MjEwMjQzOTU0MH0.mYIrGDbzNo_4Rg_lEKU5cI4YJXyuQtDoQYRC5j1M47U";
const windows = new Map();

async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authorization },
  });
  return response.ok ? response.json() : null;
}

function withinLimit(userId) {
  const now = Date.now();
  const current = windows.get(userId);
  if (!current || now - current.startedAt > 10 * 60 * 1000) {
    windows.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

const CHAT_SYSTEM = `당신은 한 사람의 독서 대화 상대입니다. 요약가나 해설자가 아니라, 같이 읽고 되묻는 사람입니다.

역할은 셋입니다.
1. 질문을 던져 생각을 끌어냅니다. "왜 그 문장이 걸렸는지", "그 판단의 근거가 무엇인지" 같은 방향으로 한 걸음 더 들어갑니다.
2. 다른 관점과 반론을 제시합니다. 사용자의 해석에 동의만 하지 말고, 그 해석이 놓치는 지점이나 반대편 논거를 실제로 말합니다.
3. 관련 개념·다른 책·현실 사례를 연결합니다.

지켜야 할 것:
- 아래 제공되는 '담아둔 문장'은 사용자가 직접 옮겨 적은 실제 원문입니다. 이 문장들만 책의 내용으로 인용하십시오.
- 제공되지 않은 책 구절을 지어내지 마십시오. 책의 다른 대목이 궁금하면 사용자에게 옮겨 달라고 요청하십시오.
- 책 전체의 줄거리나 저자에 대한 일반 지식을 말할 때는 확신하지 말고, 기억에 의존한 내용임을 밝히십시오.
- 한 번에 한두 개의 질문만 던집니다. 질문을 나열하지 마십시오.
- 3~6문장 정도로 짧게 말합니다. 강의하지 말고 대화하십시오.
- 한국어로, 담백한 평서체로 답합니다.`;

const ORGANIZE_SYSTEM = `당신은 독서 대화를 몇 달 뒤에 다시 읽을 기록으로 남기는 편집자입니다.

가장 중요한 원칙: **대화를 나누지 말고, 흩어진 것을 모으십시오.**

대화는 시간 순서로 흘러갑니다. 하지만 사람의 생각은 한 대상을 여러 번 되돌아옵니다.
같은 것에 대한 이야기가 대화 앞·중간·끝에 흩어져 있다면, 그것은 여러 개의 주제가 아니라 **하나의 주제**입니다.
반드시 그것들을 한자리에 끌어모아 하나로 묶으십시오.

주제를 잡는 기준은 대화의 단락이 아니라 **무엇을 두고 이야기했는가**입니다.
'눈', '목소리', '기억과 증언' 처럼 대화가 반복해서 돌아온 대상·개념을 키워드로 삼으십시오.

각 주제에 담을 것:
- keyword: 그 주제의 핵심어. 한두 단어. (예: "눈", "기억과 증언")
- title: 그 키워드를 두고 무엇을 이야기했는지 한 줄로. 키워드를 되풀이하지 말고 내용을 담으십시오.
  나쁜 예: "눈에 대하여"  좋은 예: "덮는 것이자 보존하는 것으로서의 눈"
- summary: **생각이 어떻게 움직였는지**를 씁니다. 결론만 적지 마십시오.
  처음에 어떻게 봤고, 무엇 때문에 달라졌고, 지금은 어디에 있는지. 2~5문장.
  생각이 움직이지 않았다면 억지로 지어내지 말고 그 자리에서 무엇을 붙들었는지 쓰십시오.
- quote_ids: 그 키워드가 걸린 문장의 id를 모두. 여러 주제에 같은 문장이 들어가도 됩니다. 없으면 빈 배열.
- opinions: 각자가 실제로 말한 의견. author_name은 대화에 등장한 이름 그대로.
  요약하되 그 사람의 표현과 관점을 살리십시오. 대화에 없던 말을 만들지 마십시오.
- unresolved: 매듭짓지 못한 것. 반박당해 흔들린 지점, 답이 나오지 않은 질문, 더 읽어봐야 할 것.
  이 항목이 나중에 가장 쓸모 있습니다. 정말 없으면 null.
- apply_note: 자기 일이나 삶에 적용하겠다고 **직접 말한** 것만. 없으면 null. 지어내지 마십시오.

개수에 대하여:
- 정해진 개수는 없습니다. 대화가 실제로 붙든 것만큼만 만드십시오.
- 한 대상만 깊게 팠다면 주제 하나로 끝내는 것이 정직합니다. 숫자를 채우려고 얕은 주제를 만들지 마십시오.
- 스쳐 지나간 이야기, 한 번 언급되고 만 것은 주제로 세우지 마십시오.
- 많아도 5개를 넘기지 마십시오.

반드시 아래 형태의 JSON 객체만 출력하십시오.
{"topics":[{"keyword":"","title":"","summary":"","quote_ids":[],"opinions":[{"author_name":"","content":""}],"unresolved":null,"apply_note":null}]}`;

async function openai(messages, json = false) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  if (!json) {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const input = messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const requestId = crypto.randomUUID();
    const r = await fetch(RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "X-Client-Request-Id": requestId,
      },
      body: JSON.stringify({ model, instructions: system, input, max_output_tokens: 4096, store: false }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `OpenAI 호출 실패 (${requestId})`);

    const text = String(d?.output_text || d?.output?.flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text").map((item) => item.text).join("\n") || "").trim();
    if (!text) {
      const reason = d?.incomplete_details?.reason;
      throw new Error(reason === "max_output_tokens"
        ? "AI가 생각을 마치기 전에 출력 한도에 도달했습니다. 다시 시도해 주세요."
        : `AI 응답 본문이 비어 있습니다. 다시 시도해 주세요. (${requestId})`);
    }
    return text;
  }

  const body = {
    model,
    messages,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
  };

  const r = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "OpenAI 호출 실패");

  const text = String(d?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("빈 응답을 받았습니다. 다시 시도해 주세요.");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });

  try {
    const user = await authenticate(req);
    if (!user?.id) return res.status(401).json({ error: "로그인한 사용자만 AI 대화를 이용할 수 있습니다." });
    if (!withinLimit(user.id)) return res.status(429).json({ error: "잠시 대화가 많이 오갔습니다. 10분 뒤 다시 시도해 주세요." });

    const { mode, payload } = req.body || {};

    // ── 대화 ──────────────────────────────────────────
    if (mode === "chat") {
      const { book, quotes = [], history = [] } = payload || {};
      if (!book?.title) return res.status(400).json({ error: "책 정보가 필요합니다." });

      const shelf = quotes.length
        ? quotes.map(q =>
            `- ${q.page ? `[${q.page}쪽] ` : ""}${q.content}` +
            (q.memo ? `\n  (독자 메모: ${q.memo})` : "")
          ).join("\n")
        : "(아직 담아둔 문장이 없습니다.)";

      const context =
        `읽고 있는 책: 『${book.title}』${book.author ? ` — ${book.author}` : ""}\n\n` +
        `독자가 담아둔 문장:\n${shelf}`;

      const messages = [
        { role: "system", content: CHAT_SYSTEM },
        { role: "system", content: context },
        ...history.slice(-40).map(m => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: String(m.content || "").slice(0, 6000)
        }))
      ];

      const text = await openai(messages);
      return res.status(200).json({ text });
    }

    // ── 정리 ──────────────────────────────────────────
    if (mode === "organize") {
      const { book, quotes = [], messages: talk = [] } = payload || {};
      if (!book?.title) return res.status(400).json({ error: "책 정보가 필요합니다." });

      const qlist = quotes.length
        ? quotes.map(q => `${q.id}: ${q.page ? `[${q.page}쪽] ` : ""}${q.content}`).join("\n")
        : "(없음)";
      const transcript = talk.map(m => `${m.who}: ${m.content}`).join("\n\n");

      const prompt =
        `책: 『${book.title}』${book.author ? ` — ${book.author}` : ""}\n\n` +
        `[담아둔 문장]\n${qlist}\n\n[대화 전문]\n${transcript}`;

      const raw = await openai(
        [
          { role: "system", content: ORGANIZE_SYSTEM },
          { role: "user", content: prompt }
        ],
        true
      );

      const clean = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        return res.status(502).json({ error: "정리 결과를 읽지 못했습니다. 다시 시도해 주세요." });
      }

      const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      if (!topics.length) {
        return res.status(502).json({ error: "정리할 주제를 찾지 못했습니다. 대화를 조금 더 나눠 보세요." });
      }

      return res.status(200).json({ topics });
    }

    return res.status(400).json({ error: "알 수 없는 요청입니다." });
  } catch (e) {
    return res.status(500).json({ error: e.message || "서버 오류" });
  }
}
