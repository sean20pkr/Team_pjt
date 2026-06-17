import { readFileSync } from "node:fs";
import path from "node:path";

type GoldenSetEntry = {
  id: string;
  type: "normal" | "stretch" | "risk" | "forecast" | "reference";
  question: string;
  answer: string;
  keywords: string[];
};

type SearchHit = GoldenSetEntry & {
  score: number;
};

const ENTRIES: GoldenSetEntry[] = [
  { id: "1", type: "normal", question: "2026년 5월 전사 월초는 얼마야?", answer: "259.0", keywords: ["전사", "월초", "2026년 5월", "금액"] },
  { id: "2", type: "normal", question: "2026년 5월 전사 월초는 전월 대비 얼마나 변했어?", answer: "전월 263.7 대비 4.7 감소", keywords: ["전월 대비", "전사 월초", "감소"] },
  { id: "3", type: "normal", question: "2026년 5월 전사 월초는 전년동월 대비 얼마나 변했어?", answer: "전년동월 247.0 대비 12.0 증가", keywords: ["전년동월 대비", "전사 월초", "증가"] },
  { id: "4", type: "stretch", question: "2026년 5월 전사 물량에서 가장 큰 대분류는 뭐고, 이유를 한 줄로 설명해줘.", answer: "건강. 대분류 월초가 129.9로 가장 큼", keywords: ["대분류", "건강", "이유"] },
  { id: "5", type: "stretch", question: "2026년 5월 채널 중 가장 큰 채널은 뭐고, 월초는 얼마야?", answer: "FC, 147.0", keywords: ["채널", "FC", "월초"] },
  { id: "6", type: "stretch", question: "2026년 5월 전사 총계가 전월보다 줄어든 핵심 원인을 한 줄로 설명해줘.", answer: "신채널은 상담 진입은 쉬웠지만 전환이 늦어 확대가 제한됐을 가능성이 큼. 추가 확인 필요", keywords: ["전사 총계", "감소", "핵심 원인"] },
  { id: "7", type: "risk", question: "2026년 6월 전사 월초를 숫자로 확정할 수 있어?", answer: "확정할 수 없어. 2026-05까지만 실제 수치가 있고 2026-06 데이터가 없음", keywords: ["금액 위험", "확정", "전사 월초"] },
  { id: "8", type: "risk", question: "2026년 6월 판촉비총량을 숫자로 확정할 수 있어?", answer: "확정할 수 없어. 2026-06 계획값/배분 기준이 없어 숫자 단정 불가", keywords: ["판촉비총량", "확정", "금액 위험"] },
  { id: "F1", type: "forecast", question: "2026년 6월 전사 월초 전망의 중심값과 범위를 제시해줘.", answer: "보고 기준으로 현재 실제 데이터는 2026년 5월까지이며, 다음 달 전사 월초은 261.8 내외, 범위는 259.0~264.6 정도로 보는 편이 안전합니다.", keywords: ["전사 월초", "전망", "중심값", "범위"] },
  { id: "F2", type: "forecast", question: "2026년 6월 전사 월초 전망이 전월 대비 어느 방향인지 한 줄로 말해줘.", answer: "보고 관점에서 다음 달 전사 월초는 전월 대비 소폭 하락추세로 보는 편이 안전합니다.", keywords: ["전월 대비", "방향", "하락추세"] },
  { id: "F3", type: "forecast", question: "2026년 6월 채널별 방향성을 FC, GA, GFC 중심으로 요약해줘.", answer: "FC는 방어가 핵심이며 GA와 GFC는 비슷한 수준~약하락추세로 보는 편이 좋습니다.", keywords: ["FC", "GA", "GFC", "채널별 방향성"] },
  { id: "F4", type: "forecast", question: "2026년 6월 전사 전망에 가장 중요한 영향요인 3개를 우선순위로 말해줘.", answer: "FC 방어, 건강 경쟁 압박, 신채널 전환 속도 순입니다.", keywords: ["영향요인", "우선순위", "FC 방어"] },
  { id: "F5", type: "forecast", question: "2026년 6월 전사 전망이 상단/하단으로 흔들릴 수 있는 조건을 2개만 말해줘.", answer: "상단은 신채널 전환 개선, 하단은 건강 경쟁 재강화입니다.", keywords: ["상단", "하단", "조건"] },
  { id: "F6", type: "forecast", question: "2026년 6월 경쟁보험사 비교 관점에서 지금 보고에 넣을 한 줄을 써줘.", answer: "경쟁 압박은 남아 있으나 방어 여지는 있습니다.", keywords: ["경쟁보험사", "비교", "한 줄"] },
  { id: "F7", type: "forecast", question: "임원 보고용으로 바로 쓸 수 있는 1문장 초안을 써줘.", answer: "다음 달 전사 월초를 261.8 내외로 보고 FC 방어와 신채널 전환 개선을 병행하겠습니다.", keywords: ["임원 보고", "1문장", "초안"] },
  { id: "F8", type: "forecast", question: "2026년 6월 전사 월초를 숫자로 확정할 수 있어?", answer: "확정은 불가하지만, 보고용 추정 중심값은 261.8이며 범위는 259.0~264.6입니다.", keywords: ["확정", "숫자", "전사 월초"] },
];

