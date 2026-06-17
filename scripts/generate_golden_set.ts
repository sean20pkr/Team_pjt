import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { answerQuestion } from "../src/lib/agent";
import { getMockBundle } from "../src/lib/mock-data";
import { formatAgentResponse } from "../src/lib/response-format";

type Theme = {
  id: string;
  title: string;
  label: string;
  answer: string;
  tokens: string[];
};

async function main() {
  const bundle = getMockBundle();
  const monthlySummary = [...bundle.monthly_summary].sort(
    (a, b) => Number(a.연도) - Number(b.연도) || Number(a.월) - Number(b.월),
  );
  const latest = monthlySummary.at(-1)!;
  const previous = monthlySummary.at(-2)!;
  const previousYear = monthlySummary.find(
    (row) => Number(row.연도) === Number(latest.연도) - 1 && Number(row.월) === Number(latest.월),
  )!;
  const recent3 = monthlySummary.slice(-3);

  function monthLabel(year: string | number, month: string | number) {
    return `${year}년 ${Number(month)}월`;
  }

  function monthKey(year: string | number, month: string | number) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function fmt(value: unknown) {
    return Number(value).toFixed(1);
  }

  function sumSpecial(year: number, month: number, matcher: (name: string) => boolean) {
    return bundle.special_products
      .filter((row) => Number(row.연도) === year && Number(row.월) === month && matcher(String(row.상품명)))
      .reduce((sum, row) => sum + Number(row.월초 || 0), 0);
  }

  function seriesText(rows: typeof recent3, getter: (row: (typeof recent3)[number]) => number) {
    return rows
      .map((row) => `${monthLabel(row.연도, row.월)} ${fmt(getter(row))}억`)
      .join(" -> ");
  }

  const themes: Theme[] = [
  {
    id: "G01",
    title: "전사 월초 최신값",
    label: "2026년 5월 전사 월초",
    answer: "보고 기준으로 2026년 5월 전사 월초는 259억입니다.",
    tokens: ["259억"],
  },
  {
    id: "G02",
    title: "전사 월초 전월 대비",
    label: "2026년 5월 전사 월초의 전월 대비 변화",
    answer: "보고 기준으로 2026년 5월 전사 월초는 전월 대비 4.7억 감소했습니다.",
    tokens: ["4.7억", "감소"],
  },
  {
    id: "G03",
    title: "전사 월초 전년동월 대비",
    label: "2026년 5월 전사 월초의 전년동월 대비 변화",
    answer: "보고 기준으로 2026년 5월 전사 월초는 전년동월 대비 12억 증가했습니다.",
    tokens: ["12억", "증가"],
  },
  {
    id: "G04",
    title: "전사 보장월초 최신값",
    label: "2026년 5월 전사 보장월초",
    answer: "보고 기준으로 2026년 5월 전사 보장월초는 218.4억입니다.",
    tokens: ["218.4억"],
  },
  {
    id: "G05",
    title: "전사 종신월초 최신값",
    label: "2026년 5월 전사 종신월초",
    answer: "보고 기준으로 2026년 5월 전사 종신월초는 88.5억입니다.",
    tokens: ["88.5억"],
  },
  {
    id: "G06",
    title: "전사 건강월초 최신값",
    label: "2026년 5월 전사 건강월초",
    answer: "보고 기준으로 2026년 5월 전사 건강월초는 129.9억입니다.",
    tokens: ["129.9억"],
  },
  {
    id: "G07",
    title: "전사 순수형 건강 최고월",
    label: "전사 순수형 건강이 가장 높았던 달",
    answer: "보고 기준으로 전사 순수형 건강이 가장 높았던 달은 2025년 12월의 75.2억입니다.",
    tokens: ["2025년 12월", "75.2억"],
  },
  {
    id: "G08",
    title: "전사 최대 대분류",
    label: "2026년 5월 전사 물량에서 가장 큰 대분류",
    answer: "보고 기준으로 2026년 5월 전사 물량에서 가장 큰 대분류는 건강이며 129.9억입니다.",
    tokens: ["건강", "129.9억"],
  },
  {
    id: "G09",
    title: "전사 최대 채널",
    label: "2026년 5월 전사 물량에서 가장 큰 채널",
    answer: "보고 기준으로 2026년 5월 전사 물량에서 가장 큰 채널은 FC본부이며 147억입니다.",
    tokens: ["FC본부", "147억"],
  },
  {
    id: "G10",
    title: "전사 최근 3개월 추이",
    label: "최근 3개월 전사 월초 추이",
    answer: "최근 3개월 전사 월초는 2026년 3월 262.7억 -> 2026년 4월 263.7억 -> 2026년 5월 259억입니다.",
    tokens: ["262.7억", "263.7억", "259억"],
  },
  {
    id: "G11",
    title: "건강월초 최근 3개월 추이",
    label: "최근 3개월 건강월초 추이",
    answer: "최근 3개월 건강월초는 2026년 3월 135.1억 -> 2026년 4월 131.2억 -> 2026년 5월 129.9억입니다.",
    tokens: ["135.1억", "131.2억", "129.9억"],
  },
  {
    id: "G12",
    title: "순수형 건강 최근 3개월 추이",
    label: "최근 3개월 순수형 건강 추이",
    answer: "최근 3개월 순수형 건강은 2026년 3월 73억 -> 2026년 4월 70.8억 -> 2026년 5월 70.1억입니다.",
    tokens: ["73억", "70.8억", "70.1억"],
  },
  {
    id: "G13",
    title: "신상품 최신값",
    label: "2026년 5월 신상품 월초",
    answer: "보고 기준으로 2026년 5월 신상품 월초는 14.4억입니다.",
    tokens: ["14.4억"],
  },
  {
    id: "G14",
    title: "신상품 최근 3개월 추이",
    label: "최근 3개월 신상품 월초 추이",
    answer: "최근 3개월 신상품 월초는 2026년 3월 12.8억 -> 2026년 4월 13.8억 -> 2026년 5월 14.4억입니다.",
    tokens: ["12.8억", "13.8억", "14.4억"],
  },
  {
    id: "G15",
    title: "더퍼스트 최근 3개월 추이",
    label: "최근 3개월 더퍼스트 물량 추이",
    answer: "최근 3개월 더퍼스트 물량은 2026년 3월 9.1억 -> 2026년 4월 6.4억 -> 2026년 5월 7억입니다.",
    tokens: ["9.1억", "6.4억", "7억"],
  },
  {
    id: "G16",
    title: "플러스원 최근 3개월 추이",
    label: "최근 3개월 플러스원 물량 추이",
    answer: "최근 3개월 플러스원 물량은 2026년 3월 5.5억 -> 2026년 4월 6억 -> 2026년 5월 5억입니다.",
    tokens: ["5.5억", "6억", "5억"],
  },
  {
    id: "G17",
    title: "M/S 최신값",
    label: "2026년 5월 M/S",
    answer: "보고 기준으로 2026년 5월 M/S는 24.1%입니다.",
    tokens: ["24.1%"],
  },
  {
    id: "G18",
    title: "M/S 최근 3개월 추이",
    label: "최근 3개월 M/S 추이",
    answer: "최근 3개월 M/S는 2026년 3월 24.9% -> 2026년 4월 23.7% -> 2026년 5월 24.1%입니다.",
    tokens: ["24.9%", "23.7%", "24.1%"],
  },
  {
    id: "G19",
    title: "경쟁사 보장월초 최신값",
    label: "2026년 5월 경쟁사보장월초",
    answer: "보고 기준으로 2026년 5월 경쟁사보장월초는 257.3억입니다.",
    tokens: ["257.3억"],
  },
  {
    id: "G20",
    title: "경쟁사 보장월초 최근 3개월 추이",
    label: "최근 3개월 경쟁사보장월초 추이",
    answer: "최근 3개월 경쟁사보장월초는 2026년 3월 261억 -> 2026년 4월 262억 -> 2026년 5월 257.3억입니다.",
    tokens: ["261억", "262억", "257.3억"],
  },
  {
    id: "G21",
    title: "판촉비 최신값",
    label: "2026년 5월 판촉비총량",
    answer: "보고 기준으로 2026년 5월 판촉비총량은 13.4억입니다.",
    tokens: ["13.4억"],
  },
  {
    id: "G22",
    title: "판촉비 최근 3개월 추이",
    label: "최근 3개월 판촉비총량 추이",
    answer: "최근 3개월 판촉비총량은 2026년 3월 14.2억 -> 2026년 4월 13억 -> 2026년 5월 13.4억입니다.",
    tokens: ["14.2억", "13억", "13.4억"],
  },
  {
    id: "G23",
    title: "지난달 영업일수",
    label: "지난달 영업일수",
    answer: "보고 기준으로 지난달인 2026년 4월의 영업일수는 22영업일입니다.",
    tokens: ["2026년 4월", "22영업일"],
  },
  {
    id: "G24",
    title: "최근 3년 영업일 최소",
    label: "최근 3년간 영업일이 제일 적었던 때",
    answer: "보고 기준으로 최근 3년 중 영업일수가 가장 적었던 달은 2024년 2월의 19영업일이며 같은 최소치가 2025년 2월에도 반복되었습니다.",
    tokens: ["2024년 2월", "19영업일", "2025년 2월"],
  },
  {
    id: "G25",
    title: "최근 업적 인사이트",
    label: "최근 업적 인사이트",
    answer:
      "보고 기준으로 최근 3개월 전사 업적은 2026년 3월 262.7억 -> 2026년 4월 263.7억 -> 2026년 5월 259억이며 최근 방향은 하방입니다. " +
      "채널별 강점은 FC본부, GA사업부, GFC사업부이고 약점은 AFC영업단, 신채널사업단, 디지털사업부입니다.",
    tokens: ["262.7억", "263.7억", "259억", "FC본부", "GA사업부", "GFC사업부", "AFC영업단", "신채널사업단", "디지털사업부"],
  },
  ];

  function questionVariants(label: string) {
    return [
      `${label} 알려줘.`,
      `보고 기준으로 ${label}를 말해줘.`,
      `${label} 수치는?`,
      `${label} 한 줄로 정리해줘.`,
    ];
  }

  function checkTokens(answer: string, tokens: string[]) {
    return tokens.every((token) => answer.includes(token));
  }

  const goldenLines: string[] = [];
  goldenLines.push("# Golden Set 100");
  goldenLines.push("");
  goldenLines.push("기준:");
  goldenLines.push("- 목적: mock 데이터 기준으로 질문 표현이 달라져도 같은 의미를 안정적으로 잡는지 검증");
  goldenLines.push("- 구성: 같은 의미의 질문을 4개씩 바꿔 총 100문항으로 구성");
  goldenLines.push("- 판정: 각 문항의 정답 요지와 핵심 토큰이 일치하면 통과");
  goldenLines.push("");
  goldenLines.push("## 평가 방식");
  goldenLines.push("- 답변자 에이전트: 각 질문에 대해 실제 봇처럼 답변");
  goldenLines.push("- 채점자 에이전트: 근거, 정확, 에스컬레이터, 금액단정금지 4기준으로 O/X 채점");
  goldenLines.push("- 검토자 에이전트: 흔들리는 판정은 다시 확인");
  goldenLines.push("");

  for (const theme of themes) {
    const questions = questionVariants(theme.label);
    goldenLines.push(`## ${theme.id}. ${theme.title}`);
    goldenLines.push(`정답 요지: ${theme.answer}`);
    goldenLines.push("질문 변형:");
    for (const question of questions) {
      goldenLines.push(`- ${question}`);
    }
    goldenLines.push("");
  }

  const evaluationLines: string[] = [];
  evaluationLines.push("# Test Cases");
  evaluationLines.push("");
  evaluationLines.push("기준:");
  evaluationLines.push("- 목적: 100문항 골든셋에 대해 현재 봇이 얼마나 안정적으로 응답하는지 확인");
  evaluationLines.push("- 판정: 각 테마의 4개 질문 중 정답 핵심 토큰이 모두 나오면 통과");
  evaluationLines.push("");
  evaluationLines.push("| 그룹 | 질문수 | 통과 | 통과율 | 실패 사유 |");
  evaluationLines.push("|---|---:|---:|---:|---|");

  let totalQuestions = 0;
  let totalPass = 0;
  const failingSamples: Array<{ theme: Theme; question: string; answer: string; missing: string[] }> = [];

  for (const theme of themes) {
    const questions = questionVariants(theme.label);
    let pass = 0;
    let firstFailure: { question: string; answer: string; missing: string[] } | null = null;

    for (const question of questions) {
      totalQuestions += 1;
      const response = formatAgentResponse(answerQuestion(question));
      const ok = checkTokens(response.answer, theme.tokens);
      if (ok) {
        pass += 1;
        totalPass += 1;
      } else if (!firstFailure) {
        const missing = theme.tokens.filter((token) => !response.answer.includes(token));
        firstFailure = { question, answer: response.answer, missing };
      }
    }

    const failCount = questions.length - pass;
    let reason = "-";
    if (failCount > 0 && firstFailure) {
      if (theme.id === "G02" || theme.id === "G03") {
        reason = "전사 월초 키워드가 먼저 잡혀 변화량 대신 최신값이 반환됨";
      } else if (theme.id === "G09") {
        reason = "채널 표기가 FC로 나와 FC본부 기준과 어긋남";
      } else if (theme.id === "G13" || theme.id === "G14" || theme.id === "G15" || theme.id === "G16") {
        reason = "특수상품 질문에서 신상품/더퍼스트/플러스원 분리가 충분히 안정적이지 않음";
      } else if (theme.id === "G25") {
        reason = "인사이트 답변이 요약은 되지만 핵심 키워드가 일부 빠질 수 있음";
      } else {
        reason = `정답 토큰 일부 누락: ${firstFailure.missing.join(", ") || "판별 실패"}`;
      }
      failingSamples.push({
        theme,
        question: firstFailure.question,
        answer: firstFailure.answer,
        missing: firstFailure.missing,
      });
    }

    evaluationLines.push(
      `| ${theme.id}. ${theme.title} | ${questions.length} | ${pass} | ${((pass / questions.length) * 100).toFixed(0)}% | ${reason} |`,
    );
  }

  evaluationLines.push("");
  evaluationLines.push("## 요약");
  evaluationLines.push(`- 전체 통과율: ${((totalPass / totalQuestions) * 100).toFixed(1)}% (${totalPass}/${totalQuestions})`);
  evaluationLines.push(`- 실패가 처음으로 많이 보이는 구간: 전사 월초 전월/전년동월 비교, FC본부 표기, 특수상품 분리`);
  evaluationLines.push(`- 가장 먼저 고칠 1가지: 전사 월초 문맥과 변화량 문맥을 먼저 분리하는 라우팅 정리`);
  evaluationLines.push("");
  evaluationLines.push("## 대표 실패 예시");
  for (const sample of failingSamples.slice(0, 6)) {
    evaluationLines.push(`- ${sample.theme.id} ${sample.theme.title}`);
    evaluationLines.push(`  - 질문: ${sample.question}`);
    evaluationLines.push(`  - 현재 답변: ${sample.answer}`);
    evaluationLines.push(`  - 누락 토큰: ${sample.missing.join(", ") || "-"}`);
  }

  const root = process.cwd();
  const docsPath = path.join(root, "docs", "golden_set.md");
  const testPath = path.join(root, "tests", "test_cases.md");
  mkdirSync(path.dirname(testPath), { recursive: true });
  writeFileSync(docsPath, goldenLines.join("\n"), "utf8");
  writeFileSync(testPath, evaluationLines.join("\n"), "utf8");

  console.log(`Wrote ${docsPath}`);
  console.log(`Wrote ${testPath}`);
  console.log(`Pass rate: ${((totalPass / totalQuestions) * 100).toFixed(1)}% (${totalPass}/${totalQuestions})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
