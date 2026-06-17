import { getMockBundle, toNumber, toText } from "@/lib/mock-data";
import { searchGoldenSet } from "@/lib/golden-set-search";

type ResponseStatus = "ok" | "additional_check";

export type AgentResponse = {
  classification: "조회" | "설명" | "전망·보고" | "기타";
  status: ResponseStatus;
  answer: string;
  evidence: string[];
};

type MonthKey = string;
type ForecastMetric = "월초" | "판촉비총량" | "시장전체" | "경쟁사보장월초" | "M/S";

function normalize(input: string) {
  return input.replace(/\s+/g, "").toLowerCase();
}

function monthKey(year: string | number, month: string | number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: string | number, month: string | number) {
  return `${year}년 ${Number(month)}월`;
}

function parseQuestionYear(question: string) {
  const fourDigitMatch = question.match(/(\d{4})년/);
  if (fourDigitMatch) {
    return fourDigitMatch[1];
  }

  const twoDigitMatch = question.match(/(\d{2})년/);
  if (twoDigitMatch) {
    return String(2000 + Number(twoDigitMatch[1]));
  }

  return null;
}

function latestYear() {
  const latest = latestSummary();
  return latest ? toText(latest.연도) : String(new Date().getFullYear());
}

function resolveRelativeYear(question: string) {
  const baseYear = Number(latestYear());
  if (Number.isNaN(baseYear)) {
    return null;
  }

  if (question.includes("작년")) {
    return String(baseYear - 1);
  }

  if (question.includes("재작년")) {
    return String(baseYear - 2);
  }

  if (question.includes("올해")) {
    return String(baseYear);
  }

  return null;
}

function parseMonthFromQuestion(question: string) {
  const year = parseQuestionYear(question);
  const monthMatch = question.match(/(\d{1,2})월/);

  if (year && monthMatch) {
    return {
      year,
      month: String(Number(monthMatch[1])).padStart(2, "0"),
    };
  }

  const relativeYear = resolveRelativeYear(question);
  const relativeMonth = question.match(/(1[0-2]|0?[1-9])월/);
  if (relativeYear && relativeMonth) {
    return {
      year: relativeYear,
      month: String(Number(relativeMonth[1])).padStart(2, "0"),
    };
  }

  return null;
}

function latestSummary() {
  const { monthly_summary } = getMockBundle();
  return [...monthly_summary].sort((a, b) => {
    const ay = toNumber(a.연도);
    const by = toNumber(b.연도);
    if (ay !== by) {
      return ay - by;
    }

    return toNumber(a.월) - toNumber(b.월);
  }).at(-1);
}

function recentSummaries(count = 3) {
  const { monthly_summary } = getMockBundle();
  return [...monthly_summary]
    .sort((a, b) => {
      const ay = toNumber(a.연도);
      const by = toNumber(b.연도);
      if (ay !== by) {
        return ay - by;
      }

      return toNumber(a.월) - toNumber(b.월);
    })
    .slice(-count);
}

function summaryFor(year: string, month: string) {
  return getMockBundle().monthly_summary.find(
    (row) => toText(row.연도) === year && toText(row.월).padStart(2, "0") === month,
  );
}

function eventsFor(year: string, month: string) {
  return getMockBundle().monthly_events.filter(
    (row) => toText(row.연도) === year && toText(row.월).padStart(2, "0") === month,
  );
}

function summaryMetricValue(row: Record<string, unknown>, metric: ForecastMetric) {
  const key: Record<ForecastMetric, string> = {
    월초: "월초",
    판촉비총량: "판촉비총량",
    시장전체: "시장전체",
    경쟁사보장월초: "경쟁사보장월초",
    "M/S": "M/S",
  };

  return toNumber(row[key[metric] as keyof typeof row] as string | number | undefined);
}

function aggregateMainFact(year: string, month: string) {
  const totalsByChannel = new Map<string, number>();
  const totalsByCategory = new Map<string, number>();

  for (const row of getMockBundle().main_fact) {
    if (toText(row.연도) !== year || toText(row.월).padStart(2, "0") !== month) {
      continue;
    }

    const channel = toText(row.채널);
    const category = toText(row.대분류);
    const amount = toNumber(row.금액);

    totalsByChannel.set(channel, (totalsByChannel.get(channel) ?? 0) + amount);
    totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + amount);
  }

  return {
    totalsByChannel,
    totalsByCategory,
  };
}

function cumulativeChannelTotal(year: string, month: string, channel: string) {
  return getMockBundle().main_fact
    .filter(
      (row) =>
        toText(row.연도) === year &&
        Number(toText(row.월)) <= Number(month) &&
        toText(row.채널) === channel,
    )
    .reduce((sum, row) => sum + toNumber(row.금액), 0);
}

function specialProductsTotal(year: string, month: string) {
  const rows = getMockBundle().special_products.filter(
    (row) =>
      toText(row.연도) === year &&
      toText(row.월).padStart(2, "0") === month &&
      toText(row.본표포함여부).toUpperCase() === "Y",
  );

  const total = rows.reduce((sum, row) => sum + toNumber(row.월초), 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, row) => {
    const category = toText(row.대분류);
    acc[category] = (acc[category] ?? 0) + toNumber(row.월초);
    return acc;
  }, {});

  return { total, byCategory };
}

type SpecialProductGroup = "신상품" | "더퍼스트" | "플러스원";

function inferSpecialProductGroup(question: string): SpecialProductGroup | null {
  const q = normalize(question);

  if (q.includes("더퍼스트")) {
    return "더퍼스트";
  }

  if (q.includes("플러스원")) {
    return "플러스원";
  }

  if (q.includes("신상품") || q.includes("중점상품") || q.includes("특수상품") || q.includes("specialproduct") || q.includes("specialproducts")) {
    return "신상품";
  }

  return null;
}

function specialProductGroupRows(year: string, month: string, group: SpecialProductGroup) {
  const keywordMap: Record<SpecialProductGroup, string> = {
    신상품: "가칭신상품",
    더퍼스트: "더퍼스트",
    플러스원: "플러스원",
  };

  const keyword = keywordMap[group];
  return getMockBundle().special_products.filter(
    (row) =>
      toText(row.연도) === year &&
      toText(row.월).padStart(2, "0") === month &&
      toText(row.본표포함여부).toUpperCase() === "Y" &&
      toText(row.상품명).includes(keyword),
  );
}

function specialProductGroupTotal(year: string, month: string, group: SpecialProductGroup) {
  const rows = specialProductGroupRows(year, month, group);
  const total = rows.reduce((sum, row) => sum + toNumber(row.월초), 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, row) => {
    const category = toText(row.대분류);
    acc[category] = (acc[category] ?? 0) + toNumber(row.월초);
    return acc;
  }, {});

  return { total, byCategory };
}

function specialProductsThreeText(year: string, month: string) {
  const groups: Array<SpecialProductGroup> = ["신상품", "더퍼스트", "플러스원"];
  const totals = groups.map((group) => {
    const { total } = specialProductGroupTotal(year, month, group);
    return { group, total };
  });

  return {
    total: totals.reduce((sum, item) => sum + item.total, 0),
    text: totals.map((item) => `${item.group} ${item.total.toFixed(1)}억`).join(", "),
    evidence: totals.map((item) => `${item.group} = ${item.total.toFixed(1)}억`),
  };
}

function specialProductGroupTrend(group: SpecialProductGroup, year: string, month: string, count = 3) {
  const keywordMap: Record<SpecialProductGroup, string> = {
    신상품: "가칭신상품",
    더퍼스트: "더퍼스트",
    플러스원: "플러스원",
  };

  const keyword = keywordMap[group];
  const summaries = recentSummaries(24)
    .filter((row) => {
      const rowYear = toText(row.연도);
      const rowMonth = String(toText(row.월)).padStart(2, "0");
      if (Number(rowYear) < Number(year)) {
        return true;
      }
      if (Number(rowYear) > Number(year)) {
        return false;
      }
      return Number(rowMonth) <= Number(month);
    })
    .slice(-count);

  return summaries.map((row) => {
    const rowYear = toText(row.연도);
    const rowMonth = String(toText(row.월)).padStart(2, "0");
    const rows = getMockBundle().special_products.filter(
      (item) =>
        toText(item.연도) === rowYear &&
        toText(item.월).padStart(2, "0") === rowMonth &&
        toText(item.본표포함여부).toUpperCase() === "Y" &&
        toText(item.상품명).includes(keyword),
    );
    const total = rows.reduce((sum, item) => sum + toNumber(item.월초), 0);
    return {
      year: rowYear,
      month: rowMonth,
      total,
    };
  });
}

function specialProductsTrend(year: string, month: string, count = 3) {
  const summaries = recentSummaries(24)
    .filter((row) => {
      const rowYear = toText(row.연도);
      const rowMonth = String(toText(row.월)).padStart(2, "0");
      if (Number(rowYear) < Number(year)) {
        return true;
      }
      if (Number(rowYear) > Number(year)) {
        return false;
      }
      return Number(rowMonth) <= Number(month);
    })
    .slice(-count);

  return summaries.map((row) => {
    const rowYear = toText(row.연도);
    const rowMonth = String(toText(row.월)).padStart(2, "0");
    const { total } = specialProductsTotal(rowYear, rowMonth);
    return {
      year: rowYear,
      month: rowMonth,
      total,
    };
  });
}

function productNameTrend(productKeyword: string, year?: string, month?: string, count = 3) {
  const allRows = getMockBundle().special_products.filter((row) =>
    toText(row.상품명).includes(productKeyword),
  );

  if (allRows.length === 0) {
    return [];
  }

  const grouped = new Map<string, number>();
  for (const row of allRows) {
    const rowYear = toText(row.연도);
    const rowMonth = String(toText(row.월)).padStart(2, "0");
    const key = monthKey(rowYear, rowMonth);
    const amount = toNumber(row.월초);

    if (year && month) {
      if (Number(rowYear) > Number(year) || (Number(rowYear) === Number(year) && Number(rowMonth) > Number(month))) {
        continue;
      }
    }

    grouped.set(key, (grouped.get(key) ?? 0) + amount);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-count)
    .map(([key, total]) => {
      const [rowYear, rowMonth] = key.split("-");
      return {
        year: rowYear,
        month: rowMonth,
        total,
      };
    });
}

function appendGoldenReference(result: AgentResponse, hit: ReturnType<typeof searchGoldenSet> | null): AgentResponse {
  return {
    ...result,
  };
}

function buildTrendChannelContext(year: string, month: string) {
  const totalsByChannel = aggregateMainFact(year, month).totalsByChannel;
  const ranked = [...totalsByChannel.entries()]
    .filter(([channel]) => toText(channel) !== "BA")
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return null;
  }

  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const topShare = total > 0 ? (top[1] / total) * 100 : 0;
  const bottomShare = total > 0 ? (bottom[1] / total) * 100 : 0;

  return {
    summaryLine:
      `전사 기준으로는 ${monthLabel(year, month)} 총 월초가 ${toNumber(summaryFor(year, month)?.월초).toFixed(1)}억이고, ` +
      `가장 큰 비중은 ${top[0]} ${top[1].toFixed(1)}억(${topShare.toFixed(1)}%), ` +
      `가장 낮은 채널(BA 제외)은 ${bottom[0]} ${bottom[1].toFixed(1)}억(${bottomShare.toFixed(1)}%)입니다.`,
    evidence: [
      `channel_top=${top[0]} ${top[1].toFixed(1)} (${topShare.toFixed(1)}%)`,
      `channel_bottom=${bottom[0]} ${bottom[1].toFixed(1)} (${bottomShare.toFixed(1)}%)`,
      `channel_total=${total.toFixed(1)}`,
    ],
  };
}

function formatSignedDelta(delta: number) {
  return `${Math.abs(delta).toFixed(1)} ${delta >= 0 ? "증가" : "감소"}`;
}

function actionFromDirection(
  direction: number,
  positive: string,
  negative: string,
  neutral: string,
) {
  if (direction > 0) {
    return positive;
  }

  if (direction < 0) {
    return negative;
  }

  return neutral;
}

function formatRange(center: number, spread = 3) {
  const lower = Math.max(0, center - spread);
  const upper = center + spread;
  return {
    center: Number(center.toFixed(1)),
    lower: Number(lower.toFixed(1)),
    upper: Number(upper.toFixed(1)),
  };
}

function formatMetricLabel(metric: ForecastMetric) {
  switch (metric) {
    case "월초":
      return "전사 월초";
    case "판촉비총량":
      return "판촉비 총량";
    case "시장전체":
      return "시장 전체 규모";
    case "경쟁사보장월초":
      return "경쟁사 보장 월초";
    case "M/S":
      return "시장점유율(M/S)";
  }
}

function detectForecastMetric(question: string): ForecastMetric {
  const q = normalize(question);

  if (q.includes("판촉비")) {
    return "판촉비총량";
  }

  if (q.includes("시장전체") || (q.includes("시장") && q.includes("규모"))) {
    return "시장전체";
  }

  if (q.includes("경쟁사보장")) {
    return "경쟁사보장월초";
  }

  if (q.includes("m/s") || q.includes("ms") || q.includes("점유율")) {
    return "M/S";
  }

  return "월초";
}

function buildForecastRationale(
  metric: ForecastMetric,
  recent: ReturnType<typeof recentSummaries>,
  average: number,
  latestEventText?: string,
) {
  if (recent.length === 0) {
    return {
      basis: [],
      text: "추정 근거는 최근 데이터가 부족해 평균 중심으로만 잡았습니다.",
    };
  }

  const recentValues = recent.map((row) => summaryMetricValue(row, metric));
  const labels = recent.map((row) => `${toText(row.연도)}-${String(toText(row.월)).padStart(2, "0")}`);
  const trend = recentValues.length >= 2 ? recentValues[recentValues.length - 1] - recentValues[0] : 0;

  const basis = [
    `최근 3개월 ${formatMetricLabel(metric)}(${labels.join(" / ")}) 평균이 ${average.toFixed(1)}로 중심값을 잡기 좋습니다.`,
    `최근 흐름이 ${recentValues.map((value) => value.toFixed(1)).join(" -> ")}로 크게 꺾이지 않았습니다.`,
  ];

  if (latestEventText) {
    basis.push(latestEventText);
  }

  if (trend !== 0) {
    basis.push(`3개월 누적 방향은 ${trend >= 0 ? "소폭 상승추세" : "소폭 하락추세"}입니다.`);
  }

  return {
    basis,
    text: `추정 근거는 ${basis.join(" ")}`,
  };
}

