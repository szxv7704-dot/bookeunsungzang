-- 기존 도서 행을 수정하거나 삭제하지 않고 서가 분류 정보만 추가합니다.
alter table public.books
  add column if not exists classification_code text,
  add column if not exists source_category text;

do $$
begin
  alter table public.books
    add constraint books_classification_code_format
    check (classification_code is null or classification_code ~ '^[0-9]{3}$');
exception
  when duplicate_object then null;
end $$;

create index if not exists books_owner_classification_idx
  on public.books (user_id, classification_code);

comment on column public.books.classification_code is '한국십진분류형 3자리 서가 코드. 화면에서는 000~900의 큰 갈래로 묶습니다.';
comment on column public.books.source_category is '도서 검색 공급자가 돌려준 원본 분야명';
