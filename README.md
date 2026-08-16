# 책장 — 설치 순서

빌드 과정이 없습니다. 파일을 GitHub에 올리고 Vercel에 연결하면 끝입니다.

## 파일 배치

```
(리포지토리 루트)
├── index.html
├── README.md
└── api/
    └── gemini.js      ← 반드시 api 폴더 안에
```

GitHub 웹에서 `api/gemini.js`를 만들 때는 파일 이름 칸에 `api/gemini.js`라고 통째로 입력하면 폴더가 자동으로 생깁니다.

---

## 1. GitHub 리포지토리 만들기

1. github.com → New repository
2. 이름: `bookshelf` (아무거나), **Private** 권장
3. 만든 뒤 Add file → Upload files로 `index.html`, `README.md` 업로드
4. Add file → Create new file → 이름에 `api/gemini.js` 입력 → 내용 붙여넣기 → Commit

## 2. Supabase 키를 index.html에 넣기

Supabase → Project Settings → API 에서 두 개를 복사해 `index.html` 위쪽 두 줄을 교체합니다.

```js
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGci...";
```

anon 키는 브라우저에 노출되어도 되는 키입니다. RLS가 걸려 있어 본인 데이터만 열립니다.
**service_role 키는 절대 넣지 마세요.**

## 3. Gemini 키 발급

1. https://aistudio.google.com/apikey → Create API key
2. 키 복사 (이 값은 브라우저에 넣지 않습니다)

## 4. Vercel 배포

1. vercel.com → Add New → Project → GitHub 리포지토리 선택
2. Framework Preset은 **Other**, 나머지 설정은 건드리지 않고 Deploy
3. 배포 후 Settings → Environment Variables 에서 추가
   - Name: `GEMINI_API_KEY`
   - Value: 발급받은 키
   - 세 환경(Production / Preview / Development) 모두 체크
4. Deployments → 최신 항목 → Redeploy (환경변수는 재배포해야 반영됩니다)

## 5. Supabase 로그인 주소 등록

Supabase → Authentication → URL Configuration

- **Site URL**: `https://내프로젝트.vercel.app`
- **Redirect URLs**: 같은 주소 추가

이걸 안 하면 메일의 로그인 링크가 localhost로 가서 열리지 않습니다.

---

## 확인

1. Vercel 주소 접속 → 이메일 입력 → 로그인 링크 받기
2. 메일의 링크 열기 → 책장 화면
3. 책 등록 → 문장 담기 → 대화 탭에서 한마디 → AI 답이 오면 성공

## 안 될 때

| 증상 | 원인 |
|---|---|
| 로그인 링크가 localhost로 감 | 5번 Site URL 미설정 |
| 대화에서 "GEMINI_API_KEY가 설정되지 않았습니다" | 4번 환경변수 등록 후 재배포 안 함 |
| 책 등록 시 권한 오류 | 로그인이 안 된 상태. RLS는 로그인 사용자만 허용 |
| 화면이 하얗게 빔 | index.html 위쪽 두 줄 교체 안 함 |
