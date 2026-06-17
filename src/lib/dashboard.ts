import dashboardBundle from "../../dummy_data_output/dummy_data_bundle.json";

type SummaryRow = Record<string, string | number>;
type EventRow = Record<string, string | number>;
type FactRow = Record<string, string | number>;

export type DashboardCard = {
  channel: string;
  total: number;
  guarantee: number;
  life: number;
  health: number;
};

export type DashboardSnapshot = {
  monthLabel: string;
  total: number;
  guaranteeTotal: number;
  lifeTotal: number;
  healthTotal: number;
  issueLine: string;
  cards: DashboardCard[];
  selectedYear: string;
  selectedMonth: string;
};

export type DashboardMeta = {
  years: string[];
  monthsByYear: Record<string, string[]>;
  latestYear: string;
  latestMonth: string;
};

const bundle = dashboardBundle as {
  monthly_summary: SummaryRow[];
  monthly_events: EventRow[];
  main_fact: FactRow[];
};

function toNumber(value: string | number | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toText(value: string | number | undefined) {
  if (value === undefined) {
    return "";
  }

  return String(value);
}

function sortSummaryRows(rows: SummaryRow[]) {
  return [...rows].sort((a, b) => {
    const ay = toNumber(a.연도);
    const by = toNumber(b.연도);
    if (ay !== by) {
      return ay - by;
    }

    return toNumber(a.월) - toNumber(b.월);
  });
}

export function getDashboardMeta(): DashboardMeta {
  const summaries = sortSummaryRows(bundle.monthly_summary);
  const monthsByYear = summaries.reduce<Record<string, string[]>>((acc, row) => {
    const year = toText(row.연도);
    const month = String(toText(row.월)).padStart(2, "0");
    if (!acc[year]) {
      acc[year] = [];
    }

    if (!acc[year].includes(month)) {
      acc[year].push(month);
    }

    return acc;
  }, {});

  for (const year of Object.keys(monthsByYear)) {
    monthsByYear[year] = [...monthsByYear[year]].sort((a, b) => Number(a) - Number(b));
  }

  const years = Object.keys(monthsByYear).sort((a, b) => Number(b) - Number(a));
  const latest = summaries.at(-1);

  return {
    years,
    monthsByYear,
    latestYear: latest ? toText(latest.연도) : "",
    latestMonth: latest ? String(toText(latest.월)).padStart(2, "0") : "",
  };
}

function summaryFor(year: string, month: string) {
  return bundle.monthly_summary.find(
    (row) => toText(row.연도) === year && String(toText(row.월)).padStart(2, "0") === month,
  );
}

function resolveTargetPeriod(year?: string, month?: string) {
  const meta = getDashboardMeta();
  const resolvedYear = year && meta.years.includes(year) ? year : meta.latestYear;
  const availableMonths = meta.monthsByYear[resolvedYear] ?? [];
  const resolvedMonth =
    month && availableMonths.includes(month) ? month : availableMonths.at(-1) ?? meta.latestMonth;

  return {
    meta,
    year: resolvedYear,
    month: resolvedMonth,
  };
}

function shortenIssueLine(text: string) {
  return text.trim();
}

export function buildDashboardSnapshot(year?: string, month?: string): DashboardSnapshot {
  const { year: resolvedYear, month: resolvedMonth } = resolveTargetPeriod(year, month);
  const monthRow = summaryFor(resolvedYear, resolvedMonth);

  if (!monthRow) {
    return {
      monthLabel: "데이터 없음",
      total: 0,
      guaranteeTotal: 0,
      lifeTotal: 0,
      healthTotal: 0,
      issueLine: "주요 이슈 없음",
      cards: [],
      selectedYear: resolvedYear,
      selectedMonth: resolvedMonth,
    };
  }

  const rows = bundle.main_fact.filter(
    (row) => toText(row.연도) === resolvedYear && String(toText(row.월)).padStart(2, "0") === resolvedMonth,
  );

  const byChannel = new Map<string, number>();
  const byChannelCategory = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const channel = toText(row.채널);
    const category = toText(row.대분류);
    const amount = toNumber(row.금액);

    byChannel.set(channel, (byChannel.get(channel) ?? 0) + amount);

    if (!byChannelCategory.has(channel)) {
      byChannelCategory.set(channel, new Map());
    }

    const categoryMap = byChannelCategory.get(channel)!;
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
  }

  const cards = [...byChannel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([channel, total]) => {
      const categoryMap = byChannelCategory.get(channel);
      const life = categoryMap ? toNumber(categoryMap.get("종신")) : 0;
      const health = categoryMap ? toNumber(categoryMap.get("건강")) : 0;

      return {
        channel,
        total,
        guarantee: life + health,
        life,
        health,
      };
    });

  const latestEvent = bundle.monthly_events.find(
    (row) => toText(row.연도) === resolvedYear && String(toText(row.월)).padStart(2, "0") === resolvedMonth,
  );

  return {
    monthLabel: `${resolvedYear}년 ${Number(resolvedMonth)}월`,
    total: toNumber(monthRow.월초),
    guaranteeTotal: toNumber(monthRow.보장월초),
    lifeTotal: toNumber(monthRow.종신월초),
    healthTotal: toNumber(monthRow.건강월초),
    issueLine: latestEvent ? shortenIssueLine(toText(latestEvent.시나리오)) : "주요 이슈 없음",
    cards,
    selectedYear: resolvedYear,
    selectedMonth: resolvedMonth,
  };
}

export function getDashboardPeriods(year?: string) {
  const meta = getDashboardMeta();
  const selectedYear = year && meta.years.includes(year) ? year : meta.latestYear;
  return {
    ...meta,
    selectedYear,
    months: meta.monthsByYear[selectedYear] ?? [],
  };
}