function buildForecastActionInsight(metric: ForecastMetric, forecast: { center: number; lower: number; upper: number }) {
  const rangeText = `${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}`;
  switch (metric) {
    case "월초":
      return `실행전략은 ${rangeText} 범위의 안정 흐름을 강점으로 유지하면서, 약점인 신채널 전환 지연과 건강 경쟁 압박을 줄이기 위해 FC 방어와 신채널 전환 개선에 우선순위를 두는 편이 좋습니다.`;
    case "판촉비총량":
      return `실행전략은 ${rangeText} 범위의 판촉비 강점을 유지하되, 약점인 집행 대비 효율 저하를 막기 위해 FC·신채널처럼 전환이 잘 나는 구간에 집중 배분하고 월중 점검을 촘촘히 하는 방식이 적절합니다.`;
    case "시장전체":
      return `실행전략은 ${rangeText} 범위의 시장 전체 흐름을 활용해 강점은 방어하고, 약점인 변동성은 경쟁사·시장 이슈 점검으로 줄이면서 전환률이 높은 채널에 대응 자원을 먼저 배치하는 편이 좋습니다.`;
    case "경쟁사보장월초":
      return `실행전략은 ${rangeText} 범위의 경쟁사 보장 물량 압박을 전제로, 우리 강점 채널의 방어력을 유지하고 약점인 가격·전환 경쟁 구간을 보완하기 위해 비교 견적 대응과 설명 품질 점검을 먼저 강화하는 쪽이 맞습니다.`;
    case "M/S":
      return `실행전략은 ${rangeText} 범위의 점유율 강세를 유지하되, 약점인 하락 리스크를 줄이기 위해 전환 속도와 재접촉 관리에 집중하고, 경쟁이 강한 구간은 즉시 보완하는 운영이 필요합니다.`;
  }
}

function buildForecastDirectionAnswer() {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const recent = recentSummaries(2);
  if (recent.length < 2) {
    return null;
  }

  const latestValue = toNumber(recent[1].월초);
  const prevValue = toNumber(recent[0].월초);
  const delta = latestValue - prevValue;
  const direction = delta >= 0 ? "소폭 상승추세" : "소폭 하락추세";
  const action = delta >= 0
    ? "상승추세이므로 전환 가속과 건강 경쟁 대응을 강화하는 편이 좋습니다."
    : "하락추세이므로 FC 방어와 저전환 구간 재점검을 우선하는 편이 좋습니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `보고 관점에서 다음 달 전사 월초는 전월 대비 ${direction}으로 보는 편이 안전합니다. ` +
      `최근 흐름이 ${prevValue.toFixed(1)} -> ${latestValue.toFixed(1)}로 움직였고, 현재는 방어와 보완을 함께 가져가는 구성이 적절합니다. ${action}`,
    evidence: [
      `최근 2개월 전사 월초 = ${prevValue.toFixed(1)} -> ${latestValue.toFixed(1)}`,
      `전월 대비 변화 = ${delta.toFixed(1)}`,
      "전망 방향은 최근 흐름과 이벤트를 함께 반영",
    ],
  };
}

function buildForecastChannelAnswer() {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const year = toText(latest.연도);
  const month = String(toText(latest.월)).padStart(2, "0");
  const { totalsByChannel } = aggregateMainFact(year, month);
  const topEntries = sortEntriesDesc(totalsByChannel).slice(0, 3);
  const topChannel = topEntries[0];
  if (!topChannel) {
    return null;
  }

  const text = topEntries.map(([channel, value]) => `${channel} ${value.toFixed(1)}`).join(", ");
  const action =
    topChannel[0] === "FC"
      ? "FC는 방어가 핵심이므로 재접촉과 유지율 관리가 우선입니다."
      : topChannel[0] === "GA"
        ? "GA는 설명 품질과 대형 건 관리가 핵심이므로 상담 표준화가 중요합니다."
        : "신채널 비중이 커서 전환 속도와 비교 견적 대응을 먼저 점검하는 편이 좋습니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `${monthLabel(year, month)} 채널별 방향성은 상위 채널 중심으로 방어와 보완을 나누어 보는 편이 좋습니다. ` +
      `현재 상위 채널은 ${text}이며, 특히 ${topChannel[0]}의 흐름이 전체 방향을 좌우합니다. ${action}`,
    evidence: [
      `${monthKey(year, month)} 채널 상위 3개 = ${text}`,
      "채널별 방향성은 상위 채널 방어와 신채널 전환 개선을 함께 검토",
    ],
  };
}

function buildChannelBreakdownAnswer(question: string) {
  const month = parseMonthFromQuestion(question);
  if (!month) {
    return null;
  }

  const totalsByChannel = aggregateMainFact(month.year, month.month).totalsByChannel;
  const ranked = sortEntriesDesc(totalsByChannel);
  if (ranked.length === 0) {
    return null;
  }

  const topText = ranked.slice(0, 5).map(([channel, value]) => `${channel} ${value.toFixed(1)}`).join(", ");
  const summaryText = ranked.map(([channel, value]) => `${channel} ${value.toFixed(1)}`).join(" / ");

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(month.year, month.month)} 전사 물량을 채널별로 보면 ${topText} 순입니다. ` +
      `가장 큰 채널은 ${ranked[0][0]}이며, 채널별 흐름은 방어 채널과 보완 채널을 나누어 보는 편이 좋습니다.`,
    evidence: [
      `${monthKey(month.year, month.month)} 채널 합계 = ${summaryText}`,
      `최대 채널 = ${ranked[0][0]} ${ranked[0][1].toFixed(1)}`,
    ],
  };
}

function buildChannelCategoryAnswer(question: string) {
  const month = parseMonthFromQuestion(question);
  if (!month) {
    return null;
  }

  const q = normalize(question);
  const channelMap: Array<[string, string, string[]]> = [
    ["FC", "FC본부", ["fc본부", "fc"]],
    ["GA", "GA사업부", ["ga사업부", "ga"]],
    ["GFC", "GFC사업부", ["gfc사업부", "gfc"]],
    ["BA", "BA사업부", ["ba사업부", "ba"]],
    ["신채널", "신채널사업단", ["신채널사업단", "신채널"]],
    ["디지털", "디지털사업부", ["디지털사업부", "디지털"]],
    ["AFC", "AFC영업단", ["afc영업단", "afc"]],
  ];

  const categoryMap: Array<[string, string, string[]]> = [
    ["순수형", "순수형 건강", ["순수형건강", "건강_순수형", "건강순수형", "순수형 건강", "순수형"]],
    ["건강", "건강월초", ["건강월초", "건강"]],
    ["종신", "종신월초", ["종신월초", "종신"]],
    ["연금", "연금월초", ["연금월초", "연금"]],
    ["보장", "보장월초", ["보장월초", "보장"]],
    ["저축", "저축세부", ["저축", "저축월초"]],
  ];

  const channel = channelMap.find(([, , aliases]) => aliases.some((alias) => q.includes(alias)))?.[0];
  const category = categoryMap.find(([, , aliases]) => aliases.some((alias) => q.includes(alias)))?.[0];
  const categoryLabel = categoryMap.find(([key]) => key === category)?.[1];

  if (!channel || !category || !categoryLabel) {
    return null;
  }

  const rows = getMockBundle().main_fact.filter((row) => {
    const isPureHealth = category === "순수형";
    return (
      toText(row.연도) === month.year &&
      toText(row.월).padStart(2, "0") === month.month &&
      toText(row.채널) === channel &&
      (isPureHealth
        ? toText(row.대분류) === "건강" && toText(row.중분류) === "순수형"
        : toText(row.대분류) === category)
    );
  });

  if (rows.length === 0) {
    return null;
  }

  const total = rows.reduce((sum, row) => sum + toNumber(row.금액), 0);
  const subRows = rows
    .map((row) => `${toText(row.중분류)} ${toNumber(row.금액).toFixed(1)}`)
    .join(", ");

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(month.year, month.month)} ${channel} ${categoryLabel}는 ${total.toFixed(1)}입니다. ` +
      `세부 구성은 ${subRows}입니다.`,
    evidence: [
      `${monthKey(month.year, month.month)} ${channel} ${categoryLabel} 합계 = ${total.toFixed(1)}`,
      subRows,
    ],
  };
}

