"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { buildDashboardSnapshot, getDashboardMeta } from "@/lib/dashboard";

type ApiResponse = {
  classification: "조회" | "설명" | "전망·보고" | "기타";
  status: "ok" | "additional_check";
  answer: string;
  evidence: string[];
  error?: string;
};

const sampleQuestions = [
  "26년 6월 전사 및 채널별 건강 월초 전망을 알려줘.",
  "26년 6월에 보장월초 250억을 해야해. 전략을 짜줘.",
  "업적 인사이트 최근 3개월 채널별 업적 추이를 통한 강/약 분석을 남겨줘.",
  "2026년 5월 전사 물량에서 가장 큰 대분류는 뭐고, 이유를 한 줄로 설명해줘.",
  "2026년 5월 보고서 초안을 써줘.",
];

const weakPhrases = [
  "추가 확인 필요",
  "확정할 수 없어",
  "확정은 불가",
  "숫자 단정 불가",
  "소폭 하락추세",
  "하락추세",
  "감소",
  "줄어",
  "약하락추세",
  "약세",
  "위험",
  "지연",
  "압박",
  "불가",
];

const byulliCharacterSrc = "https://www.samsunglife.com/assets/img/img-brand-character03.59b6334c.png";

function highlightAnswer(text: string): ReactNode[] {
  const tokens: Array<{ text: string; kind: "blue" | "red" | "plain" }> = [];
  let cursor = 0;
  const combined = new RegExp(
    `${weakPhrases
      .sort((a, b) => b.length - a.length)
      .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")}|\\d+(?:\\.\\d+)?(?:~\\d+(?:\\.\\d+)?)?`,
    "g",
  );

  for (const match of text.matchAll(combined)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: text.slice(cursor, index), kind: "plain" });
    }

    const value = match[0];
    tokens.push({
      text: value,
      kind: weakPhrases.some((phrase) => value.includes(phrase)) ? "red" : "blue",
    });
    cursor = index + value.length;
  }

  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), kind: "plain" });
  }

  return tokens.map((token, index) => {
    if (token.kind === "blue") {
      return (
        <span key={`${token.text}-${index}`} className="font-semibold text-blue-700">
          {token.text}
        </span>
      );
    }

    if (token.kind === "red") {
      return (
        <span key={`${token.text}-${index}`} className="font-semibold text-rose-600">
          {token.text}
        </span>
      );
    }

    return <span key={`${token.text}-${index}`}>{token.text}</span>;
  });
}