let markdownEntriesCache: GoldenSetEntry[] | null = null;

function markdownGoldenSetPath() {
  return path.join(process.cwd(), "docs", "golden_set.md");
}

function parseGoldenMarkdownEntries(): GoldenSetEntry[] {
  const filePath = markdownGoldenSetPath();
  const content = readFileSync(filePath, "utf8");
  const sections = content.split(/^##\s+/m).filter(Boolean);
  const entries: GoldenSetEntry[] = [];

  for (const section of sections) {
    const lines = section.split(/\r?\n/).map((line) => line.trimEnd());
    const header = lines[0]?.trim() ?? "";
    const idMatch = header.match(/^([A-Z]\d{2})\.\s*(.+)$/);
    if (!idMatch) {
      continue;
    }

    const id = idMatch[1];
    const title = idMatch[2];
    const answerLine = lines.find((line) => line.startsWith("정답 요지:"));
    const answer = answerLine ? answerLine.replace(/^정답 요지:\s*/, "").trim() : title;
    const questionVariants: string[] = [];
    let inVariants = false;

    for (const line of lines.slice(1)) {
      if (line.startsWith("질문 변형:")) {
        inVariants = true;
        continue;
      }

      if (inVariants) {
        if (line.startsWith("## ")) {
          break;
        }

        if (line.startsWith("- ")) {
          questionVariants.push(line.replace(/^- /, "").trim());
        }
      }
    }

    const keywords = [
      id,
      title,
      ...questionVariants.slice(0, 2),
      answer,
    ];

    for (const [index, question] of questionVariants.entries()) {
      entries.push({
        id: `${id}-${index + 1}`,
        type: "reference",
        question,
        answer,
        keywords,
      });
    }
  }

  return entries;
}

function allEntries() {
  if (!markdownEntriesCache) {
    try {
      markdownEntriesCache = parseGoldenMarkdownEntries();
    } catch {
      markdownEntriesCache = [];
    }
  }

  return [...ENTRIES, ...markdownEntriesCache];
}

function normalize(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function makeBigrams(text: string) {
  const clean = normalize(text);
  const grams: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    grams.push(clean.slice(i, i + 2));
  }
  return grams;
}

function scoreEntry(query: string, entry: GoldenSetEntry) {
  const q = normalize(query);
  const question = normalize(entry.question);
  const keywordText = normalize(entry.keywords.join(" "));
  let score = 0;

  if (q === question) score += 120;
  if (q.includes(question) || question.includes(q)) score += 70;
  if (keywordText && q.includes(keywordText)) score += 30;

  for (const keyword of entry.keywords) {
    const k = normalize(keyword);
    if (k && q.includes(k)) score += 14;
  }

  const qGrams = new Set(makeBigrams(q));
  const eGrams = new Set(makeBigrams(question));
  let overlap = 0;
  for (const gram of qGrams) {
    if (eGrams.has(gram)) overlap += 1;
  }

  const union = qGrams.size + eGrams.size - overlap;
  if (union > 0) {
    score += Math.round((overlap / union) * 80);
  }

  return score;
}

export function searchGoldenSet(question: string): SearchHit | null {
  const normalized = normalize(question);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("골든셋")) {
    const forecast = ENTRIES.find((entry) => entry.id === "F1") ?? ENTRIES[0];
    return { ...forecast, score: 100 };
  }

  const ranked = allEntries()
    .map((entry) => ({ ...entry, score: scoreEntry(question, entry) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 20) {
    return null;
  }

  return best;
}

export function goldenSetEntries() {
  return allEntries().slice();
}