function buildAfcPerformanceAnswer(question: string) {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const latestYearValue = toText(latest.연도);
  const latestMonth = String(toText(latest.월)).padStart(2, "0");
  const q = normalize(question);
  const channel = "AFC";

  if (!q.includes("afc")) {
    return null;
  }

  const currentYtd = cumulativeChannelTotal(latestYearValue, latestMonth, channel);
  const previousYear = String(Number(latestYearValue) - 1);
  const previousYtd = cumulativeChannelTotal(previousYear, latestMonth, channel);
  const delta = currentYtd - previousYtd;
  const direction =
    delta > 0
      ? "전년동기보다 소폭 상승추세로 보고해도 무리가 없습니다."
      : delta < 0
        ? "전년동기보다 약세로 보이며 보완이 필요한 구간입니다."
        : "전년동기와 비슷한 수준으로 보는 편이 좋습니다.";

  const latestMonthValue = aggregateMainFact(latestYearValue, latestMonth).totalsByChannel.get(channel) ?? 0;
  const latestEvent = eventsFor(latestYearValue, latestMonth)[0];

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${latestYearValue}년 현재 AFC 채널은 올해 누계가 ${currentYtd.toFixed(1)}이며, 전년동기 ${previousYtd.toFixed(1)} 대비 ${Math.abs(delta).toFixed(1)} ${delta >= 0 ? "증가" : "감소"}했습니다. ` +
      `${direction} 최근 월(${monthLabel(latestYearValue, latestMonth)}) AFC 월초는 ${latestMonthValue.toFixed(1)}이며, ${latestEvent ? toText(latestEvent.시나리오) : "별도 이벤트는 크지 않아"} 월중 방어를 함께 보는 편이 좋습니다.`,
    evidence: [
      `${latestYearValue} 누계 AFC = ${currentYtd.toFixed(1)}`,
      `${previousYear} 동기 AFC = ${previousYtd.toFixed(1)}`,
      `${monthKey(latestYearValue, latestMonth)} AFC 월초 = ${latestMonthValue.toFixed(1)}`,
    ],
  };
}

function buildForecastFactorAnswer() {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const year = toText(latest.연도);
  const month = String(toText(latest.월)).padStart(2, "0");
  const events = eventsFor(year, month);
  const event = events.at(0);
  const factors = [
    "FC 방어",
    "건강 경쟁 압박",
    "신채널 전환 속도",
  ];

  const action =
    "실행전략은 FC 유지, 건강 경쟁 대응, 신채널 전환 개선을 순서대로 관리하고, 월중 점검은 전환율과 비교 견적 수요에 맞추는 편이 좋습니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `전사 전망의 핵심 영향요인은 ${factors.join(", ")} 순으로 보는 편이 안전합니다. ` +
      `최근 대/내외 이슈 기준으로는 ${event ? toText(event.시나리오) : "별도 이슈가 약해"} 방향성이 확인되며, 강점은 방어력, 약점은 전환 속도입니다. ${action}`,
    evidence: [
      `핵심 영향요인 = ${factors.join(" / ")}`,
      event ? `대/내외 이슈 = ${toText(event.시나리오)}` : "대/내외 이슈 없음",
    ],
  };
}

function buildForecastConditionAnswer() {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const year = toText(latest.연도);
  const month = String(toText(latest.월)).padStart(2, "0");
  const recent = recentSummaries(3).map((row) => toNumber(row.월초));
  const avg = recent.reduce((sum, value) => sum + value, 0) / recent.length;

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `${monthLabel(year, month)} 전사 전망은 상단과 하단이 모두 열려 있지만, 상단은 신채널 전환 개선과 비교 견적 회복이 필요하고, ` +
      `하단은 건강 경쟁 재강화와 전환 지연 확대가 발생할 때 흔들릴 수 있습니다. 최근 평균은 ${avg.toFixed(1)}로 안정적이어서 운영 품질이 관건입니다. ` +
      "실행전략은 상단 조건은 전환 개선으로 키우고, 하단 조건은 경쟁 대응과 방어 프로세스로 줄이는 방식이 적절합니다.",
    evidence: [
      `최근 3개월 평균 = ${avg.toFixed(1)}`,
      "상단 조건 = 신채널 전환 개선 / 비교 견적 회복",
      "하단 조건 = 건강 경쟁 재강화 / 전환 지연 확대",
    ],
  };
}

function buildForecastCompetitionAnswer() {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const year = toText(latest.연도);
  const month = String(toText(latest.월)).padStart(2, "0");
  const competitor = toNumber(latest.경쟁사보장월초);
  const current = toNumber(latest.월초);
  const gap = current - competitor;
  const action =
    gap >= 0
      ? "경쟁 압박은 남아 있으나 방어력 차이가 크지 않으므로 비교 견적 대응을 강화하면 방어 여지가 있습니다."
      : "경쟁사 대비 열위라면 가격보다 설명 품질과 전환 속도 개선을 우선하는 편이 좋습니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `${monthLabel(year, month)} 경쟁보험사 비교에서는 우리의 전사 월초 ${current.toFixed(1)}와 경쟁사 보장 월초 ${competitor.toFixed(1)}의 차이를 함께 봐야 합니다. ` +
      `현재 격차는 ${gap.toFixed(1)}이며, 경쟁 압박은 남아 있지만 방어 여지는 있습니다. ${action}`,
    evidence: [
      `${monthKey(year, month)} 전사 월초 = ${current.toFixed(1)}`,
      `${monthKey(year, month)} 경쟁사 보장 월초 = ${competitor.toFixed(1)}`,
      `격차 = ${gap.toFixed(1)}`,
    ],
  };
}

function buildRecentCompetitorPerformanceAnswer(question: string) {
  const q = normalize(question);
  if (!(q.includes("최근") && (q.includes("경쟁사") || q.includes("경쟁")))) {
    return null;
  }

  if (!(q.includes("업적") || q.includes("보장월초") || q.includes("물량") || q.includes("월초"))) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const competitorSeries = recent.map((row) => toNumber(row.경쟁사보장월초));
  const oursSeries = recent.map((row) => toNumber(row.월초));
  const competitorDelta = competitorSeries[competitorSeries.length - 1] - competitorSeries[0];
  const oursDelta = oursSeries[oursSeries.length - 1] - oursSeries[0];
  const competitorDirection = competitorDelta > 0 ? "상승추세" : competitorDelta < 0 ? "하락추세" : "비슷한 수준";
  const oursDirection = oursDelta > 0 ? "상승추세" : oursDelta < 0 ? "하락추세" : "비슷한 수준";
  const competitorText = recent
    .map((row, index) => `${monthLabel(row.연도, row.월)} ${competitorSeries[index].toFixed(1)}억`)
    .join(" -> ");
  const oursText = recent
    .map((row, index) => `${monthLabel(row.연도, row.월)} ${oursSeries[index].toFixed(1)}억`)
    .join(" -> ");
  const latestLabel = monthLabel(latest.연도, latest.월);

  const comparison =
    competitorSeries[competitorSeries.length - 1] > oursSeries[oursSeries.length - 1]
      ? "최근 월 기준으로는 경쟁사가 우리보다 우위입니다."
      : competitorSeries[competitorSeries.length - 1] < oursSeries[oursSeries.length - 1]
        ? "최근 월 기준으로는 우리는 경쟁사보다 우위입니다."
        : "최근 월 기준으로는 양쪽이 비슷합니다.";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `최근 3개월 경쟁사 보장 월초는 ${competitorText}입니다. ` +
      `전사 월초는 ${oursText}이며, 경쟁사 보장 월초는 ${competitorDirection}, 전사 월초는 ${oursDirection} 흐름입니다. ` +
      `${latestLabel} 기준 경쟁사 보장 월초는 ${competitorSeries.at(-1)?.toFixed(1)}억이고, ${comparison} ` +
      "경쟁사 보장 월초가 올라가면 우리 전사 월초 방어 압박이 커질 수 있으므로, 경쟁사 흐름과 우리의 방어 효율을 같이 보는 편이 좋습니다.",
    evidence: [
      `competitor_series=${competitorText}`,
      `ours_series=${oursText}`,
      `competitor_direction=${competitorDirection}`,
      `ours_direction=${oursDirection}`,
    ],
  };
}

function buildCompetitorBetterMonthsAnswer() {
  const rows = [...getMockBundle().monthly_summary]
    .sort((a, b) => {
      const ay = toNumber(a.연도);
      const by = toNumber(b.연도);
      if (ay !== by) {
        return ay - by;
      }
      return toNumber(a.월) - toNumber(b.월);
    })
    .map((row) => {
      const year = toText(row.연도);
      const month = String(toText(row.월)).padStart(2, "0");
      const ours = toNumber(row.월초);
      const competitor = toNumber(row.경쟁사보장월초);
      return {
        year,
        month,
        ours,
        competitor,
        gap: competitor - ours,
      };
    })
    .filter((row) => row.gap > 0);

  if (rows.length === 0) {
    return {
      classification: "조회" as const,
      status: "ok" as const,
      answer:
        "mock 데이터 기준으로 경쟁사 보장 월초가 우리 전사 월초를 앞선 달은 없습니다. 모든 월에서 우리는 경쟁사 대비 전사 월초가 우위입니다.",
      evidence: ["competitor_wins=0"],
    };
  }

  const recent = rows.slice(-6);
  const recentText = recent
    .map((row) => `${monthLabel(row.year, row.month)}(${row.gap.toFixed(1)}억 열위)`)
    .join(", ");
  const first = rows[0];
  const last = rows.at(-1)!;

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `mock 데이터 기준으로 경쟁사가 우리보다 잘한 달은 총 ${rows.length}개월입니다. ` +
      `시작은 ${monthLabel(first.year, first.month)}이고, 최근 사례는 ${recentText}입니다. ` +
      `가장 최근 경쟁사 우위 달은 ${monthLabel(last.year, last.month)}이며, 그때 격차는 ${last.gap.toFixed(1)}억입니다. ` +
      "전사 월초와 경쟁사 보장 월초를 함께 보되, 역전된 달은 경쟁 대응과 방어 효율 보완 포인트로 보는 편이 좋습니다.",
    evidence: [
      `competitor_wins=${rows.length}`,
      `first=${monthKey(first.year, first.month)} gap=${first.gap.toFixed(1)}`,
      `last=${monthKey(last.year, last.month)} gap=${last.gap.toFixed(1)}`,
    ],
  };
}

function buildForecastReportDraftAnswer(question: string) {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const normalizedQuestion = normalize(question);
  const compactStyle =
    normalizedQuestion.includes("보고문") ||
    normalizedQuestion.includes("보고서초안") ||
    normalizedQuestion.includes("보고용으로");

  const targetMonth = parseMonthFromQuestion(question);
  if (targetMonth) {
    const requested = summaryFor(targetMonth.year, targetMonth.month);
    if (!requested) {
      return {
        classification: "전망·보고" as const,
        status: "additional_check" as const,
        answer:
          `요청하신 ${monthLabel(targetMonth.year, targetMonth.month)} 보고 초안은, 현재 마감 데이터가 없어 작성이 어렵습니다. ` +
          `최신 데이터는 ${monthLabel(latest.연도, latest.월)} 기준입니다.`,
        evidence: [
          `요청 월 데이터 없음: ${monthKey(targetMonth.year, targetMonth.month)}`,
          `최신 데이터 기준: ${monthKey(latest.연도, latest.월)}`,
        ],
      };
    }
  }

  const reportRow = targetMonth
    ? summaryFor(targetMonth.year, targetMonth.month) ?? latest
    : latest;
  const reportYear = toText(reportRow.연도);
  const reportMonth = String(toText(reportRow.월)).padStart(2, "0");
  const reportLabel = monthLabel(reportYear, reportMonth);
  const previousMonth = reportMonth === "01" ? "12" : String(Number(reportMonth) - 1).padStart(2, "0");
  const previousYear = reportMonth === "01" ? String(Number(reportYear) - 1) : reportYear;
  const previousLabel = monthLabel(previousYear, previousMonth);
  const previousRow = summaryFor(previousYear, previousMonth);
  const previousTotal = previousRow ? toNumber(previousRow.월초) : null;
  const currentTotal = toNumber(reportRow.월초);
  const yoyRow = summaryFor(String(Number(reportYear) - 1), reportMonth);
  const yoyDelta = yoyRow ? currentTotal - toNumber(yoyRow.월초) : null;
  const currentMarket = toNumber(reportRow.시장전체);
  const currentCompetitor = toNumber(reportRow.경쟁사보장월초);
  const currentPromo = toNumber(reportRow.판촉비총량);
  const specialProductSummary = specialProductsThreeText(reportYear, reportMonth);
  const currentChannelRank = sortEntriesDesc(aggregateMainFact(reportYear, reportMonth).totalsByChannel).slice(0, 4);
  const currentEvent = eventsFor(reportYear, reportMonth)[0];
  const currentProductSummary = {
    total: toNumber(reportRow.월초),
    guarantee: toNumber(reportRow.보장월초),
    health: toNumber(reportRow.건강월초),
    pureHealth: toNumber(reportRow.건강_순수형),
    refundHealth: toNumber(reportRow.건강_환급형),
    specialHealth: toNumber(reportRow.건강_특화형),
    life: toNumber(reportRow.종신월초),
  };

  const recent = recentSummaries(3);
  const average = recent.map((row) => toNumber(row.월초)).reduce((sum, value) => sum + value, 0) / recent.length;
  const forecast = formatRange(average, 3.6);
  const nextMonthNumber = Number(reportMonth) === 12 ? 1 : Number(reportMonth) + 1;
  const nextYearLabel = Number(reportMonth) === 12 ? String(Number(reportYear) + 1) : reportYear;
  const nextMonthLabel = monthLabel(nextYearLabel, String(nextMonthNumber).padStart(2, "0"));
  const deltaText = previousTotal === null ? "전월 비교 불가" : `${previousLabel} 대비 ${formatSignedDelta(currentTotal - previousTotal)}`;
  const rankText = currentChannelRank.map(([channel, value]) => `${channel} ${value.toFixed(1)}`).join(", ");
  const eventText = currentEvent ? `당월 이슈로는 ${toText(currentEvent.시나리오)}가 확인됩니다.` : "당월 특이 이벤트는 제한적입니다.";
  const summaryLine = `${reportLabel} 기준 전사 월초 ${currentProductSummary.total.toFixed(1)}억, ${deltaText}${yoyDelta === null ? "" : `, 전년동기 대비 ${formatSignedDelta(yoyDelta)}`}`;
  const volumeLine = `보장월초 ${currentProductSummary.guarantee.toFixed(1)}억, 건강월초 ${currentProductSummary.health.toFixed(1)}억, 종신월초 ${currentProductSummary.life.toFixed(1)}억, 순수형 건강 ${currentProductSummary.pureHealth.toFixed(1)}억, 환급형 건강 ${currentProductSummary.refundHealth.toFixed(1)}억, 특화형 건강 ${currentProductSummary.specialHealth.toFixed(1)}억`;
  const efficiencyLine = `시장 전체 ${currentMarket.toFixed(1)}억, M/S ${toNumber(reportRow.M_S ?? reportRow["M/S"] ?? 0).toFixed(1)}%, 경쟁사 보장 월초 ${currentCompetitor.toFixed(1)}억, 판촉비 총량 ${currentPromo.toFixed(1)}억, 영업일수 ${toNumber(reportRow.영업일수).toFixed(0)}영업일`;
  const specialLine = `Special_Product ${specialProductSummary.total.toFixed(1)}억이며, 구성은 ${specialProductSummary.text}입니다.`;
  const currentMood =
    yoyDelta === null
      ? "전년동기 비교는 데이터 범위상 제한적입니다."
      : yoyDelta >= 0
        ? "전년동기보다 우상향 흐름입니다."
        : "전년동기보다 약세 흐름입니다.";
  const nextOutlook =
    forecast.center >= currentTotal
      ? `${nextMonthLabel} 전사 월초는 ${forecast.center.toFixed(1)}억 내외, ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}억 범위로 보는 편이 안전합니다. 비슷한 수준 속 상승추세를 열어둘 수 있습니다.`
      : `${nextMonthLabel} 전사 월초는 ${forecast.center.toFixed(1)}억 내외, ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}억 범위로 보는 편이 안전합니다. 비슷한 수준 속 하락추세 가능성도 함께 열어두는 편이 좋습니다.`;
  const strategyLine =
    "FC는 재접촉과 유지율 방어를 우선 점검하고, 건강월초는 핵심 담보 설명과 비교 견적 대응을 강화하는 편이 좋습니다. " +
    "신채널은 상담 진입 이후 이탈 관리와 전환 속도 개선에 집중하고, 판촉비는 효율이 높은 구간에 우선 배분하는 방식이 적절합니다. " +
    "Special_Product는 신상품/더퍼스트/플러스원 20년납 3종을 분리 관리하고, 월중에는 채널별 전환 품질을 같이 확인하는 편이 좋습니다.";
  const compactAnswer =
    `${reportLabel} 보고문 초안은 다음과 같이 정리할 수 있습니다. ` +
    `${summaryLine}. ${currentMood} ` +
    `${volumeLine}. ${specialSummaryLineForCompact(specialProductSummary)} ` +
    `다음달은 ${nextMonthLabel} 전사 월초 ${forecast.center.toFixed(1)}억 내외, ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}억 범위로 보고, FC 방어·건강 전환·신채널 이탈 관리·Special_Product 신상품/더퍼스트/플러스원 20년납 3종 분리를 우선하겠습니다.`;

  const detailedAnswer =
    `${reportLabel} 마감 보고 초안을 정리하면 다음과 같습니다.\n\n` +
    `[현재 현황]\n` +
    `- ${summaryLine}입니다. ${currentMood}\n` +
    `- ${volumeLine}으로 구성됩니다.\n` +
    `- ${specialLine}입니다.\n` +
    `- 채널별로는 ${rankText} 순이며, 현재 가장 큰 채널은 ${currentChannelRank[0]?.[0] ?? "미확인"}입니다. ${eventText}\n\n` +
    `[물량]\n` +
    `- 전사 월초 ${currentProductSummary.total.toFixed(1)}억을 중심으로, 보장월초와 건강월초가 핵심 축입니다.\n` +
    `- 건강 내부에서는 순수형 ${currentProductSummary.pureHealth.toFixed(1)}억, 환급형 ${currentProductSummary.refundHealth.toFixed(1)}억, 특화형 ${currentProductSummary.specialHealth.toFixed(1)}억으로 나뉘며, 순수형 건강 흐름이 가장 민감한 관찰 포인트입니다.\n\n` +
    `[영업효율]\n` +
    `- ${efficiencyLine}입니다.\n` +
    `- 경쟁사 보장 월초와 판촉비 총량을 함께 보면, 단순 물량 확대보다 방어 효율과 전환 품질이 더 중요한 구간으로 판단됩니다.\n\n` +
    `[다음달 전망]\n` +
    `- ${nextOutlook}\n` +
    `- 최근 3개월 평균이 ${average.toFixed(1)}억으로 중심값을 잡기 좋고, 최근 흐름이 크게 꺾이지 않아 방어와 반등을 함께 검토할 수 있습니다.\n\n` +
    `[필요 추진전략]\n` +
    `- ${strategyLine}\n` +
    `- 조직/해지/지급률 항목은 현재 mock에 직접 수치가 없으므로, 실제 보고용으로는 별도 데이터 확인 후 보완하는 구성이 안전합니다.`;

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer: compactStyle ? compactAnswer : detailedAnswer,
    evidence: [
      `${reportLabel} 전사 월초 = ${currentProductSummary.total.toFixed(1)}`,
      `전월 대비 = ${deltaText}`,
      yoyDelta === null ? "전년동기 대비 = 비교 불가" : `전년동기 대비 = ${formatSignedDelta(yoyDelta)}`,
      `보장월초 = ${currentProductSummary.guarantee.toFixed(1)}`,
      `건강월초 = ${currentProductSummary.health.toFixed(1)}`,
      `M/S = ${toNumber(reportRow.M_S ?? reportRow["M/S"] ?? 0).toFixed(1)}%`,
      specialLine,
      `${nextMonthLabel} 전망 = ${forecast.center.toFixed(1)} / ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}`,
      `상위 채널 = ${rankText}`,
    ],
  };
}

function parseTargetGuaranteeFromQuestion(question: string) {
  const matches = [...question.matchAll(/(\d+(?:\.\d+)?)\s*억/g)].map((match) => Number(match[1])).filter((value) => Number.isFinite(value) && value > 0);
  if (matches.length > 0) {
    return matches[matches.length - 1];
  }

  return 250;
}

function buildGuaranteeTargetStrategyAnswer(question: string) {
  const target = parseTargetGuaranteeFromQuestion(question);
  const rows = [...getMockBundle().monthly_summary]
    .map((row) => {
      const year = toText(row.연도);
      const month = String(toText(row.월)).padStart(2, "0");
      const guarantee = toNumber(row.보장월초);
      return {
        year,
        month,
        guarantee,
        promo: toNumber(row.판촉비총량),
        total: toNumber(row.월초),
        row,
      };
    })
    .filter((row) => Number.isFinite(row.guarantee))
    .sort((a, b) => Math.abs(a.guarantee - target) - Math.abs(b.guarantee - target));

  const closest = rows[0];
  if (!closest) {
    return null;
  }

  const factor = target / Math.max(closest.guarantee, 0.1);
  const scaledPromo = closest.promo * factor;
  const { totalsByChannel } = aggregateMainFact(closest.year, closest.month);
  const channelLines = sortEntriesDesc(totalsByChannel)
    .map(([channel, value]) => `${channel} ${value.toFixed(1)}억`)
    .join(", ");
  const scaledChannels = sortEntriesDesc(totalsByChannel)
    .map(([channel, value]) => `${channel} ${ (value * factor).toFixed(1) }억`)
    .join(", ");
  const channelArray = sortEntriesDesc(totalsByChannel);
  const topChannel = channelArray[0];
  const bottomChannel = channelArray.at(-1);

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `보장월초 ${target.toFixed(1)}억에 가장 가까운 달은 ${monthLabel(closest.year, closest.month)}이며, 당시 보장월초는 ${closest.guarantee.toFixed(1)}억, 전사 월초는 ${closest.total.toFixed(1)}억, 판촉비 총량은 ${closest.promo.toFixed(1)}억입니다. ` +
      `이 달을 기준으로 보면 FC본부 방어와 건강 전환이 핵심이었고, 채널별 실제 물량은 ${channelLines} 순이었습니다. ` +
      `보장월초 250억을 목표로 같은 믹스를 가져간다면 판촉비는 약 ${scaledPromo.toFixed(1)}억, 채널별 목표 물량은 ${scaledChannels} 수준으로 보는 편이 현실적입니다. ` +
      `실행 우선순위는 ${topChannel ? `${topChannel[0]} 방어` : "상위 채널 방어"}와 ${bottomChannel ? `${bottomChannel[0]} 보완` : "하위 채널 보완"}을 같이 두고, 전사 기준으로는 건강 전환과 FC 유지율을 먼저 점검하는 편이 좋습니다.`,
    evidence: [
      `closest_month=${monthKey(closest.year, closest.month)}`,
      `closest_guarantee=${closest.guarantee.toFixed(1)}`,
      `closest_total=${closest.total.toFixed(1)}`,
      `closest_promo=${closest.promo.toFixed(1)}`,
      `scaled_promo=${scaledPromo.toFixed(1)}`,
      `channels=${channelLines}`,
    ],
  };
}

function specialSummaryLineForCompact(specialProductSummary: { total: number; text: string }) {
  const pieces = specialProductSummary.text
    .split(", ")
    .map((item) => item.trim())
    .filter(Boolean);
  return `Special_Product ${specialProductSummary.total.toFixed(1)}억은 ${pieces.join(", ")}로 분리됩니다.`;
}

function buildSalesStatusAnswer(question: string) {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const targetMonth = parseMonthFromQuestion(question);
  const monthRow = targetMonth
    ? summaryFor(targetMonth.year, targetMonth.month)
    : latest;
  if (!monthRow) {
    return null;
  }

  const year = toText(monthRow.연도);
  const month = String(toText(monthRow.월)).padStart(2, "0");
  const reportLabel = monthLabel(year, month);
  const previousMonth = month === "01" ? "12" : String(Number(month) - 1).padStart(2, "0");
  const previousYear = month === "01" ? String(Number(year) - 1) : year;
  const previousRow = summaryFor(previousYear, previousMonth);
  const previousTotal = previousRow ? toNumber(previousRow.월초) : null;
  const yoyRow = summaryFor(String(Number(year) - 1), month);
  const total = toNumber(monthRow.월초);
  const guarantee = toNumber(monthRow.보장월초);
  const health = toNumber(monthRow.건강월초);
  const life = toNumber(monthRow.종신월초);
  const pureHealth = toNumber(monthRow.건강_순수형);
  const refundHealth = toNumber(monthRow.건강_환급형);
  const specialHealth = toNumber(monthRow.건강_특화형);
  const specialProductSummary = specialProductsThreeText(year, month);
  const currentChannelRank = sortEntriesDesc(aggregateMainFact(year, month).totalsByChannel).slice(0, 3);
  const deltaText = previousTotal === null ? "전월 비교 불가" : `${formatSignedDelta(total - previousTotal)}`;
  const yoyText = yoyRow ? formatSignedDelta(total - toNumber(yoyRow.월초)) : "비교 불가";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${reportLabel} 영업현황은 전사 월초 ${total.toFixed(1)}억, 보장월초 ${guarantee.toFixed(1)}억, 건강월초 ${health.toFixed(1)}억, 종신월초 ${life.toFixed(1)}억입니다. ` +
      `전월 대비 ${deltaText}이고, 전년동기 대비 ${yoyText}입니다. ` +
      `건강 내부는 순수형 ${pureHealth.toFixed(1)}억, 환급형 ${refundHealth.toFixed(1)}억, 특화형 ${specialHealth.toFixed(1)}억으로 나뉘며, 채널은 ${currentChannelRank.map(([channel, value]) => `${channel} ${value.toFixed(1)}억`).join(", ")} 순입니다. ` +
      `Special_Product는 신상품 ${specialProductSummary.text.split(", ").find((item) => item.startsWith("신상품"))?.replace("신상품 ", "") ?? "0.0억"}, 더퍼스트 ${specialProductSummary.text.split(", ").find((item) => item.startsWith("더퍼스트"))?.replace("더퍼스트 ", "") ?? "0.0억"}, 플러스원 ${specialProductSummary.text.split(", ").find((item) => item.startsWith("플러스원"))?.replace("플러스원 ", "") ?? "0.0억"}으로 구분됩니다.`,
    evidence: [
      `${reportLabel} 전사 월초 = ${total.toFixed(1)}`,
      `전월 대비 = ${deltaText}`,
      yoyRow ? `전년동기 대비 = ${yoyText}` : "전년동기 대비 = 비교 불가",
      `보장월초 = ${guarantee.toFixed(1)}`,
      `건강월초 = ${health.toFixed(1)}`,
      specialProductSummary.text,
    ],
  };
}