function splitReportText(text: string) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？.!?])\s+|,\s*/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatCompactAmount(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}억`;
}

function formatDashboardIssue(text: string) {
  const value = String(text || "").trim();
  if (!value || value === "주요 이슈 없음") {
    return "주요 이슈 없음";
  }

  const normalized = value
    .replace(/약해졌다$/, "약해진")
    .replace(/강해졌다$/, "강해진")
    .replace(/늘었다$/, "늘어난")
    .replace(/줄었다$/, "줄어든")
    .replace(/상승했다$/, "상승한")
    .replace(/하락했다$/, "하락한")
    .replace(/개선되었다$/, "개선된")
    .replace(/악화되었다$/, "악화된")
    .replace(/미달했다$/, "미달한")
    .replace(/확인된다$/, "확인됩니다")
    .replace(/[.。!?]+$/g, "");

  return `보고 기준으로 ${normalized} 것으로 판단됩니다.`;
}

function normalizeAmountPostpositions(text: string) {
  return text.replace(/(\d+(?:\.\d+)?)억로/g, "$1억으로");
}

type NumericPoint = {
  label: string;
  raw: string;
  value: number;
  positive: boolean;
  category: string;
};

const dateLikeLinePatterns = [
  /\b\d{4}년\b/,
  /\b\d{4}년\s*\d{1,2}월\b/,
  /\b\d{4}-\d{2}(?:-\d{2})?\b/,
  /\b\d{1,2}월\s*(?:전망|보고|마감|초안|요약|정리|기준)\b/,
  /\b대상월\b/,
];

function isDateLikeLine(line: string) {
  return dateLikeLinePatterns.some((pattern) => pattern.test(line));
}

function scoreNumericLine(line: string, raw: string) {
  let score = 0;

  if (raw.includes("억")) score += 5;
  if (raw.includes("%")) score += 1;
  if (raw.includes("영업일")) score += 1;
  if (line.includes("전사")) score += 3;
  if (line.includes("채널")) score += 2;
  if (line.includes("월초")) score += 2;
  if (line.includes("업적")) score += 1;
  if (line.includes("평균")) score += 1;
  if (line.includes("상위")) score += 1;
  if (line.includes("합계")) score += 1;
  if (line.includes("범위")) score -= 1;
  if (line.includes("대상월")) score -= 4;
  if (line.includes("기준")) score -= 1;
  if (/\d{4}년/.test(line) || /\d{4}-\d{2}/.test(line)) score -= 4;
  if (raw.includes("%")) score -= 2;
  if (raw.includes("영업일")) score -= 1;

  return score;
}

function deriveNumericLabel(line: string, raw: string) {
  let label = normalizeAmountPostpositions(line);
  const rawIndex = label.indexOf(raw);

  if (rawIndex > 0) {
    label = label.slice(0, rawIndex);
  }

  label = label
    .replace(/(=|:|→|->|,|·)/g, " ")
    .replace(/최근\s*흐름이/g, "최근 흐름")
    .replace(/최근\s*3개월/g, "최근 3개월")
    .replace(/\s+/g, " ")
    .trim();

  if (!label) {
    label = line.trim();
  }

  if (label.length > 18) {
    label = `${label.slice(0, 18)}…`;
  }

  return label;
}

function categorizeNumericPoint(label: string, raw: string) {
  const text = `${label} ${raw}`;

  if (text.includes("전사") && text.includes("월초")) return "total";
  if (text.includes("채널") || /FC본부|전략본부|GA|GFC|BA|금융서비스|신채널사업단|AFC|디지털 사업부/.test(text)) {
    return "channel";
  }
  if (text.includes("건강")) return "health";
  if (text.includes("종신")) return "life";
  if (text.includes("보장")) return "guarantee";
  if (text.includes("Special_Product") || text.includes("신상품") || text.includes("더퍼스트") || text.includes("플러스원")) {
    return "special";
  }
  if (raw.includes("%")) return "ratio";
  if (raw.includes("영업일")) return "business-day";
  return "other";
}

function formatChannelMetricLabel(label: string) {
  const channelMatch = label.match(/(FC본부|전략본부|GA|GFC|BA|금융서비스|신채널사업단|AFC|디지털 사업부)/);
  if (!channelMatch) {
    return label;
  }

  const channel = channelMatch[1];
  if (label.includes("건강")) return `${channel} 건강월초`;
  if (label.includes("보장")) return `${channel} 보장월초`;
  if (label.includes("종신")) return `${channel} 종신월초`;
  if (label.includes("총") || label.includes("월초")) return `${channel} 총 월초`;
  return `${channel} 월초`;
}

function stripDateFragments(text: string) {
  return text
    .replace(/\b\d{4}년\s*\d{1,2}월\b/g, " ")
    .replace(/\b\d{4}년\b/g, " ")
    .replace(/\b\d{1,2}월\b/g, " ")
    .replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, " ")
    .replace(/\b\d{1,2}일\b/g, " ");
}

function isCountOnlyMatch(line: string, match: string) {
  if (/[.]/.test(match)) {
    return false;
  }

  if (/[억%영업일]/.test(match)) {
    return false;
  }

  return /(종|차|위|개|명|건|회|부|대|회차)/.test(line) && !/(전사|채널|건강|종신|보장|Special_Product|FC본부|전략본부|GA|GFC|BA|금융서비스|신채널사업단|AFC|디지털 사업부)/.test(line);
}

function isTotalOnlyQuestion(question: string) {
  const q = normalizeAmountPostpositions(question).replace(/\s+/g, "");
  return (
    q.includes("전사월초") ||
    (q.includes("전사") &&
      q.includes("월초") &&
      !q.includes("채널") &&
      !q.includes("fc") &&
      !q.includes("ga") &&
      !q.includes("gfc") &&
      !q.includes("ba") &&
      !q.includes("신채널") &&
      !q.includes("디지털") &&
      !q.includes("afc"))
  );
}

function extractNumericPoints(answer: string, evidence: string[], question = "") {
  const lines = [
    ...splitReportText(normalizeAmountPostpositions(answer)),
    ...(evidence ?? []).map((item) => normalizeAmountPostpositions(item)),
  ];
  const points: NumericPoint[] = [];
  const numericPattern = /-?\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?(?:억|%|영업일)?/g;
  const seen = new Set<string>();

  for (const line of lines) {
    if (isDateLikeLine(line)) {
      continue;
    }

    if (line.includes("~")) {
      continue;
    }

    const cleanedLine = stripDateFragments(line);
    const matches = cleanedLine.match(numericPattern) ?? [];
    for (const match of matches) {
      if (isCountOnlyMatch(cleanedLine, match)) {
        continue;
      }

      const value = Number.parseFloat(match.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(value)) {
        continue;
      }

      const key = `${cleanedLine}|${match}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      const label = formatChannelMetricLabel(deriveNumericLabel(cleanedLine, match));
      points.push({
        label,
        raw: match,
        value,
        positive: !cleanedLine.includes("감소") && !cleanedLine.includes("하락추세") && !cleanedLine.includes("약세") && value >= 0,
        category: categorizeNumericPoint(label, match),
      });
    }
  }

  const uniquePoints = points.filter((point, index, self) => self.findIndex((item) => item.raw === point.raw && item.category === point.category) === index);
  if (isTotalOnlyQuestion(question)) {
    const totalPoints = uniquePoints
      .filter((point) => point.category === "total" || point.label.includes("전사"))
      .sort((a, b) => scoreNumericLine(b.label, b.raw) - scoreNumericLine(a.label, a.raw));

    if (totalPoints.length > 0) {
      return totalPoints.slice(0, 3);
    }
  }

  const categoryOrder = ["total", "channel", "health", "life", "guarantee", "special", "ratio", "business-day", "other"];
  const bestByCategory = new Map<string, NumericPoint>();

  for (const point of uniquePoints) {
    const current = bestByCategory.get(point.category);
    if (!current) {
      bestByCategory.set(point.category, point);
      continue;
    }

    const currentScore = scoreNumericLine(current.label, current.raw);
    const nextScore = scoreNumericLine(point.label, point.raw);
    if (nextScore > currentScore) {
      bestByCategory.set(point.category, point);
    }
  }

  return categoryOrder
    .map((category) => bestByCategory.get(category))
    .filter((point): point is NumericPoint => Boolean(point))
    .sort((a, b) => scoreNumericLine(b.label, b.raw) - scoreNumericLine(a.label, a.raw))
    .slice(0, 3);
}

