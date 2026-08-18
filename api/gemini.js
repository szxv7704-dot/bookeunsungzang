// api/gemini.js — Vercel 서버리스 함수 (OpenAI)
//
// ※ 파일 이름은 gemini.js 그대로 둡니다. index.html이 /api/gemini 를 호출하기 때문입니다.
//    나중에 OCR(Gemini)을 이 파일에 같이 붙일 예정이라 이름은 그대로 두는 편이 낫습니다.
//
// Vercel > Settings > Environment Variables 에 OPENAI_API_KEY 등록 필요.

// ── 모델 ──────────────────────────────────────────────
// 정리 품질이 아쉬우면 여기만 "gpt-5.6-terra" 로 바꾸면 됩니다.
// ※ 배포 전 platform.openai.com/docs/models 에서 정확한 모델 ID를 한 번 확인하세요.
const MODEL = "gpt-5.6-luna";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

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

const ORGANIZE_SYSTEM = `당신은 독서 대화를 나중에 다시 읽을 기록으로 재구성하는 편집자입니다.

주어진 대화 전체를 읽고 2~5개의 주제로 나누십시오. 대화의 시간 순서가 아니라 '무엇에 대한 이야기였는가'로 묶습니다.

각 주제마다:
- title: 그 주제가 무엇인지 한 줄로. 명사형으로 구체적으로. ("성장에 대하여" 같은 막연한 제목 금지)
- summary: 그 주제에서 오간 논의의 흐름을 2~4문장으로. 결론만이 아니라 의견이 갈린 지점도 담습니다.
- quote_ids: 그 주제와 직접 관련된 문장의 id를 배열로. 관련 없으면 빈 배열. 없는 id를 만들지 마십시오.
- opinions: 대화에서 각자가 실제로 말한 의견을 화자별로 정리. author_name은 대화에 등장한 이름을 그대로 씁니다. 대화에 없던 의견을 창작하지 마십시오.
- apply_note: 사용자가 자기 일이나 삶에 적용하겠다고 말한 것. 대화에서 그런 언급이 없었다면 null.

반드시 아래 형태의 JSON 객체만 출력하십시오.
{"topics":[{"title":"","summary":"","quote_ids":[],"opinions":[{"author_name":"","content":""}],"apply_note":null}]}`;

async function openai(messages, json = false) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const body = {
    model: MODEL,
    messages,
    max_completion_tokens: json ? 4096 : 1024,
    ...(json ? { response_format: { type: "json_object" } } : {})
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "OpenAI 호출 실패");

  const text = (d?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("빈 응답을 받았습니다. 다시 시도해 주세요.");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });

  try {
    const { mode, payload } = req.body || {};

    // ── 대화 ──────────────────────────────────────────
    if (mode === "chat") {
      const { book, quotes = [], history = [] } = payload;

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
        ...history.map(m => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.content
        }))
      ];

      const text = await openai(messages);
      return res.status(200).json({ text });
    }

    // ── 정리 ──────────────────────────────────────────
    if (mode === "organize") {
      const { book, quotes = [], messages: talk = [] } = payload;

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