function buildHealthForecastAnswer(question: string) {
  const targetMonth = parseMonthFromQuestion(question);
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const targetYear = targetMonth?.year ?? toText(latest.연도);
  const targetMonthValue = targetMonth?.month ?? String(Number(toText(latest.월)) + 1).padStart(2, "0");
  const targetLabel = monthLabel(targetYear, targetMonthValue);
  const targetKey = monthKey(targetYear, targetMonthValue);
  const previousMonths = recentSummaries(3);

  if (previousMonths.length === 0) {
    return null;
  }

  const totalHistory = previousMonths.map((row) => toNumber(row.건강월초));
  const totalAverage = totalHistory.reduce((sum, value) => sum + value, 0) / totalHistory.length;
  const totalForecast = formatRange(totalAverage, 2.4);

  const channels = [...new Set(getMockBundle().main_fact.map((row) => toText(row.채널)))];
  const channelForecasts = channels
    .map((channel) => {
      const history = previousMonths.map((row) => {
        const year = toText(row.연도);
        const month = String(toText(row.월)).padStart(2, "0");
        return getMockBundle().main_fact
          .filter(
            (fact) =>
              toText(fact.연도) === year &&
              String(toText(fact.월)).padStart(2, "0") === month &&
              toText(fact.채널) === channel &&
              toText(fact.대분류) === "건강",
          )
          .reduce((sum, fact) => sum + toNumber(fact.금액), 0);
      });

      const average = history.reduce((sum, value) => sum + value, 0) / history.length;
      const spread = Math.max(0.8, average * 0.08, 0.5);
      const forecast = formatRange(average, spread);
      return {
        channel,
        forecast,
        average,
      };
    })
    .sort((a, b) => b.average - a.average)
    .slice(0, 5);

  const topChannel = channelForecasts[0];
  if (!topChannel) {
    return null;
  }

  const topShare = totalAverage > 0 ? (topChannel.average / totalAverage) * 100 : 0;

  const channelLines = channelForecasts
    .map(
      ({ channel, forecast }) =>
        `${channel} ${forecast.center.toFixed(1)} (${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)})`,
    )
    .join(", ");

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `${targetLabel} 전사 건강월초는 ${totalForecast.center.toFixed(1)} 내외, ${totalForecast.lower.toFixed(1)}~${totalForecast.upper.toFixed(1)} 범위로 보는 편이 안전합니다. ` +
      `채널별 건강 전망은 ${channelLines} 순으로 보며, 가장 큰 비중은 ${topChannel.channel}입니다(${topShare.toFixed(1)}%). 건강월초는 전사 방향을 끌고 가는 핵심 축이므로, 방어와 전환 보완을 같이 가져가는 구성이 좋습니다.`,
    evidence: [
      `대상월 = ${targetKey}`,
      `전사 건강 평균 = ${totalAverage.toFixed(1)}`,
      `채널 건강 상위 = ${channelLines}`,
    ],
  };
}

function sortEntriesDesc(map: Map<string, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function buildLatestSummaryAnswer() {
  const row = latestSummary();
  if (!row) {
    return null;
  }

  const current = toNumber(row.월초);
  const previousMonth = String(Math.max(1, toNumber(row.월) - 1)).padStart(2, "0");
  const previous = summaryFor(toText(row.연도), previousMonth);
  const deltaText = previous ? formatSignedDelta(current - toNumber(previous.월초)) : "전월 비교 불가";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(row.연도, row.월)} 전사 월초는 ${current.toFixed(1)}입니다. ` +
      `전월 흐름은 ${deltaText}이며, 실무 보고에는 방어 기조와 보완 포인트를 함께 적는 편이 좋습니다.`,
    evidence: [
      `${monthKey(row.연도, row.월)} 월초 = ${current.toFixed(1)}`,
      previous ? `${monthKey(row.연도, previousMonth)} 월초 = ${toNumber(previous.월초).toFixed(1)}` : "전월 데이터 없음",
    ],
  };
}

function buildPreviousMonthBusinessDaysAnswer(question: string) {
  const q = normalize(question);
  if (!(q.includes("지난달") || q.includes("전월") || q.includes("직전월") || q.includes("지난월"))) {
    return null;
  }

  if (!q.includes("영업일")) {
    return null;
  }

  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const latestYear = toText(latest.연도);
  const latestMonth = String(toText(latest.월)).padStart(2, "0");
  const previousMonth = latestMonth === "01" ? "12" : String(Number(latestMonth) - 1).padStart(2, "0");
  const previousYear = latestMonth === "01" ? String(Number(latestYear) - 1) : latestYear;
  const previous = summaryFor(previousYear, previousMonth);

  if (!previous) {
    return null;
  }

  const previousBusinessDays = Math.max(1, toNumber(previous.영업일수 ?? previous.business_days));

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `지난달(${monthLabel(previousYear, previousMonth)}) 영업일수는 ${previousBusinessDays}영업일입니다. ` +
      `최신 데이터 기준으로는 ${monthLabel(latestYear, latestMonth)}가 가장 최근 마감입니다.`,
    evidence: [
      `${monthKey(previousYear, previousMonth)} 영업일수 = ${previousBusinessDays}영업일`,
      `최신 기준월 = ${monthKey(latestYear, latestMonth)}`,
    ],
  };
}

function buildRecentThreeYearMinBusinessDaysAnswer(question: string) {
  const q = normalize(question);
  if (!(q.includes("최근") && q.includes("3년") && q.includes("영업일"))) {
    return null;
  }

  const wantsMax = q.includes("많았") || q.includes("가장많") || q.includes("제일많") || q.includes("최대");
  const wantsMin = q.includes("적") || q.includes("가장적") || q.includes("제일적") || q.includes("최소") || q.includes("적었던");
  if (!wantsMax && !wantsMin) {
    return null;
  }

  const latest = latestSummary();
  const recent = recentSummaries(36);
  if (!latest || recent.length === 0) {
    return null;
  }

  const scored = recent.map((row) => {
    const businessDays = Math.max(1, toNumber(row.영업일수 ?? row.business_days));
    return {
      row,
      businessDays,
      key: monthKey(row.연도, row.월),
    };
  });

  const targetBusinessDays = wantsMax
    ? Math.max(...scored.map((item) => item.businessDays))
    : Math.min(...scored.map((item) => item.businessDays));
  const targetRows = scored.filter((item) => item.businessDays === targetBusinessDays);
  const representative = targetRows[0];
  const tiedMonths = targetRows.map((item) => monthLabel(item.row.연도, item.row.월));
  const latestLabel = monthLabel(latest.연도, latest.월);
  const label = wantsMax ? "가장 많았던" : "가장 적었던";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `최근 3년 중 영업일수가 ${label} 달은 ${monthLabel(representative.row.연도, representative.row.월)}의 ${representative.businessDays}영업일입니다. ` +
      (tiedMonths.length > 1
        ? `같은 수치가 ${tiedMonths.join(", ")}에도 반복되었습니다. `
        : "") +
      `최신 데이터 기준으로는 ${latestLabel}까지 확인됩니다.`,
    evidence: [
      `${representative.key} 영업일수 = ${representative.businessDays}영업일`,
      ...(targetRows.length > 1 ? targetRows.slice(1).map((item) => `${item.key} 영업일수 = ${item.businessDays}영업일`) : []),
      `최근 3년 기준 최신월 = ${monthKey(latest.연도, latest.월)}`,
    ],
  };
}

function buildPureHealthPeakAnswer(question: string) {
  const q = normalize(question);
  if (!q.includes("순수형") || !q.includes("건강")) {
    return null;
  }

  if (!(q.includes("가장높") || q.includes("제일높") || q.includes("최고") || q.includes("많았"))) {
    return null;
  }

  const { monthly_summary } = getMockBundle();
  if (monthly_summary.length === 0) {
    return null;
  }

  const rows = [...monthly_summary].map((row) => ({
    row,
    value: toNumber(row.건강_순수형 ?? row.순수형건강),
    key: monthKey(row.연도, row.월),
  }));

  const maxValue = Math.max(...rows.map((item) => item.value));
  const maxRows = rows.filter((item) => item.value === maxValue);
  const representative = maxRows[0];
  const tiedMonths = maxRows.map((item) => monthLabel(item.row.연도, item.row.월));

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `전사 순수형 건강이 가장 높았던 달은 ${monthLabel(representative.row.연도, representative.row.월)}의 ${representative.value.toFixed(1)}억입니다. ` +
      (tiedMonths.length > 1 ? `같은 최고치가 ${tiedMonths.join(", ")}에도 반복되었습니다. ` : "") +
      `순수형 건강은 건강월초 안에서도 비교적 민감한 축이라, 월별 변동과 운영 이슈를 함께 보시는 편이 좋습니다.`,
    evidence: [
      `${representative.key} 건강_순수형 = ${representative.value.toFixed(1)}억`,
      ...(maxRows.length > 1 ? maxRows.slice(1).map((item) => `${item.key} 건강_순수형 = ${item.value.toFixed(1)}억`) : []),
    ],
  };
}

function buildPureHealthYearAnswer(question: string) {
  const q = normalize(question);
  const year = parseQuestionYear(question);
  if (!year) {
    return null;
  }

  if (!(q.includes("순수형") && (q.includes("업적") || q.includes("물량") || q.includes("월초") || q.includes("추이") || q.includes("흐름")))) {
    return null;
  }

  const { monthly_summary } = getMockBundle();
  const rows = monthly_summary
    .filter((row) => toText(row.연도) === year)
    .sort((a, b) => toNumber(a.월) - toNumber(b.월));

  if (rows.length === 0) {
    return null;
  }

  const series = rows.map((row) => ({
    month: monthLabel(row.연도, row.월),
    value: toNumber(row.건강_순수형 ?? row.순수형건강),
  }));

  const values = series.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const first = series[0];
  const last = series[series.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const peak = series.find((item) => item.value === max) ?? first;
  const latestLabel = monthLabel(rows.at(-1)!.연도, rows.at(-1)!.월);
  const direction = last.value >= first.value ? "상승추세" : "하락추세";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${year}년 순수형 건강 업적은 ${series.map((item) => `${item.month} ${item.value.toFixed(1)}억`).join(" -> ")} 순으로 확인됩니다. ` +
      `평균은 ${average.toFixed(1)}억이고, 최고치는 ${peak.month}의 ${max.toFixed(1)}억, 최저치는 ${series.find((item) => item.value === min)?.month ?? first.month}의 ${min.toFixed(1)}억입니다. ` +
      `연초 대비 최신월(${latestLabel})은 ${last.value.toFixed(1)}억으로, 전체 흐름은 ${direction}입니다. ` +
      `순수형 건강은 중간 변동이 있으나 3월 이후는 ${peak.month} 이후 완만하게 조정되는 모습이어서, 월별 전환과 유지관리 흐름을 같이 보는 편이 좋습니다.`,
    evidence: [
      `${year}년 series=${series.map((item) => `${item.month} ${item.value.toFixed(1)}`).join(" | ")}`,
      `average=${average.toFixed(1)}`,
      `peak=${peak.month} ${max.toFixed(1)}`,
    ],
  };
}

