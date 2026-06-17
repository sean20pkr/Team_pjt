# RAG Warehouse

이 폴더는 `dummy_data_output`의 CSV/JSON/MD 원본을 Supabase 적재 기준으로 정리한 작업 공간이다.

## 목적
- 원본 파일은 Supabase Storage에 보관한다.
- 숫자 데이터는 연도/월/숫자 타입으로 정규화한다.
- 답변용 근거는 테이블 조회와 RAG 청크 조회로 나눈다.
- 부분일치 검색과 임베딩 검색을 함께 쓸 수 있게 한다.

## 생성물
- `schema.sql`
  - Supabase에 넣을 테이블 구조
  - `vector` 임베딩 컬럼
  - `hnsw` 벡터 인덱스
  - `trgm` / `tsvector` 검색 인덱스
- `normalize_data.mjs`
  - 원본 CSV/JSON/MD를 읽어서 정규화된 CSV로 내보내는 스크립트
- `normalized/`
  - 정규화 결과 CSV 파일 출력 폴더

## Storage 규칙
- 버킷: `agent-uploads`
- 원본 경로 예시: `user_id/yyyymm/original_filename`
- 여기서 `yyyymm`은 업로드/적재 기준 월이다.

## 테이블 분리 원칙
- `rag.monthly_summary`
  - 월별 총괄 숫자
- `rag.main_fact`
  - 채널/대분류/중분류 팩트
- `rag.monthly_events`
  - 시책, 시장, 경쟁사, 운영 이슈
- `rag.special_products`
  - 신상품/중점상품
- `rag.channel_profile`
  - 채널 참조
- `rag.product_profile`
  - 상품 참조
- `rag.knowledge_chunks`
  - 답변용 RAG 청크

## 사용 순서
1. 원본 파일을 Storage에 보관한다.
2. `normalize_data.mjs`로 정규화 CSV를 만든다.
3. `schema.sql`을 Supabase에 적용한다.
4. `knowledge_chunks`에 청크와 임베딩을 넣는다.
5. 질문 시 부분일치 검색으로 후보를 찾고, 임베딩으로 재정렬한다.
