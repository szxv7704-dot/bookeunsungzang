# 책은성장

읽은 문장이 질문이 되고, 나눈 생각이 한 권의 책이 되는 공동 독서 웹 앱입니다.

## 공간

- **오늘**: 지난날 기록한 문장과 생각을 다시 만납니다.
- **서재**: 000 총류부터 900 역사까지 분류된 개인 기록 공간입니다. 직접 쓴 생각이 많아질수록 책등이 두꺼워지고, 분류별 권수로 관심 분야를 확인합니다.
- **사랑방**: 초대받은 사람끼리, 내가 고른 주제만 나누는 공동 독서 공간입니다. 공유받은 사람에게는 책 표지와 선택한 질문·근거·답만 보입니다.

## 기록 방식

- `수정`: 기존 생각의 내용만 고치며 최초 작성일은 유지합니다.
- `덧붙이기`: 새로운 날짜의 생각을 별도 기록으로 추가합니다.
- `여기까지 정리하기`: AI 대화를 주제별 독후감으로 엮어 내 서재에만 저장합니다.
- `사랑방에 주제 나누기`: 정리된 주제와 공유할 사람을 각각 선택하며, AI 대화 원문과 선택하지 않은 기록은 공개하지 않습니다.
- `초대 관리`: `szxv7704@gmail.com` 관리자에게만 보입니다. 이메일별 초대 링크를 만들고 Gmail 작성창을 열며, 수락·취소·구성원 내보내기를 관리합니다.
- 기존 `books`, `quotes`, `topics`, `messages` 데이터는 그대로 사용합니다.
- 새 생각은 additive migration으로 추가되는 `quote_thoughts`에 저장됩니다.
- 서가 분류 마이그레이션 전에는 분류를 현재 기기에 임시 저장하며, 마이그레이션 적용 후 다시 저장하면 계정 데이터로 동기화됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

AI 대화와 도서 검색까지 로컬에서 사용하려면 `.env.example`을 `.env.local`로 복사한 뒤 서버 전용 키를 입력합니다.

- [OpenAI API 키 발급](https://platform.openai.com/api-keys)
- [알라딘 TTB 키 발급 및 URL 등록](https://www.aladin.co.kr/ttb/wblog_manage.aspx) — 알라딘 로그인 후 사용할 사이트 URL을 등록하면 발급됩니다.

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

Supabase SQL Editor에서 다음 마이그레이션을 순서대로 한 번씩 실행합니다.

1. `supabase/migrations/202608220001_quote_thoughts.sql` — 날짜별 생각 덧붙이기
2. `supabase/migrations/202608220002_selective_topic_sharing.sql` — 주제·사람 선택 공유와 알림
3. `supabase/migrations/202608220003_invitation_management.sql` — 관리자 전용 초대 링크·입장 승인·구성원 관리
4. `supabase/migrations/202608220004_library_classification.sql` — 기존 책을 보존하는 000~999 서가 분류

모든 마이그레이션은 기존 책·문장·AI 대화·독후감 행을 삭제하지 않습니다.

## 보안

- AI API는 Supabase 로그인 토큰을 확인한 요청만 처리합니다.
- Google OAuth client secret 파일을 저장소에 커밋하지 않습니다.
- Supabase anon key는 공개 클라이언트 키이므로 모든 테이블에 RLS가 활성화되어 있어야 합니다.