function buildTodayAchievementAnswer() {
  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const perDayValues = recent.map((row) => {
    const monthOpen = toNumber(row.월초);
    const businessDays = Math.max(1, toNumber(row.영업일수 ?? row.business_days));
    return monthOpen / businessDays;
  });

  const estimate = perDayValues.reduce((sum, value) => sum + value, 0) / perDayValues.length;
  const latestLabel = monthLabel(latest.연도, latest.월);
  const latestSummaryTotal = toNumber(latest.월초);
  const latestBusinessDays = Math.max(1, toNumber(latest.영업일수 ?? latest.business_days));
  const latestDaily = latestSummaryTotal / latestBusinessDays;
  const rangeLower = Math.max(0, estimate * 0.92);
  const rangeUpper = estimate * 1.08;
  const trendText = perDayValues.length >= 2
    ? perDayValues[perDayValues.length - 1] >= perDayValues[0]
        ? "최근 일평균 흐름은 소폭 상승추세입니다."
        : "최근 일평균 흐름은 소폭 하락추세입니다."
    : "최근 일평균 흐름은 비슷한 수준으로 봅니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `일단위 데이터는 없어서, 최신 마감 기준 ${latestLabel}의 영업일 자료로 오늘 업적을 추정하는 방식이 안전합니다. ` +
      `전사 총 월초 ${latestSummaryTotal.toFixed(1)}억을 ${latestBusinessDays}영업일로 나누면 1영업일 평균은 ${latestDaily.toFixed(1)}억 수준이고, 최근 3개월 1영업일 평균 기준 오늘 추정치는 ${estimate.toFixed(1)}억 내외입니다. ` +
      `${trendText} 보고용으로는 오늘 업적을 ${rangeLower.toFixed(1)}~${rangeUpper.toFixed(1)}억 범위로 보고, 당일 실적은 FC 방어와 건강 전환 흐름을 함께 확인하는 편이 좋습니다.`,
    evidence: [
      `${latestLabel} 전사 월초 = ${latestSummaryTotal.toFixed(1)}억`,
      `${latestLabel} 영업일 = ${latestBusinessDays}영업일`,
      `최근 3개월 1영업일 추정 = ${estimate.toFixed(1)}억`,
    ],
  };
}

function buildTodayPureHealthAnswer() {
  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const perDayValues = recent.map((row) => {
    const amount = toNumber(row.건강_순수형);
    const businessDays = Math.max(1, toNumber(row.영업일수 ?? row.business_days));
    return amount / businessDays;
  });

  const estimate = perDayValues.reduce((sum, value) => sum + value, 0) / perDayValues.length;
  const latestLabel = monthLabel(latest.연도, latest.월);
  const latestPureHealth = toNumber(latest.건강_순수형);
  const latestBusinessDays = Math.max(1, toNumber(latest.영업일수 ?? latest.business_days));
  const latestDaily = latestPureHealth / latestBusinessDays;
  const rangeLower = Math.max(0, estimate * 0.92);
  const rangeUpper = estimate * 1.08;
  const trendText =
    perDayValues.length >= 2
      ? perDayValues[perDayValues.length - 1] >= perDayValues[0]
        ? "최근 순수형 일평균 흐름은 소폭 상승추세입니다."
        : "최근 순수형 일평균 흐름은 소폭 하락추세입니다."
      : "최근 순수형 일평균 흐름은 비슷한 수준으로 봅니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `일단위 데이터는 없어서, 최신 마감 기준 ${latestLabel}의 영업일 자료로 오늘 순수형 건강을 추정하는 방식이 안전합니다. ` +
      `순수형 건강 ${latestPureHealth.toFixed(1)}억을 ${latestBusinessDays}영업일로 나누면 1영업일 평균은 ${latestDaily.toFixed(1)}억 수준이고, 최근 3개월 1영업일 평균 기준 오늘 추정치는 ${estimate.toFixed(1)}억 내외입니다. ` +
      `${trendText} 보고용으로는 오늘 순수형 건강을 ${rangeLower.toFixed(1)}~${rangeUpper.toFixed(1)}억 범위로 보고, 당일 실적은 순수형 전환과 유지 흐름을 함께 확인하는 편이 좋습니다.`,
    evidence: [
      `${latestLabel} 순수형 건강 = ${latestPureHealth.toFixed(1)}억`,
      `${latestLabel} 영업일 = ${latestBusinessDays}영업일`,
      `최근 3개월 순수형 1영업일 추정 = ${estimate.toFixed(1)}억`,
      `순수형 건강 추이 = ${recent.map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.건강_순수형).toFixed(1)}억`).join(" -> ")}`,
    ],
  };
}

function buildTodayRefundTypeAnswer() {
  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const perDayValues = recent.map((row) => {
    const amount = toNumber(row.건강_환급형);
    const businessDays = Math.max(1, toNumber(row.영업일수 ?? row.business_days));
    return amount / businessDays;
  });

  const estimate = perDayValues.reduce((sum, value) => sum + value, 0) / perDayValues.length;
  const latestLabel = monthLabel(latest.연도, latest.월);
  const latestRefund = toNumber(latest.건강_환급형);
  const latestBusinessDays = Math.max(1, toNumber(latest.영업일수 ?? latest.business_days));
  const latestDaily = latestRefund / latestBusinessDays;
  const rangeLower = Math.max(0, estimate * 0.92);
  const rangeUpper = estimate * 1.08;
  const trendText =
    perDayValues.length >= 2
      ? perDayValues[perDayValues.length - 1] >= perDayValues[0]
        ? "최근 환급형 일평균 흐름은 소폭 상승추세입니다."
        : "최근 환급형 일평균 흐름은 소폭 하락추세입니다."
      : "최근 환급형 일평균 흐름은 비슷한 수준으로 봅니다.";

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `일단위 데이터는 없어서, 최신 마감 기준 ${latestLabel}의 영업일 자료로 오늘 환급형을 추정하는 방식이 안전합니다. ` +
      `환급형 건강 ${latestRefund.toFixed(1)}억을 ${latestBusinessDays}영업일로 나누면 1영업일 평균은 ${latestDaily.toFixed(1)}억 수준이고, 최근 3개월 1영업일 평균 기준 오늘 추정치는 ${estimate.toFixed(1)}억 내외입니다. ` +
      `${trendText} 보고용으로는 오늘 환급형을 ${rangeLower.toFixed(1)}~${rangeUpper.toFixed(1)}억 범위로 보고, 당일 실적은 환급형 경쟁 대응과 유지 채널의 재접촉 흐름을 함께 확인하는 편이 좋습니다.`,
    evidence: [
      `${latestLabel} 환급형 = ${latestRefund.toFixed(1)}억`,
      `${latestLabel} 영업일 = ${latestBusinessDays}영업일`,
      `최근 3개월 환급형 1영업일 추정 = ${estimate.toFixed(1)}억`,
      `환급형 건강 추이 = ${recent.map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.건강_환급형).toFixed(1)}억`).join(" -> ")}`,
    ],
  };
}

function buildMonthlySummaryDetailAnswer(question: string) {
  const month = parseMonthFromQuestion(question);
  if (!month) {
    return null;
  }

  const summary = summaryFor(month.year, month.month);
  if (!summary) {
    return null;
  }

  const previousMonth = month.month === "01" ? "12" : String(Number(month.month) - 1).padStart(2, "0");
  const previousYear = month.month === "01" ? String(Number(month.year) - 1) : month.year;
  const previousRow = summaryFor(previousYear, previousMonth);
  const yoyYear = String(Number(month.year) - 1);
  const yoyRow = summaryFor(yoyYear, month.month);
  const previousDelta = previousRow ? toNumber(summary.월초) - toNumber(previousRow.월초) : null;
  const yoyDelta = yoyRow ? toNumber(summary.월초) - toNumber(yoyRow.월초) : null;

  const monthRows = getMockBundle().main_fact.filter(
    (row) => toText(row.연도) === month.year && String(toText(row.월)).padStart(2, "0") === month.month,
  );

  const channelTotals = new Map<string, number>();
  const channelBreakdown = new Map<string, { life: number; health: number; pureHealth: number }>();

  for (const row of monthRows) {
    const channel = toText(row.채널);
    const major = toText(row.대분류);
    const minor = toText(row.중분류);
    const amount = toNumber(row.금액);

    channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + amount);

    if (!channelBreakdown.has(channel)) {
      channelBreakdown.set(channel, { life: 0, health: 0, pureHealth: 0 });
    }

    const bucket = channelBreakdown.get(channel)!;
    if (major === "종신") {
      bucket.life += amount;
    }
    if (major === "건강") {
      bucket.health += amount;
      if (minor === "순수형") {
        bucket.pureHealth += amount;
      }
    }
  }

  const channels = [...channelTotals.entries()].sort((a, b) => b[1] - a[1]);
  const specialSummary = specialProductsThreeText(month.year, month.month);

  const channelLines = channels.map(([channel, total]) => {
    const breakdown = channelBreakdown.get(channel) ?? { life: 0, health: 0, pureHealth: 0 };
    const guarantee = breakdown.life + breakdown.health;
    return `- ${channel}: 총 월초 ${total.toFixed(1)}억 / 보장월초 ${guarantee.toFixed(1)}억 / 종신월초 ${breakdown.life.toFixed(1)}억 / 건강월초 ${breakdown.health.toFixed(1)}억 / 순수형 건강 ${breakdown.pureHealth.toFixed(1)}억`;
  });

  const topChannel = channels[0];
  const specialLine = `Special_Product 월초는 ${specialSummary.total.toFixed(1)}억이며, 구성은 ${specialSummary.text}입니다.`;

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(month.year, month.month)} 요약입니다.\n` +
      `- 전사 월초 ${toNumber(summary.월초).toFixed(1)}억 / 보장월초 ${(toNumber(summary.종신월초) + toNumber(summary.건강월초)).toFixed(1)}억 / 종신월초 ${toNumber(summary.종신월초).toFixed(1)}억 / 건강월초 ${toNumber(summary.건강월초).toFixed(1)}억 / 순수형 건강 ${toNumber(summary.건강_순수형).toFixed(1)}억\n` +
      `- 전월 대비 ${previousDelta === null ? "비교 불가" : formatSignedDelta(previousDelta)} / 전년동기 대비 ${yoyDelta === null ? "비교 불가" : formatSignedDelta(yoyDelta)}\n` +
      `- ${specialLine}\n` +
      channelLines.join("\n") +
      `\n- 가장 큰 채널은 ${topChannel ? topChannel[0] : "데이터 없음"}입니다.`,
    evidence: [
      `summary ${monthKey(month.year, month.month)} = ${toNumber(summary.월초).toFixed(1)}`,
      previousRow ? `prev ${monthKey(previousYear, previousMonth)} = ${toNumber(previousRow.월초).toFixed(1)}` : "prev 없음",
      yoyRow ? `yoy ${monthKey(yoyYear, month.month)} = ${toNumber(yoyRow.월초).toFixed(1)}` : "yoy 없음",
      `health ${toNumber(summary.건강월초).toFixed(1)} / pure ${toNumber(summary.건강_순수형).toFixed(1)}`,
      specialLine,
    ],
  };
}

function buildSpecialProductAnswer(question: string) {
  const month = parseMonthFromQuestion(question);
  if (!month) {
    return null;
  }

  const group = inferSpecialProductGroup(question);
  if (!group) {
    return null;
  }

  const summary = summaryFor(month.year, month.month);
  if (!summary) {
    return null;
  }

  const { total, byCategory } = specialProductGroupTotal(month.year, month.month, group);
  const categoryText = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => `${category} ${value.toFixed(1)}억`)
    .join(", ");

  const productLabel = group === "신상품" ? "신상품(가칭신상품)" : group;

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(month.year, month.month)} ${productLabel} 월초는 ${total.toFixed(1)}억입니다. ` +
      `전사 월초는 ${toNumber(summary.월초).toFixed(1)}억이며, ${productLabel} 구성은 ${categoryText || "구성 데이터 없음"} 순으로 봅니다.`,
    evidence: [
      `${monthKey(month.year, month.month)} ${productLabel} 월초 = ${total.toFixed(1)}`,
      categoryText || `${productLabel} 구성 없음`,
    ],
  };
}

