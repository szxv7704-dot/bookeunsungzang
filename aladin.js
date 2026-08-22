// api/aladin.js — 알라딘 도서 검색 프록시
// TTB 키는 서버에만 두고 브라우저에는 노출되지 않습니다.
// Vercel > Settings > Environment Variables 에 ALADIN_TTB_KEY 등록 필요.

const ENDPOINT = "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });

  const key = process.env.ALADIN_TTB_KEY;
  if (!key) return res.status(500).json({ error: "ALADIN_TTB_KEY가 설정되지 않았습니다." });

  const q = ((req.body || {}).query || "").trim();
  if (!q) return res.status(400).json({ error: "검색어가 없습니다." });

  const url =
    `${ENDPOINT}?ttbkey=${encodeURIComponent(key)}` +
    `&Query=${encodeURIComponent(q)}` +
    `&QueryType=Keyword&MaxResults=10&start=1` +
    `&SearchTarget=Book&Cover=Big&output=js&Version=20131101`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 알라딘 응답에 제어문자가 섞이는 경우가 있어 한 번 걸러냅니다.
      try {
        data = JSON.parse(text.replace(/[\u0000-\u001F]+/g, " "));
      } catch {
        return res.status(502).json({ error: "알라딘 응답을 읽지 못했습니다." });
      }
    }

    if (data.errorMessage) {
      return res.status(502).json({ error: "알라딘: " + data.errorMessage });
    }

    const https = (u) => (u || "").replace(/^http:\/\//i, "https://");
    const strip = (s) => (s || "").replace(/<[^>]*>/g, "").trim();

    const items = (data.item || []).map(it => ({
      title: strip(it.title).replace(/^\[.*?\]\s*/, ""),
      author: strip(it.author),
      publisher: strip(it.publisher),
      pubDate: it.pubDate || null,
      isbn13: it.isbn13 || it.isbn || null,
      cover: https(it.cover),
      link: https(it.link),
      categoryName: strip(it.categoryName),
      categoryId: it.categoryId || null
    }));

    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message || "검색에 실패했습니다." });
  }
}
