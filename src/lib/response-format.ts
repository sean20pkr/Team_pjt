import type { AgentResponse } from "@/lib/agent";

const CHANNEL_RULES: Array<[RegExp, string]> = [
  [/\bGFC\b/g, "GFC사업부"],
  [/\bGA\b/g, "GA사업부"],
  [/\bBA\b/g, "BA사업부"],
  [/신채널(?!사업단)/g, "신채널사업단"],
  [/\b디지털\b/g, "디지털사업부"],
  [/\bAFC\b/g, "AFC영업단"],
  [/\bFC\b/g, "FC본부"],
];

const PROTECTED_PATTERNS = [
  /\d{4}년/g,
  /\d{4}년\s*\d{1,2}월/g,
  /\d{4}-\d{2}(?:-\d{2})?/g,
  /\d+(?:\.\d+)?억/g,
  /\d+(?:\.\d+)?%/g,
  /\d+(?:\.\d+)?년/g,
  /\d+(?:\.\d+)?월/g,
  /\d+(?:\.\d+)?개월/g,
  /\d+(?:\.\d+)?가지/g,
  /\d+(?:\.\d+)?개/g,
  /\d+(?:\.\d+)?종/g,
  /\d+(?:\.\d+)?주/g,
  /\d+(?:\.\d+)?일/g,
  /\d+(?:\.\d+)?영업일/g,
  /\d+(?:\.\d+)?차/g,
];

function encodeToken(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function protect(text: string) {
  const placeholders: Array<{ token: string; value: string }> = [];
  let output = text;
  let counter = 0;

  PROTECTED_PATTERNS.forEach((pattern) => {
    output = output.replace(pattern, (match) => {
      const token = `__PH_${encodeToken(counter)}__`;
      placeholders.push({ token, value: match });
      counter += 1;
      return token;
    });
  });

  return { output, placeholders };
}

function restore(text: string, placeholders: Array<{ token: string; value: string }>) {
  let output = text;
  placeholders.forEach(({ token, value }) => {
    output = output.replaceAll(token, value);
  });
  return output;
}

function normalizeAUnitPostposition(text: string) {
  return text.replace(/(\d+(?:\.\d+)?)억로/g, "$1억으로");
}

function appendWonUnit(text: string) {
  const protectedText = protect(text);
  let output = protectedText.output;

  output = output.replace(/(?<![\d.])(\d+(?:\.\d+)?)(?![\d.억])/g, (_match, raw: string) => {
    const normalized = raw.endsWith(".0") ? raw.slice(0, -2) : raw;
    return `${normalized}억`;
  });
  output = output.replace(/(\d+)\.0억/g, "$1억");
  output = normalizeAUnitPostposition(output);

  CHANNEL_RULES.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });

  output = output.replace(/(\d+)\.0억/g, "$1억");
  output = output.replace(/(\d+)\.0%/g, "$1%");
  output = normalizeAUnitPostposition(output);

  output = restore(output, protectedText.placeholders);
  output = output.replace(/(\d+)\.0억/g, "$1억");
  output = output.replace(/(\d+)\.0%/g, "$1%");
  output = normalizeAUnitPostposition(output);
  output = output.replace(/(\d+)\.0(?!\d)/g, "$1");

  return output;
}

export function formatAgentResponse(response: AgentResponse): AgentResponse {
  return {
    ...response,
    answer: appendWonUnit(response.answer),
    evidence: response.evidence.map((item) => appendWonUnit(item)),
  };
}