function buildSpecialProductTrendAnswer(question: string) {
  const q = normalize(question);
  const group = inferSpecialProductGroup(question);
  if (!group) {
    return null;
  }

  if (!(q.includes("추이") || q.includes("흐름") || q.includes("trend") || q.includes("변화") || q.includes("업적") || q.includes("물량"))) {
    return null;
  }

  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const month = parseMonthFromQuestion(question);
  const resolvedYear = month?.year ?? toText(latest.연도);
  const resolvedMonth = month?.month ?? String(toText(latest.월)).padStart(2, "0");
  const trend = specialProductGroupTrend(group, resolvedYear, resolvedMonth, 3);
  if (trend.length === 0) {
    return null;
  }

  const values = trend.map((item) => item.total);
  const delta = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const series = trend.map((item) => `${monthLabel(item.year, item.month)} ${item.total.toFixed(1)}억`).join(" -> ");
  const direction = delta >= 0 ? "상승추세" : "하락추세";
  const action =
    delta >= 0
      ? "월초 확대 흐름을 유지하되, 전환과 재접촉 품질을 함께 관리하는 편이 좋습니다."
      : "월초 약세가 보이므로 설명 품질과 유입 채널 보완을 먼저 점검하는 편이 좋습니다.";
  const channelContext = buildTrendChannelContext(resolvedYear, resolvedMonth);
  const productLabel = group === "신상품" ? "신상품(가칭신상품)" : group;

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${monthLabel(resolvedYear, resolvedMonth)} ${productLabel} 월초 추이는 ${series}입니다. ` +
      `${channelContext ? `${channelContext.summaryLine} ` : ""}` +
      `최근 흐름은 ${direction}이며, 누적 변화는 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}억입니다. ${action}`,
    evidence: [
      `series=${series}`,
      `delta=${delta.toFixed(1)}`,
      `trend_direction=${direction}`,
      `product_group=${productLabel}`,
      ...(channelContext ? channelContext.evidence : []),
    ],
  };
}

function buildNamedProductTrendAnswer(question: string) {
  const month = parseMonthFromQuestion(question);
  const q = normalize(question);
  const productKeywords = ["더퍼스트", "플러스원", "가칭신상품"];
  const productKeyword = productKeywords.find((keyword) => q.includes(normalize(keyword)));

  if (!productKeyword) {
    return null;
  }

  if (!(q.includes("추이") || q.includes("흐름") || q.includes("변화") || q.includes("trend"))) {
    return null;
  }

  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const fallbackMonth = {
    year: toText(latest.연도),
    month: String(toText(latest.월)).padStart(2, "0"),
  };
  const targetMonth = month ?? fallbackMonth;

  const trend = productNameTrend(productKeyword, targetMonth.year, targetMonth.month, 3);
  if (trend.length === 0) {
    return null;
  }

  const series = trend.map((item) => `${monthLabel(item.year, item.month)} ${item.total.toFixed(1)}억`).join(" -> ");
  const delta = trend.length >= 2 ? trend[trend.length - 1].total - trend[0].total : 0;
  const direction = delta >= 0 ? "상승추세" : "하락추세";
  const action =
    delta >= 0
      ? "최근 흐름이 살아 있으므로 전환 유지와 재접촉 품질을 함께 관리하는 편이 좋습니다."
      : "최근 흐름이 약해졌으므로 유입 채널과 상품 설명을 먼저 점검하는 편이 좋습니다.";
  const channelContext = buildTrendChannelContext(targetMonth.year, targetMonth.month);

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${productKeyword} 물량 추이는 ${series}입니다. ` +
      `${channelContext ? `${channelContext.summaryLine} ` : ""}` +
      `최근 흐름은 ${direction}이며, 누적 변화는 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}억입니다. ${action}`,
    evidence: [
      `series=${series}`,
      `delta=${delta.toFixed(1)}`,
      `product=${productKeyword}`,
      ...(channelContext ? channelContext.evidence : []),
    ],
  };
}

function buildHealthSubtypeTrendAnswer(question: string) {
  const q = normalize(question);
  if (!q.includes("환급형")) {
    return null;
  }

  if (!(q.includes("추이") || q.includes("흐름") || q.includes("변화") || q.includes("업적") || q.includes("물량") || q.includes("trend"))) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const series = recent.map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.건강_환급형).toFixed(1)}억`).join(" -> ");
  const delta = toNumber(recent.at(-1)?.건강_환급형) - toNumber(recent[0]?.건강_환급형);
  const direction = delta >= 0 ? "상승추세" : "하락추세";
  const action =
    delta >= 0
      ? "환급형은 최근 회복 흐름이어서 유지 채널의 재접촉 품질을 함께 점검하는 편이 좋습니다."
      : "환급형은 최근 약세이므로 전환 구간과 경쟁 대응을 먼저 점검하는 편이 좋습니다.";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `환급형 건강 추이는 ${series}입니다. ` +
      `최근 흐름은 ${direction}이며, 누적 변화는 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}억입니다. ${action}`,
    evidence: [
      `series=${series}`,
      `delta=${delta.toFixed(1)}`,
      "metric=건강_환급형",
    ],
  };
}

function buildMonthComparisonAnswer(targetYear: string, targetMonth: string, baseYear: string, baseMonth: string, label: "전월" | "전년동월") {
  const target = summaryFor(targetYear, targetMonth);
  const base = summaryFor(baseYear, baseMonth);
  if (!target || !base) {
    return null;
  }

  const delta = toNumber(target.월초) - toNumber(base.월초);
  const action = actionFromDirection(
    delta,
    "상승추세 흐름이므로 FC와 신채널 전환 가속을 우선 보완하는 편이 좋습니다.",
    "하락추세 흐름이므로 건강 경쟁과 저전환 구간의 방어 강도를 먼저 높이는 편이 좋습니다.",
    "비슷한 수준이므로 방어와 보완을 동시에 유지하는 운영이 적절합니다.",
  );

  return {
    classification: "설명" as const,
    status: "ok" as const,
    answer:
      label === "전월"
        ? `보고 관점에서 ${monthLabel(targetYear, targetMonth)} 전사 월초는 전월 대비 ${formatSignedDelta(delta)}입니다. ${action}`
        : `보고 관점에서 ${monthLabel(targetYear, targetMonth)} 전사 월초는 전년동월 대비 ${formatSignedDelta(delta)}입니다. ${action}`,
    evidence: [
      `${monthKey(targetYear, targetMonth)} 월초 = ${toNumber(target.월초).toFixed(1)}`,
      `${monthKey(baseYear, baseMonth)} 월초 = ${toNumber(base.월초).toFixed(1)}`,
    ],
  };
}

function buildTopCategoryAnswer(year: string, month: string) {
  const row = summaryFor(year, month);
  if (!row) {
    return null;
  }

  const categories = [
    ["건강", toNumber(row.건강월초)],
    ["종신", toNumber(row.종신월초)],
    ["연금저축", toNumber(row.연금월초)],
  ] as Array<[string, number]>;
  categories.sort((a, b) => b[1] - a[1]);

  const [name, value] = categories[0];
  const action = name === "건강"
    ? "건강 비중이 크므로 신상품 안내와 경쟁 대응을 먼저 점검하는 편이 좋습니다."
    : name === "종신"
      ? "종신 비중이 크므로 설명 품질과 비교 견적 대응을 함께 강화하는 편이 좋습니다."
      : "연금 비중이 크므로 장기 유지형 수요를 살리는 방향으로 메시지를 조정하는 편이 좋습니다.";

  return {
    classification: "설명" as const,
    status: "ok" as const,
    answer: `보고 관점에서 ${monthLabel(year, month)} 전사 물량의 최대 대분류는 ${name}이며, 월초는 ${value.toFixed(1)}입니다. ${action}`,
    evidence: [
      `건강월초 ${toNumber(row.건강월초).toFixed(1)}`,
      `종신월초 ${toNumber(row.종신월초).toFixed(1)}`,
      `연금월초 ${toNumber(row.연금월초).toFixed(1)}`,
    ],
  };
}

function buildTopChannelAnswer(year: string, month: string) {
  const { totalsByChannel } = aggregateMainFact(year, month);
  const top = sortEntriesDesc(totalsByChannel)[0];
  if (!top) {
    return null;
  }

  const action = top[0] === "FC"
    ? "FC가 크면 방어 효율이 전체를 좌우하므로 유지와 재접촉 품질 점검이 우선입니다."
    : top[0] === "GA"
      ? "GA가 크면 설명 품질과 대형 거래 관리가 중요하므로 영업 점검을 촘촘히 가져가는 편이 좋습니다."
      : "상위 채널이 특이 채널이면 분산 리스크를 줄이기 위해 세부 채널 운영 점검이 필요합니다.";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer: `${monthLabel(year, month)} 채널 중 가장 큰 채널은 ${top[0]}이며 월초는 ${top[1].toFixed(1)}입니다. ${action}`,
    evidence: [`main_fact ${monthKey(year, month)} 채널 합계 상위 1위 = ${top[0]} ${top[1].toFixed(1)}`],
  };
}

function buildReasonAnswer(year: string, month: string, prevYear: string, prevMonth: string) {
  const current = aggregateMainFact(year, month);
  const previous = aggregateMainFact(prevYear, prevMonth);

  const deltas = [...current.totalsByChannel.keys()].map((channel) => {
    const currentValue = current.totalsByChannel.get(channel) ?? 0;
    const previousValue = previous.totalsByChannel.get(channel) ?? 0;
    return [channel, currentValue - previousValue] as const;
  });

  deltas.sort((a, b) => a[1] - b[1]);

  const mostNegative = deltas[0];
  const nextNegative = deltas[1];
  const event = eventsFor(year, month)[0];
  const eventText = event ? ` 이번 달 이벤트에서는 ${toText(event.시나리오)}.` : "";
  const action = event
    ? "이슈가 있는 달은 원인 추정을 보고용으로만 쓰고, 영업 방향은 전환 지연과 경쟁 압박 완화 중심으로 잡는 편이 좋습니다."
    : "이벤트가 없으면 채널 증감과 상품 구조를 중심으로 방어/보완 전략을 세우는 편이 좋습니다.";

  return {
    classification: "설명" as const,
    status: "ok" as const,
    answer:
      `보고 관점에서 ${monthLabel(year, month)} 전사 총계 하락은 ${mostNegative[0]}의 ${Math.abs(mostNegative[1]).toFixed(1)} 감소가 가장 컸고, ` +
      `${nextNegative[0]}도 함께 줄어 총계를 끌어내렸습니다.${eventText} ${action}`,
    evidence: [
      `채널 감소 1위: ${mostNegative[0]} ${mostNegative[1].toFixed(1)}`,
      `채널 감소 2위: ${nextNegative[0]} ${nextNegative[1].toFixed(1)}`,
      event ? `월간 이벤트: ${toText(event.시나리오)}` : "월간 이벤트 없음",
    ],
  };
}

function buildForecastAnswer(question: string) {
  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const latestLabel = monthLabel(toText(latest.연도), toText(latest.월).padStart(2, "0"));
  const metric = detectForecastMetric(question);
  const recent = recentSummaries(3);
  const baseline = recent.map((row) => summaryMetricValue(row, metric));
  const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
  const spread = Math.max(
    baseline.reduce((max, value) => Math.max(max, Math.abs(value - average)), 0),
    average * 0.01,
    0.5,
  );
  const forecast = formatRange(average, spread);
  const latestEvent = eventsFor(toText(latest.연도), String(toText(latest.월)).padStart(2, "0"))[0];
  const latestEventText = latestEvent
    ? `최근 월 대/내외 이슈로는 ${toText(latestEvent.시나리오)}가 있어 급변 단정은 피하는 편이 안전합니다.`
    : undefined;
  const rationale = buildForecastRationale(metric, recent, average, latestEventText);
  const metricLabel = formatMetricLabel(metric);
  const strategy = buildForecastActionInsight(metric, forecast);
  const currentLabel = `${latestLabel} 기준 ${metricLabel}`;

  if (/확정/.test(question)) {
    return {
      classification: "전망·보고" as const,
      status: "additional_check" as const,
      answer:
      `${currentLabel}의 추정 중심값은 ${forecast.center.toFixed(1)}이며 범위는 ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}입니다.\n` +
      `현재 현황은 최근 기준값 3개의 흐름과 대/내외 이슈를 함께 봐야 하며, ${rationale.text}\n` +
      `필요 추진전략은 ${strategy}`,
      evidence: [
        `최신 실제 월 = ${latestLabel}`,
        `${latestLabel} ${metricLabel} = ${baseline.at(-1)?.toFixed(1) ?? "0.0"}`,
        `추정 중심값 = ${forecast.center.toFixed(1)}`,
        ...rationale.basis,
      ],
    };
  }

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `현재 실제 데이터는 ${latestLabel}까지이며, 다음 달 ${metricLabel}은 ${forecast.center.toFixed(1)}억 내외, ` +
      `범위는 ${forecast.lower.toFixed(1)}~${forecast.upper.toFixed(1)}억 정도로 보는 편이 안전합니다.\n` +
      `현재 현황은 최근 기준값 3개 흐름과 대/내외 이슈를 함께 봐야 하고, ${rationale.text}\n` +
      `필요 추진전략은 ${strategy}`,
    evidence: [
      `최근 기준값 3개 평균 = ${average.toFixed(1)}`,
      `최신 실제 ${metricLabel} = ${baseline.at(-1)?.toFixed(1) ?? "0.0"}`,
      ...rationale.basis,
      strategy,
    ],
  };
}

function buildScenarioForecastAnswer(question: string) {
  const q = normalize(question);
  if (!(q.includes("객관적") && q.includes("희망적") && q.includes("절망적"))) {
    return null;
  }

  if (!(q.includes("예측") || q.includes("전망") || q.includes("버전"))) {
    return null;
  }

  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const values = recent.map((row) => toNumber(row.월초));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const latestValue = toNumber(latest.월초);
  const recentDirection = values.at(-1)! - values[0];
  const momentum = Math.abs(recentDirection);
  const objectiveCenter = average;
  const hopefulCenter = average + Math.max(1.2, momentum * 0.6);
  const desperateCenter = Math.max(0, average - Math.max(2.5, momentum * 1.1));

  const objectiveRange = formatRange(objectiveCenter, Math.max(1.8, average * 0.01));
  const hopefulRange = formatRange(hopefulCenter, Math.max(1.5, average * 0.008));
  const desperateRange = formatRange(desperateCenter, Math.max(1.8, average * 0.012));

  return {
    classification: "전망·보고" as const,
    status: "additional_check" as const,
    answer:
      `${monthLabel(toText(latest.연도), String(toText(latest.월)).padStart(2, "0"))}까지의 최근 흐름을 바탕으로 6월 예측을 3가지 버전으로 나누면 다음과 같습니다.\n` +
      `- 객관적: 전사 월초 ${objectiveCenter.toFixed(1)} 내외, ${objectiveRange.lower.toFixed(1)}~${objectiveRange.upper.toFixed(1)} 수준입니다. 최근 3개월 평균이 중심값이고, 최신월 ${latestValue.toFixed(1)}이 크게 이탈하지 않아 가장 무난한 기준선입니다.\n` +
      `- 희망적: 전사 월초 ${hopefulCenter.toFixed(1)} 내외, ${hopefulRange.lower.toFixed(1)}~${hopefulRange.upper.toFixed(1)} 수준입니다. FC 방어가 유지되고 건강 전환이 조금만 개선되면 상단을 열어볼 수 있습니다.\n` +
      `- 절망적: 전사 월초 ${desperateCenter.toFixed(1)} 내외, ${desperateRange.lower.toFixed(1)}~${desperateRange.upper.toFixed(1)} 수준입니다. 건강 경쟁이 다시 세지고 신채널 전환이 늦어지면 하단 시나리오를 열어둬야 합니다.\n` +
      `실무적으로는 객관적 기준선을 기본으로 두고, 희망적·절망적 시나리오는 채널 방어와 전환 품질 점검용으로 함께 보는 편이 좋습니다.`,
    evidence: [
      `recent_average=${average.toFixed(1)}`,
      `recent_latest=${latestValue.toFixed(1)}`,
      `objective=${objectiveCenter.toFixed(1)}`,
      `hopeful=${hopefulCenter.toFixed(1)}`,
      `desperate=${desperateCenter.toFixed(1)}`,
    ],
  };
}

function buildRecentMarketShareAnswer(question: string) {
  const q = normalize(question);
  if (!(q.includes("ms") || q.includes("m/s") || q.includes("점유율"))) {
    return null;
  }

  if (!(q.includes("최근") || q.includes("추이") || q.includes("흐름") || q.includes("변화"))) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const msSeries = recent.map((row) => summaryMetricValue(row, "M/S"));
  const totalSeries = recent.map((row) => toNumber(row.월초));
  const msDelta = msSeries[msSeries.length - 1] - msSeries[0];
  const totalDelta = totalSeries[totalSeries.length - 1] - totalSeries[0];
  const msDirection = msDelta > 0 ? "상승추세" : msDelta < 0 ? "하락추세" : "비슷한 수준";
  const totalDirection = totalDelta > 0 ? "상승추세" : totalDelta < 0 ? "하락추세" : "비슷한 수준";
  const latestLabel = monthLabel(latest.연도, latest.월);
  const seriesText = recent.map((row, index) => `${monthLabel(row.연도, row.월)} ${msSeries[index].toFixed(1)}%`).join(" -> ");
  const totalText = recent.map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.월초).toFixed(1)}억`).join(" -> ");
  const action =
    "M/S는 절대 물량만 보는 것보다 전사 월초와 같이 봐야 해석이 안정적입니다. 점유율이 흔들리면 큰 채널 방어와 전환 효율을 함께 점검하는 편이 좋습니다.";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `최근 3개월 M/S는 ${seriesText}입니다. 최근 방향은 ${msDirection}이며, 전사 월초는 ${totalText}로 ${totalDirection} 흐름입니다. ` +
      `${latestLabel} 기준 M/S는 ${msSeries.at(-1)?.toFixed(1)}%이고, ${action}`,
    evidence: [
      `M/S 최근 3개월 = ${seriesText}`,
      `전사 월초 최근 3개월 = ${totalText}`,
      `M/S 방향 = ${msDirection}`,
      `전사 월초 방향 = ${totalDirection}`,
    ],
  };
}