type DashboardCard = {
  channel: string;
  total: number;
  guarantee: number;
  life: number;
  health: number;
};

type DashboardGroup = {
  key: string;
  label: string;
  channels: string[];
  total: number;
  guarantee: number;
  life: number;
  health: number;
  cards: DashboardCard[];
};

function groupDashboardCards(cards: DashboardCard[]): DashboardGroup[] {
  const byChannel = new Map(cards.map((card) => [card.channel, card]));
  const groups = [
    { key: "fc", label: "FC본부", channels: ["FC"] },
    { key: "strategy", label: "전략본부", channels: ["GA", "GFC", "BA", "금융서비스", "신채널", "AFC"] },
    { key: "digital", label: "디지털 사업부", channels: ["디지털"] },
  ];

  return groups.map((group) => {
    const items = group.channels.map((channel) => byChannel.get(channel)).filter(Boolean) as DashboardCard[];
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const guarantee = items.reduce((sum, item) => sum + item.guarantee, 0);
    const life = items.reduce((sum, item) => sum + item.life, 0);
    const health = items.reduce((sum, item) => sum + item.health, 0);

    return {
      ...group,
      total,
      guarantee,
      life,
      health,
      cards: items,
    };
  });
}

function IconBadge({
  symbol,
  tone = "brand",
}: {
  symbol: string;
  tone?: "brand" | "cyan" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    brand: "border-blue-100 bg-white text-blue-700",
    cyan: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-blue-100 bg-blue-50 text-blue-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold leading-none ${toneClass}`}
    >
      {symbol}
    </span>
  );
}

export default function HomePage() {
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dashboardMeta = useMemo(() => getDashboardMeta(), []);
  const [dashboardYear, setDashboardYear] = useState(dashboardMeta.latestYear);
  const [dashboardMonth, setDashboardMonth] = useState(dashboardMeta.latestMonth);
  const dashboardMonths = dashboardMeta.monthsByYear[dashboardYear] ?? [];
  const dashboardMonthValue = dashboardMonths.includes(dashboardMonth)
    ? dashboardMonth
    : dashboardMonths.at(-1) ?? dashboardMeta.latestMonth;
  const dashboardSnapshot = useMemo(
    () => buildDashboardSnapshot(dashboardYear, dashboardMonthValue),
    [dashboardYear, dashboardMonthValue],
  );
  const dashboardGroups = useMemo(
    () => groupDashboardCards(dashboardSnapshot.cards as DashboardCard[]),
    [dashboardSnapshot.cards],
  );
  const answerChartPoints = useMemo(
    () => extractNumericPoints(error || result?.answer || "", result?.evidence ?? [], question),
    [error, question, result],
  );
  const infographicPoints = answerChartPoints;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(data.error ?? "질문을 처리하지 못했습니다.");
        setResult(null);
        return;
      }

      setResult(data);
    } catch {
      setError("서버와 통신하지 못했습니다.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-6 text-slate-900">
      <section className="relative overflow-hidden rounded-[24px] border border-blue-100 bg-white px-5 py-5 pb-10 shadow-[0_10px_30px_rgba(37,99,235,0.05)]">
        <div className="relative z-10 max-w-2xl space-y-4 pr-24 sm:pr-32">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs text-slate-600">
                <IconBadge symbol="↗" tone="slate" />
                보고형 조회 · 전망 보조
              </span>
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              <span className="block">삼성생명 채널 물량</span>
              <span className="block">인사이트 AI 에이전트</span>
            </h1>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 z-0 w-[98px] sm:bottom-4 sm:right-4 sm:w-[110px]">
          <div className="overflow-hidden rounded-[20px] border border-blue-100 bg-white/95 p-2 shadow-[0_8px_20px_rgba(37,99,235,0.08)]">
            <img
              src={byulliCharacterSrc}
              alt="삼성생명 브랜드 캐릭터 별리"
              className="block h-[76px] w-[220%] max-w-none translate-x-[-62%] object-cover object-[100%_center] sm:h-[82px]"
            />
          </div>
        </div>
      </section>

      <details open className="mt-6 rounded-[28px] border border-blue-100 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.05)]">
        <summary className="cursor-pointer list-none px-6 py-4 text-base font-semibold text-slate-900">
          대시보드
        </summary>
        <div className="border-t border-blue-100 px-6 pb-6 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {dashboardMeta.years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => {
                  const nextMonths = dashboardMeta.monthsByYear[year] ?? [];
                  setDashboardYear(year);
                  setDashboardMonth(nextMonths.at(-1) ?? dashboardMeta.latestMonth);
                }}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  dashboardYear === year
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-blue-100 bg-white text-slate-600 hover:border-blue-200 hover:text-slate-900"
                }`}
              >
                {year}년
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <span className="block text-xs text-slate-500">전사 총 월초</span>
              <span className="mt-2 block text-2xl font-semibold text-blue-700">{formatCompactAmount(dashboardSnapshot.total)}</span>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <span className="block text-xs text-slate-500">보장월초</span>
              <span className="mt-2 block text-2xl font-semibold text-blue-700">{formatCompactAmount(dashboardSnapshot.guaranteeTotal)}</span>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <span className="block text-xs text-slate-500">종신월초</span>
              <span className="mt-2 block text-2xl font-semibold text-blue-700">{formatCompactAmount(dashboardSnapshot.lifeTotal)}</span>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <span className="block text-xs text-slate-500">건강월초</span>
              <span className="mt-2 block text-2xl font-semibold text-blue-700">{formatCompactAmount(dashboardSnapshot.healthTotal)}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {dashboardMonths.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setDashboardMonth(month)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  dashboardMonthValue === month
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-blue-100 bg-white text-slate-500 hover:border-blue-200 hover:text-slate-900"
                }`}
              >
                {Number(month)}월
              </button>
            ))}
          </div>
          <div className="my-4 border-t border-blue-100" />
          <div className="mt-5 grid gap-3">
            {dashboardGroups.map((group) =>
              group.key === "strategy" ? (
                <details key={group.key} className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                        <span className="text-sm font-semibold text-blue-800">{formatCompactAmount(group.total)}</span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-blue-100 bg-white text-xs text-slate-600">
                        <div className="grid grid-cols-2 divide-x divide-y divide-blue-100">
                          <div className="p-3">
                            <span className="block text-slate-500">총 월초</span>
                            <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.total)}</span>
                          </div>
                          <div className="p-3">
                            <span className="block text-slate-500">보장월초</span>
                            <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.guarantee)}</span>
                          </div>
                          <div className="p-3">
                            <span className="block text-slate-500">종신월초</span>
                            <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.life)}</span>
                          </div>
                          <div className="p-3">
                            <span className="block text-slate-500">건강월초</span>
                            <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.health)}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs leading-5 text-blue-600">
                        GA + GFC + BA + 금융서비스 + 신채널 + AFC
                      </p>
                    </div>
                  </summary>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {group.cards.map((card) => (
                      <div key={card.channel} className="rounded-2xl border border-blue-100 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{card.channel}</p>
                          <span className="text-sm font-semibold text-blue-800">{formatCompactAmount(card.total)}</span>
                        </div>
                        <div className="mt-3 overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-xs text-slate-600">
                          <div className="grid grid-cols-2 divide-x divide-y divide-blue-100">
                            <div className="p-3">
                              <span className="block text-slate-500">총 월초</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(card.total)}</span>
                            </div>
                            <div className="p-3">
                              <span className="block text-slate-500">보장월초</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(card.guarantee)}</span>
                            </div>
                            <div className="p-3">
                              <span className="block text-slate-500">종신월초</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(card.life)}</span>
                            </div>
                            <div className="p-3">
                              <span className="block text-slate-500">건강월초</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(card.health)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <div key={group.key} className="rounded-2xl border border-blue-100 bg-white p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                      <span className="text-sm font-semibold text-blue-800">{formatCompactAmount(group.total)}</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50 text-xs text-slate-600">
                      <div className="grid grid-cols-2 divide-x divide-y divide-blue-100">
                        <div className="p-3">
                          <span className="block text-slate-500">총 월초</span>
                          <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.total)}</span>
                        </div>
                        <div className="p-3">
                          <span className="block text-slate-500">보장월초</span>
                          <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.guarantee)}</span>
                        </div>
                        <div className="p-3">
                          <span className="block text-slate-500">종신월초</span>
                          <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.life)}</span>
                        </div>
                        <div className="p-3">
                          <span className="block text-slate-500">건강월초</span>
                          <span className="mt-1 block text-sm font-semibold text-slate-900">{formatCompactAmount(group.health)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="my-4 border-t border-blue-100" />
          <p className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm leading-6 break-keep whitespace-normal text-slate-700">
            {formatDashboardIssue(dashboardSnapshot.issueLine)}
          </p>
        </div>
      </details>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_10px_30px_rgba(37,99,235,0.05)]">
          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <IconBadge symbol="⌁" />
              <span>입력</span>
            </h2>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm leading-6 text-slate-700">
            답변은 참고용으로 사용해주세요. 개인정보는 입력되지 않습니다.
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-3">
                <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
                  <IconBadge symbol="◉" />
                  <span>질문</span>
                </span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  className="min-h-40 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                placeholder="26년 6월 전사 및 채널별 건강 월초 전망을 알려줘."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {sampleQuestions.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setQuestion(sample)}
                  className="max-w-full rounded-full border border-blue-100 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900"
                >
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-100 bg-white text-[10px] font-bold text-blue-700">◌</span>
                  {sample}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "답변 생성 중..." : "실행"}
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <article className="rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_10px_30px_rgba(37,99,235,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-blue-800">
                  <IconBadge symbol="↗" />
                  <span>응답 본문</span>
                </p>
                <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <IconBadge symbol="▣" tone="cyan" />
                  <span>답변</span>
                </h3>
              </div>
              <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    result?.status === "additional_check"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-blue-50 text-blue-800"
                  }`}
              >
                {result?.status === "additional_check" ? "추가 확인 필요" : "정상"}
              </span>
            </div>

            {result && infographicPoints.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-[32px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-[0_14px_35px_rgba(37,99,235,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-800">데이터 인포그래픽</p>
                </div>
                  <p className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">답변 요약 시각화</p>
                </div>
                <div className="mt-5 flex justify-center">
                  <div className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-white shadow-[0_18px_40px_rgba(37,99,235,0.08)]">
                    {(() => {
                      const slices = infographicPoints.slice(0, 3);
                      const total = Math.max(slices.reduce((sum, item) => sum + Math.abs(item.value), 0), 1);
                      const palette = ["#1d4ed8", "#0ea5e9", "#38bdf8"];
                      let start = 0;
                      const arcs = slices.map((point, index) => {
                        const size = Math.max(8, (Math.abs(point.value) / total) * 360);
                        const end = start + size;
                        const color = palette[index % palette.length];
                        const arc = `${color} ${start}deg ${end}deg`;
                        start = end;
                        return arc;
                      });
                      return (
                        <>
                          <div
                            className="absolute inset-6 rounded-full"
                            style={{
                              background: `conic-gradient(${arcs.join(", ")})`,
                              WebkitMask: "radial-gradient(circle, transparent 57%, #000 58%)",
                              mask: "radial-gradient(circle, transparent 57%, #000 58%)",
                            }}
                            aria-hidden="true"
                          />
                          <div className="absolute inset-[78px] rounded-full border border-blue-100 bg-slate-50" aria-hidden="true" />
                          <div className="relative z-10 flex w-full flex-col gap-1.5 px-6 text-center overflow-hidden">
                            {slices.map((point, index) => (
                              <div key={`${point.raw}-${point.label}`} className="min-w-0 leading-tight">
                                <p
                                  className="mt-0.5 text-[clamp(15px,3.8vw,21px)] font-semibold leading-none tracking-tight whitespace-nowrap overflow-hidden text-ellipsis"
                                  style={{ color: ["#1d4ed8", "#0ea5e9", "#38bdf8"][index % 3] }}
                                >
                                  {point.raw}
                                </p>
                                <p className="mt-0.5 overflow-hidden text-[10px] leading-[1.25] text-slate-600 break-keep whitespace-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                  {point.label}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : result ? (
              <div className="mt-5 rounded-2xl border border-dashed border-blue-100 bg-blue-50/40 p-4 text-sm text-slate-500">
                답변에 표시할 숫자가 부족합니다.
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-blue-100 bg-blue-50/40 p-4 text-sm text-slate-500">
                질문을 실행하면 답변에 맞는 인포그래픽이 표시됩니다.
              </div>
            )}

            <div className="mt-5 max-w-3xl rounded-2xl border border-blue-100 bg-blue-50/40 p-4 text-sm leading-8 text-slate-800">
              <div className="space-y-2 whitespace-normal break-keep">
                {splitReportText(normalizeAmountPostpositions(error || result?.answer || "질문을 넣으면 답변이 여기에 표시됩니다.")).map((line, index) => (
                  <p key={`${line}-${index}`}>{highlightAnswer(line)}</p>
                ))}
              </div>
            </div>

            <details className="mt-5 rounded-2xl border border-blue-100 bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-bold text-blue-700">▣</span>
                근거와 시사점은 펼쳐서 확인합니다.
              </summary>
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {(result?.evidence ?? [
                    "질의 이해: 부분일치 우선",
                    "질의 재정렬: 임베딩 고려",
                    "답변 생성: mock 데이터 근거",
                  ]).map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 text-sm leading-6 text-slate-700"
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white p-4 text-sm leading-7 text-slate-700">
                  {result?.status === "additional_check"
                    ? "시사점: 추정 수치와 근거는 참고용이며, 최종 보고 전 담당자 검토가 필요합니다."
                    : "시사점: 조회 결과는 보고 초안의 기초 자료로 바로 활용할 수 있습니다."}
                </div>
              </div>
            </details>
          </article>
        </section>
      </div>
    </div>
  );
}
