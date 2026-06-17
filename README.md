# Channel Volume Insight AI Docs

이 저장소는 채널물량 인사이트 AI 에이전트의 기획 문서 4종과 실제 배포 화면을 함께 정리한 문서 저장소입니다.

## Live Demo

- 배포 웹링크: [https://team-pjt.vercel.app](https://team-pjt.vercel.app)

## Product Overview

삼성생명 채널 물량 인사이트 AI 에이전트는 Supabase의 mock 데이터를 조회하고 BizRouter LLM으로 답변을 생성하는 보조형 업무 에이전트입니다.
- 대시보드에서 최신 월 기준 전사 및 채널별 주요 물량을 확인합니다.
- 하나의 입력창으로 조회, 전망, 보고 초안을 처리합니다.
- 답변은 보고형 문장으로 제공하고, 근거와 시사점을 함께 확인합니다.
- 개인정보로 보일 수 있는 입력은 차단하고, 사람 검토를 전제로 운영합니다.

## Documents

| 문서 | 설명 |
|---|---|
| [PRD.md](./PRD.md) | 제품 방향, 범위, 입력 데이터, 출력 구조, HITL 원칙을 담은 기준 문서 |
| [AGENTS.md](./AGENTS.md) | 에이전트 역할, 핵심 기능, 승인 기준, 운영 원칙 요약 |
| [customer.md](./customer.md) | 사용자 장면, JTBD, 기대 가치, 신뢰 조건 정리 |
| [architecture.md](./architecture.md) | 입력 → 해석 → 전망 → 보고초안 흐름과 도구 구조 요약 |

## Recommended Reading Order

1. [PRD.md](./PRD.md)
2. [AGENTS.md](./AGENTS.md)
3. [customer.md](./customer.md)
4. [architecture.md](./architecture.md)

## Notes

- GitHub 첫 화면에서 바로 4개 문서를 열 수 있도록 `customer.md`, `architecture.md`도 저장소 루트에 배치했다.
- 문서 간 기준 용어와 방향성은 `PRD.md`를 우선 기준으로 맞춘다.