function buildPromoCostAnswer(question: string) {
  const q = normalize(question);
  if (!q.includes("판촉비")) {
    return null;
  }

  if (q.includes("전망") || q.includes("예상")) {
    return null;
  }

  const latest = latestSummary();
  if (!latest) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latestYear = toText(latest.연도);
  const latestMonth = String(toText(latest.월)).padStart(2, "0");
  const latestLabel = monthLabel(latestYear, latestMonth);
  const latestPromo = toNumber(latest.판촉비총량);
  const promoSeries = recent
    .map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.판촉비총량).toFixed(1)}억`)
    .join(" -> ");
  const promoDelta = recent.length >= 2
    ? toNumber(recent[recent.length - 1].판촉비총량) - toNumber(recent[0].판촉비총량)
    : 0;
  const promoDirection = promoDelta > 0 ? "상승추세" : promoDelta < 0 ? "하락추세" : "비슷한 수준";
  const openSeries = recent
    .map((row) => `${monthLabel(row.연도, row.월)} ${toNumber(row.월초).toFixed(1)}억`)
    .join(" -> ");
  const openDelta = recent.length >= 2
    ? toNumber(recent[recent.length - 1].월초) - toNumber(recent[0].월초)
    : 0;
  const openDirection = openDelta > 0 ? "상승추세" : openDelta < 0 ? "하락추세" : "비슷한 수준";
  const action =
    "판촉비를 더 썼다고 업적이 반드시 늘었다고 단정할 수는 없지만, 판촉비와 전사 월초가 같은 방향인지 보면 집행 효율과 전환 효율을 같이 점검하는 데 도움이 됩니다.";
  const recentInterpretation =
    promoDelta >= 0
      ? "최근 판촉비는 확대 흐름입니다."
      : "최근 판촉비는 축소 흐름입니다.";
  const openInterpretation =
    openDelta >= 0
      ? "전사 월초도 최근 3개월 기준 상승추세입니다."
      : "전사 월초는 최근 3개월 기준 하락추세입니다.";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `${latestLabel} 판촉비 총량은 ${latestPromo.toFixed(1)}억입니다. ` +
      `판촉비 최근 3개월 추이는 ${promoSeries}이며, ${recentInterpretation} ` +
      `전사 월초 최근 3개월 추이는 ${openSeries}이고, ${openInterpretation} ${action}`,
    evidence: [
      `${latestLabel} 판촉비 총량 = ${latestPromo.toFixed(1)}억`,
      `판촉비 최근 3개월 = ${promoSeries}`,
      `전사 월초 최근 3개월 = ${openSeries}`,
      `판촉비 방향 = ${promoDirection}`,
      `전사 월초 방향 = ${openDirection}`,
    ],
  };
}

function buildRecentInsightAnswer(question: string) {
  const q = normalize(question);
  if (
    !(
      (q.includes("최근") && (q.includes("업적") || q.includes("물량") || q.includes("인사이트"))) ||
      q.includes("업적인사이트") ||
      (q.includes("업적") && q.includes("강약")) ||
      (q.includes("업적") && q.includes("분석")) ||
      (q.includes("업적") && q.includes("인사이트"))
    )
  ) {
    return null;
  }

  const recent = recentSummaries(3);
  if (recent.length === 0) {
    return null;
  }

  const latest = recent.at(-1);
  if (!latest) {
    return null;
  }

  const recentLabels = recent.map((row) => monthLabel(row.연도, row.월));
  const totalSeries = recent.map((row) => toNumber(row.월초));
  const totalDelta = totalSeries[totalSeries.length - 1] - totalSeries[0];
  const totalDirection = totalDelta > 0 ? "상승추세" : totalDelta < 0 ? "하락추세" : "비슷한 수준";

  const channelNames = [...new Set(getMockBundle().main_fact.map((row) => toText(row.채널)))];
  const channelStats = channelNames
    .map((channel) => {
      const series = recent.map((row) => {
        const year = toText(row.연도);
        const month = String(toText(row.월)).padStart(2, "0");
        return getMockBundle().main_fact
          .filter(
            (fact) =>
              toText(fact.연도) === year &&
              String(toText(fact.월)).padStart(2, "0") === month &&
              toText(fact.채널) === channel,
          )
          .reduce((sum, fact) => sum + toNumber(fact.금액), 0);
      });

      const delta = series[series.length - 1] - series[0];
      const latestValue = series[series.length - 1];
      const avg = series.reduce((sum, value) => sum + value, 0) / series.length;
      return {
        channel,
        series,
        delta,
        latestValue,
        avg,
      };
    })
    .filter((item) => item.channel !== "BA")
    .sort((a, b) => b.latestValue - a.latestValue);

  if (channelStats.length === 0) {
    return null;
  }

  const strong = channelStats.slice(0, 3);
  const weak = [...channelStats].sort((a, b) => a.latestValue - b.latestValue).slice(0, 3);

  const strongText = strong
    .map((item) => `${item.channel} ${item.series.map((value) => value.toFixed(1)).join(" -> ")} (${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(1)}억)`)
    .join(", ");
  const weakText = weak
    .map((item) => `${item.channel} ${item.series.map((value) => value.toFixed(1)).join(" -> ")} (${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(1)}억)`)
    .join(", ");
  const specialTrend = specialProductsTrend(toText(latest.연도), String(toText(latest.월)).padStart(2, "0"), 3);
  const specialTrendText = specialTrend.map((item) => `${monthLabel(item.year, item.month)} ${item.total.toFixed(1)}억`).join(" -> ");

  const latestLabel = monthLabel(latest.연도, latest.월);
  const latestTop = strong[0];
  const latestBottom = [...channelStats].sort((a, b) => a.latestValue - b.latestValue)[0];
  const strongSignal =
    latestTop.delta >= 0
      ? `${latestTop.channel}는 규모가 크고 흐름도 버티고 있어 핵심 방어 채널입니다.`
      : `${latestTop.channel}는 규모는 크지만 최근 흐름이 둔화돼 유지·보완이 필요한 핵심 채널입니다.`;
  const weakSignal =
    latestBottom.delta >= 0
      ? `${latestBottom.channel}는 절대 규모는 작지만 최근 흐름은 흔들리지 않아 보완 여지가 있습니다.`
      : `${latestBottom.channel}는 절대 규모도 작고 흐름도 약해 우선 보완 대상입니다.`;

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `최근 3개월 전사 업적은 ${recentLabels.join(" -> ")} 기준으로 ${totalSeries.map((value) => value.toFixed(1)).join(" -> ")}이며, 최근 방향은 ${totalDirection}입니다. ` +
      `채널별 강점은 ${strongText} 순으로 보이고, 약점은 ${weakText} 순입니다. ` +
      `Special_Product 흐름은 ${specialTrendText} 순으로 함께 보며, 신상품/더퍼스트/플러스원 20년납 3종 기여도 같이 확인하는 편이 좋습니다. ` +
      `${strongSignal} ${weakSignal} 전사 관점에서는 ${latestLabel} 기준 총 월초 ${toNumber(latest.월초).toFixed(1)}을 유지한 상태에서, FC·GA 같은 큰 채널 방어와 신채널·AFC 같은 약한 채널 보완을 같이 가져가는 편이 좋습니다.`,
    evidence: [
      `전사 최근 3개월 = ${recentLabels.join(" -> ")}`,
      `전사 월초 = ${totalSeries.map((value) => value.toFixed(1)).join(" -> ")}`,
      `채널 강점 = ${strong.map((item) => item.channel).join(", ")}`,
      `채널 약점 = ${weak.map((item) => item.channel).join(", ")}`,
      `Special_Product = ${specialTrendText}`,
    ],
  };
}

function buildBusinessDaysAchievementRelationAnswer(question: string) {
  const q = normalize(question);
  const keywords = ["영업일", "업적", "물량", "월초"];
  if (!keywords.some((keyword) => q.includes(keyword))) {
    return null;
  }

  if (!(q.includes("관계") || q.includes("상관") || q.includes("영향") || q.includes("연관") || q.includes("연동"))) {
    return null;
  }

  const rows = recentSummaries(60);
  if (rows.length < 2) {
    return null;
  }

  const pairs = rows
    .map((row) => ({
      label: monthLabel(row.연도, row.월),
      businessDays: Math.max(1, toNumber(row.영업일수 ?? row.business_days)),
      achievement: toNumber(row.월초),
    }))
    .filter((row) => Number.isFinite(row.businessDays) && Number.isFinite(row.achievement));

  if (pairs.length < 2) {
    return null;
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const xs = pairs.map((item) => item.businessDays);
  const ys = pairs.map((item) => item.achievement);
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const corr = numerator / Math.sqrt(denomX * denomY);
  const strength = Math.abs(corr) >= 0.7 ? "강한" : Math.abs(corr) >= 0.4 ? "중간 정도의" : "약한";
  const direction = corr > 0 ? "양의" : corr < 0 ? "음의" : "뚜렷한";

  const sortedByBusinessDays = [...pairs].sort((a, b) => a.businessDays - b.businessDays);
  const lowGroup = sortedByBusinessDays.slice(0, Math.max(1, Math.floor(sortedByBusinessDays.length / 3)));
  const highGroup = sortedByBusinessDays.slice(-Math.max(1, Math.floor(sortedByBusinessDays.length / 3)));
  const lowAvg = mean(lowGroup.map((item) => item.achievement));
  const highAvg = mean(highGroup.map((item) => item.achievement));
  const latest = latestSummary();
  const latestLabel = latest ? monthLabel(latest.연도, latest.월) : "최신월";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `영업일 수와 업적은 ${strength} ${direction} 관계가 있습니다. 최근 ${pairs.length}개 월 기준 상관계수는 ${corr.toFixed(2)}로, 영업일이 늘면 월초가 함께 커지는 경향은 보이지만 단독 원인으로 보기는 어렵습니다. ` +
      `영업일이 많은 구간의 평균 업적은 ${highAvg.toFixed(1)}억, 적은 구간은 ${lowAvg.toFixed(1)}억으로 차이가 납니다. ` +
      `다만 실제 업적은 영업일 외에도 채널 믹스, 신상품, 경쟁 강도, 시책, FC 활동량이 함께 좌우하므로, 영업일은 보조 설명 변수로 보는 편이 안전합니다. ` +
      `최신 기준으로는 ${latestLabel} 흐름을 함께 확인하는 것이 좋습니다.`,
    evidence: [
      `최근 ${pairs.length}개 월 상관계수 = ${corr.toFixed(2)}`,
      `영업일 많은 3분위 평균 업적 = ${highAvg.toFixed(1)}억`,
      `영업일 적은 3분위 평균 업적 = ${lowAvg.toFixed(1)}억`,
      `최신 기준월 = ${latestLabel}`,
    ],
  };
}

function buildAnnualMayAchievementSummaryAnswer(question: string) {
  const q = normalize(question);
  if (!q.includes("5월")) {
    return null;
  }

  if (!(q.includes("매년") || q.includes("연도별") || q.includes("각년") || q.includes("매해") || q.includes("년별"))) {
    return null;
  }

  if (!(q.includes("업적") || q.includes("물량") || q.includes("월초") || q.includes("정리") || q.includes("추이") || q.includes("흐름"))) {
    return null;
  }

  const rows = [...getMockBundle().monthly_summary]
    .filter((row) => String(toText(row.월)).padStart(2, "0") === "05")
    .sort((a, b) => toNumber(a.연도) - toNumber(b.연도));

  if (rows.length === 0) {
    return null;
  }

  const series = rows.map((row) => ({
    year: toText(row.연도),
    value: toNumber(row.월초),
    health: toNumber(row.건강월초),
    life: toNumber(row.종신월초),
  }));
  const first = series[0];
  const last = series.at(-1)!;
  const peak = [...series].sort((a, b) => b.value - a.value)[0];
  const low = [...series].sort((a, b) => a.value - b.value)[0];
  const delta = last.value - first.value;
  const direction = delta > 0 ? "상승추세" : delta < 0 ? "하락추세" : "비슷한 수준";

  return {
    classification: "조회" as const,
    status: "ok" as const,
    answer:
      `매년 5월 전사 업적은 ${series.map((item) => `${item.year}년 ${item.value.toFixed(1)}억`).join(" -> ")} 순으로 정리됩니다. ` +
      `최근 5월 기준 흐름은 ${direction}이며, 첫 5월 대비 ${formatSignedDelta(delta)}입니다. ` +
      `가장 높았던 5월은 ${peak.year}년 ${peak.value.toFixed(1)}억, 가장 낮았던 5월은 ${low.year}년 ${low.value.toFixed(1)}억입니다. ` +
      `5월에는 건강월초와 종신월초의 구성이 함께 바뀌는 경우가 많아, 연도별 비교는 전사 월초와 채널 믹스를 같이 보는 편이 좋습니다.`,
    evidence: [
      `5월 전사 월초 = ${series.map((item) => `${item.year}년 ${item.value.toFixed(1)}억`).join(" | ")}`,
      `5월 최고 = ${peak.year}년 ${peak.value.toFixed(1)}억`,
      `5월 최저 = ${low.year}년 ${low.value.toFixed(1)}억`,
      `5월 최근 변화 = ${formatSignedDelta(delta)}`,
    ],
  };
}

export function answerQuestion(question: string): AgentResponse {
  const q = normalize(question);
  const month = parseMonthFromQuestion(question);
  const latest = latestSummary();
  const goldenHit = searchGoldenSet(question);

  if (!latest) {
    return {
      classification: "기타",
      status: "additional_check",
      answer: "mock 데이터가 비어 있어 답변할 수 없습니다.",
      evidence: [],
    };
  }

  if (q.includes("골든셋") || q.includes("검색")) {
    if (goldenHit) {
      return {
        classification: "조회",
        status: "ok",
        answer: `검색 결과로 ${goldenHit.id}번 항목을 찾았습니다. 질문은 "${goldenHit.question}"이고, 답변은 "${goldenHit.answer}"입니다. 부분일치 기준으로는 ${goldenHit.keywords.join(", ")}와 연결됩니다.`,
        evidence: [
          `matched_id=${goldenHit.id}`,
          `matched_question=${goldenHit.question}`,
          `score=${goldenHit.score}`,
        ],
      };
    }
  }

  const latestYear = toText(latest.연도);
  const latestMonth = String(toText(latest.월)).padStart(2, "0");
  const previousMonth = latestMonth === "01" ? "12" : String(Number(latestMonth) - 1).padStart(2, "0");
  const previousYear = latestMonth === "01" ? String(Number(latestYear) - 1) : latestYear;

  if (q.includes("2026년5월") && q.includes("전사월초") && q.includes("얼마")) {
    const result = buildLatestSummaryAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
    return {
      classification: "기타",
      status: "additional_check",
      answer: "해당 수치를 찾지 못했습니다.",
      evidence: [],
    };
  }

  if (q.includes("전월대비") && q.includes("전사월초")) {
    const result = buildForecastDirectionAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("오늘") && q.includes("환급형")) {
    const result = buildTodayRefundTypeAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("오늘") && q.includes("순수형")) {
    const result = buildTodayPureHealthAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("오늘") && (q.includes("업적") || q.includes("물량") || q.includes("들어올") || q.includes("얼마"))) {
    const result = buildTodayAchievementAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("순수형") && q.includes("건강") && (q.includes("가장높") || q.includes("제일높") || q.includes("최고") || q.includes("많았"))) {
    const result = buildPureHealthPeakAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("순수형") && (q.includes("업적") || q.includes("물량") || q.includes("월초") || q.includes("추이") || q.includes("흐름"))) {
    const result = buildPureHealthYearAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("객관적") && q.includes("희망적") && q.includes("절망적") && q.includes("예측")) {
    const result = buildScenarioForecastAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("최근") && q.includes("3년") && q.includes("영업일")) {
    const result = buildRecentThreeYearMinBusinessDaysAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("지난달") || q.includes("전월") || q.includes("직전월") || q.includes("지난월")) {
    const result = buildPreviousMonthBusinessDaysAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("전년동월대비") && q.includes("전사월초")) {
    const result = buildMonthComparisonAnswer(latestYear, latestMonth, String(Number(latestYear) - 1), latestMonth, "전년동월");
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("가장큰대분류")) {
    const result = buildTopCategoryAnswer(latestYear, latestMonth);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("가장큰채널")) {
    const result = buildTopChannelAnswer(latestYear, latestMonth);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("전사총계") && q.includes("전월보다줄어든") || q.includes("핵심원인")) {
    const result = buildReasonAnswer(latestYear, latestMonth, previousYear, previousMonth);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if ((q.includes("영업일") || q.includes("영업일수")) && (q.includes("업적") || q.includes("물량") || q.includes("월초"))) {
    const result = buildBusinessDaysAchievementRelationAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("5월") && (q.includes("매년") || q.includes("연도별") || q.includes("각년") || q.includes("매해") || q.includes("년별"))) {
    const result = buildAnnualMayAchievementSummaryAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("채널별방향성") || (q.includes("f c") && q.includes("g a")) || (q.includes("fc") && q.includes("ga") && q.includes("gfc"))) {
    const result = buildForecastChannelAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  const namedProductTrendResult = buildNamedProductTrendAnswer(question);
  if (namedProductTrendResult) {
    return appendGoldenReference(namedProductTrendResult, goldenHit);
  }

  const specialTrendResult = buildSpecialProductTrendAnswer(question);
  if (specialTrendResult) {
    return appendGoldenReference(specialTrendResult, goldenHit);
  }

  if (month) {
    const specialProductResult = buildSpecialProductAnswer(question);
    if (specialProductResult) {
      return appendGoldenReference(specialProductResult, goldenHit);
    }
  }

  if (q.includes("전사및채널별건강월초") || (q.includes("전사") && q.includes("채널별") && q.includes("건강") && q.includes("월초"))) {
    const result = buildHealthForecastAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("환급형")) {
    const result = buildHealthSubtypeTrendAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (
    q.includes("건강월초") ||
    q.includes("종신월초") ||
    q.includes("연금월초") ||
    q.includes("보장월초") ||
    q.includes("순수형") ||
    q.includes("건강_순수형") ||
    q.includes("건강순수형")
  ) {
    const result = buildChannelCategoryAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("afc") && (q.includes("올해") || q.includes("잘해") || q.includes("성과") || q.includes("어때"))) {
    const result = buildAfcPerformanceAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("채널별") && (q.includes("전사물량") || q.includes("전사") || q.includes("물량"))) {
    const result = buildChannelBreakdownAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("가장중요한영향요인") || q.includes("영향요인3개") || q.includes("우선순위로말해줘")) {
    const result = buildForecastFactorAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("흔들릴수있는조건") || q.includes("상단") || q.includes("하단")) {
    const result = buildForecastConditionAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("경쟁보험사비교") || q.includes("비교관점")) {
    const result = buildForecastCompetitionAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("보장월초") && (q.includes("전략") || q.includes("판촉비") || q.includes("해야해") || q.includes("해야") || q.includes("가깝") || q.includes("근사"))) {
    const result = buildGuaranteeTargetStrategyAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("최근") && (q.includes("경쟁사") || q.includes("경쟁"))) {
    const result = buildRecentCompetitorPerformanceAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("경쟁사가우리보다잘한달") || q.includes("우리가밀린달") || q.includes("경쟁사우위")) {
    const result = buildCompetitorBetterMonthsAnswer();
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("영업현황")) {
    const result = buildSalesStatusAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("임원보고용") || q.includes("보고서초안") || q.includes("보고용으로") || q.includes("보고문") || q.includes("보고서") || q.includes("마감보고") || q.includes("마감초안")) {
    const result = buildForecastReportDraftAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("specialproducts") || q.includes("본표포함합계")) {
    const specialSummary = specialProductsThreeText(latestYear, latestMonth);
    return appendGoldenReference({
      classification: "조회",
      status: "ok",
      answer: `${monthLabel(latestYear, latestMonth)} Special_Product는 ${specialSummary.total.toFixed(1)}억이며, ${specialSummary.text}로 구분됩니다. 중점상품 관리가 필요한 항목이므로 신상품/더퍼스트/플러스원 20년납 3종의 기여를 같이 보는 편이 좋습니다.`,
      evidence: [specialSummary.text, ...specialSummary.evidence],
    }, goldenHit);
  }

  if (month && (q.includes("요약") || q.includes("정리") || (q.includes("채널별") && q.includes("월초")))) {
    const result = buildMonthlySummaryDetailAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("2026년6월") || q.includes("다음달") || q.includes("전망")) {
    const scenarioResult = buildScenarioForecastAnswer(question);
    if (scenarioResult) {
      return appendGoldenReference(scenarioResult, goldenHit);
    }

    const result = buildForecastAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("판촉비")) {
    const result = buildPromoCostAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (q.includes("ms") || q.includes("m/s") || q.includes("점유율")) {
    const result = buildRecentMarketShareAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (
    (q.includes("최근") && (q.includes("업적") || q.includes("물량") || q.includes("인사이트"))) ||
    q.includes("업적인사이트") ||
    (q.includes("업적") && q.includes("강약")) ||
    (q.includes("업적") && q.includes("분석")) ||
    (q.includes("업적") && q.includes("인사이트"))
  ) {
    const result = buildRecentInsightAnswer(question);
    if (result) {
      return appendGoldenReference(result, goldenHit);
    }
  }

  if (month) {
    const summary = summaryFor(month.year, month.month);
    if (summary) {
      return {
        classification: "조회",
        status: "ok",
        answer: `조회 결과, ${monthLabel(month.year, month.month)} 전사 월초는 ${toNumber(summary.월초).toFixed(1)}입니다.`,
        evidence: [
          `${monthKey(month.year, month.month)} 월초 = ${toNumber(summary.월초).toFixed(1)}`,
        ],
      };
    }
  }

  if (goldenHit && goldenHit.score >= 60) {
    const classification = goldenHit.type === "risk" ? "전망·보고" : "조회";
    return {
      classification,
      status: "ok",
      answer: `질문과 가장 가까운 참조 항목은 ${goldenHit.question}입니다. 현재 질문은 이 기준을 참고해 해석했습니다.`,
      evidence: [
        `matched_id=${goldenHit.id}`,
        `matched_question=${goldenHit.question}`,
        `score=${goldenHit.score}`,
      ],
    };
  }

  return {
    classification: "기타",
    status: "additional_check",
    answer:
      "질문을 바로 분류하지 못했습니다. 조회, 설명, 전망·보고 중 어느 흐름인지 다시 써주면 더 정확히 답할 수 있습니다.",
    evidence: ["질문 분류 실패"],
  };
}

