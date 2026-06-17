import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type AgentResponse } from "@/lib/agent";

type UnansweredRecord = {
  at: string;
  question: string;
  classification: AgentResponse["classification"];
  status: AgentResponse["status"];
  answer: string;
  evidence: string[];
  bucket: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "unanswered_questions.jsonl");
const REPORT_PATH = path.join(DATA_DIR, "unanswered_insights.md");

function normalize(input: string) {
  return input.replace(/\s+/g, "").toLowerCase();
}

function detectBucket(question: string) {
  const q = normalize(question);

  if (q.includes("보고서") || q.includes("보고문") || q.includes("마감") || q.includes("전망")) {
    return "보고/전망";
  }

  if (q.includes("오늘") || q.includes("일단위") || q.includes("영업일")) {
    return "일단위 추정";
  }

  if (q.includes("경쟁사") || q.includes("경쟁")) {
    return "경쟁사 비교";
  }

  if (q.includes("신상품") || q.includes("더퍼스트") || q.includes("플러스원") || q.includes("special")) {
    return "특수상품";
  }

  if (
    q.includes("채널") ||
    q.includes("fc") ||
    q.includes("gfc") ||
    q.includes("ga") ||
    q.includes("ba") ||
    q.includes("afc") ||
    q.includes("디지털") ||
    q.includes("신채널")
  ) {
    return "채널별 조회";
  }

  if (q.includes("추이") || q.includes("최근") || q.includes("인사이트")) {
    return "추이/인사이트";
  }

  if (q.includes("ms") || q.includes("m/s") || q.includes("점유율")) {
    return "M/S";
  }

  return "기타";
}

async function readRecords() {
  try {
    const raw = await readFile(LOG_PATH, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UnansweredRecord);
  } catch {
    return [];
  }
}

function buildReport(records: UnansweredRecord[]) {
  const byBucket = new Map<string, UnansweredRecord[]>();

  for (const record of records) {
    const list = byBucket.get(record.bucket) ?? [];
    list.push(record);
    byBucket.set(record.bucket, list);
  }

  const ranked = [...byBucket.entries()].sort((a, b) => b[1].length - a[1].length);
  const recent = records.slice(-8).reverse();

  const lines: string[] = [];
  lines.push("# 미답변 질문 백업 및 분석");
  lines.push("");
  lines.push(`- 누적 미답변 수: ${records.length}건`);
  lines.push(`- 최근 기록 시점: ${records.at(-1)?.at ?? "없음"}`);
  lines.push("");
  lines.push("## 실패 유형");

  if (ranked.length === 0) {
    lines.push("- 아직 기록이 없습니다.");
  } else {
    for (const [bucket, items] of ranked.slice(0, 6)) {
      lines.push(`- ${bucket}: ${items.length}건`);
    }
  }

  lines.push("");
  lines.push("## 대응책");
  const countermeasures = [
    ["보고/전망", "마감보고, 전망, 초안 문구는 섹션형 템플릿을 더 강하게 우선 적용하고, 전월비·전년동기비·실행전략을 기본 포함한다."],
    ["일단위 추정", "일평균 추정은 영업일수와 월초를 함께 계산하고, 월초 대비 일평균 환산 문구를 고정한다."],
    ["경쟁사 비교", "경쟁사 질문은 우리 전사 월초와 경쟁사 보장 월초를 동시에 보여주도록 우선 분기한다."],
    ["특수상품", "신상품·더퍼스트·플러스원은 별도 키워드와 구성명으로 분리해 집계한다."],
    ["채널별 조회", "채널 질문은 전사 합계뿐 아니라 채널별 총 월초와 보장/종신/건강 세부를 함께 반환한다."],
    ["추이/인사이트", "최근 추이 질문은 전사 기준과 상위/하위 채널을 함께 보여주도록 확장한다."],
    ["M/S", "시장점유율은 퍼센트 단위 보호와 전사 월초 동시 표시를 유지한다."],
    ["기타", "질문 분류 실패는 유사어 사전을 추가하고, 골든셋에 재학습 후보로 등록한다."],
  ] as const;

  for (const [bucket, text] of countermeasures) {
    lines.push(`- ${bucket}: ${text}`);
  }

  lines.push("");
  lines.push("## 최근 미답변 예시");
  if (recent.length === 0) {
    lines.push("- 없음");
  } else {
    for (const record of recent) {
      lines.push(`- [${record.bucket}] ${record.question}`);
    }
  }

  return lines.join("\n");
}

async function refreshReport() {
  const records = await readRecords();
  const report = buildReport(records);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(REPORT_PATH, report, "utf8");
}

export async function recordUnansweredQuestion(result: AgentResponse, question: string) {
  if (result.status === "ok" && result.classification !== "기타") {
    return;
  }

  const record: UnansweredRecord = {
    at: new Date().toISOString(),
    question,
    classification: result.classification,
    status: result.status,
    answer: result.answer,
    evidence: result.evidence,
    bucket: detectBucket(question),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  await refreshReport();
}

