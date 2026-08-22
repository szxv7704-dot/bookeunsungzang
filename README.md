# 책은성장

읽은 문장이 질문이 되고, 나눈 생각이 한 권의 책이 되는 공동 독서 웹 앱입니다.

## 공간

- **오늘**: 지난날 기록한 문장과 생각을 다시 만납니다.
- **서재**: 책등으로 꽂힌 개인 기록 공간입니다. 직접 쓴 생각이 많아질수록 책등이 두꺼워집니다.
- **사랑방**: 표지가 보이는 공동 독서 공간입니다. 책 속 근거가 있는 질문, 각자의 답, 공동 AI 대화를 모읍니다.

## 기록 방식

- `수정`: 기존 생각의 내용만 고치며 최초 작성일은 유지합니다.
- `덧붙이기`: 새로운 날짜의 생각을 별도 기록으로 추가합니다.
- 기존 `books`, `quotes`, `topics`, `messages` 데이터는 그대로 사용합니다.
- 새 생각은 additive migration으로 추가되는 `quote_thoughts`에 저장됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

AI 대화와 도서 검색까지 로컬에서 사용하려면 `.env.example`을 `.env.local`로 복사한 뒤 서버 전용 키를 입력합니다.

```env
OPENAI_API_KEY=발급받은_OpenAI_API_키
ALADIN_TTB_KEY=발급받은_알라딘_TTB_키
```

환경 파일을 저장한 다음 개발 서버를 다시 실행해야 키가 반영됩니다. API 키는 브라우저 코드나 GitHub에 올리지 않습니다.

로그인 없이 디자인만 확인하려면 개발 주소 뒤에 `?preview=1`을 붙입니다.

## 배포 설정

Vercel 환경 변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (선택, 기본값 `gpt-5-mini`)
- `ALADIN_TTB_KEY`

Supabase SQL Editor에서 `supabase/migrations/202608220001_quote_thoughts.sql`을 한 번 실행해야 생각 덧붙이기가 활성화됩니다. 이 마이그레이션은 기존 테이블이나 행을 삭제·변경하지 않습니다.

## 보안

- AI API는 Supabase 로그인 토큰을 확인한 요청만 처리합니다.
- Google OAuth client secret 파일을 저장소에 커밋하지 않습니다.
- Supabase anon key는 공개 클라이언트 키이므로 모든 테이블에 RLS가 활성화되어 있어야 합니다.
