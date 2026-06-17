import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(__dirname, "..", "..");
const outDir = path.join(__dirname, "normalized");
const docsDir = path.join(projectRoot, "docs", "최종");

const manifestUserId = "";
const ingestMonth = "202606";
const storageBucket = "agent-uploads";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      pushCell();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      pushCell();
      pushRow();
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  const headers = rows.shift() ?? [];
  for (let i = 0; i < headers.length; i += 1) {
    headers[i] = headers[i].replace(/\uFEFF/g, "");
  }
  return rows
    .filter((r) => r.length > 0)
    .map((r) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = r[index] ?? "";
      });
      return record;
    });
}

function quoteCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows) {
  if (rows.length === 0) {
    fs.writeFileSync(filePath, "", "utf8");
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => quoteCsv(row[header])).join(","));
  }

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toYearMonthString(year, month) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  return `${y}-${m}`;
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(dataRoot, name), "utf8"));
}

function normalizeMonthlySummary(rows) {
  return rows.map((row) => ({
    year: Number(row.연도),
    month: Number(row.월),
    month_key: toYearMonthString(row.연도, row.월),
    month_open: toNumber(row.월초),
    coverage: toNumber(row.보장월초),
    health_month_open: toNumber(row.건강월초),
    health_pure: toNumber(row.건강_순수형),
    health_refund: toNumber(row.건강_환급형),
    health_special: toNumber(row.건강_특화형),
    life_month_open: toNumber(row.종신월초),
    life_target: toNumber(row.종신_목적종신),
    life_general: toNumber(row.종신_일반종신),
    annuity_month_open: toNumber(row.연금월초),
    annuity_detail: toNumber(row.연금_세부),
    savings_detail: toNumber(row.저축_세부),
    market_total: toNumber(row.시장전체),
    market_share: toNumber(row["M/S"]),
    competitor_coverage: toNumber(row.경쟁사보장월초),
    business_days: Number(row.영업일수),
    promo_cost_total: toNumber(row.판촉비총량),
    channel_check: toNumber(row.채널합계검산),
    product_check: toNumber(row.상품합계검산),
    gap: toNumber(row.합계차이),
  }));
}

function normalizeMainFact(rows) {
  return rows.map((row) => ({
    year: Number(row.연도),
    month: Number(row.월),
    month_key: toYearMonthString(row.연도, row.월),
    channel: row.채널,
    major_category: row.대분류,
    minor_category: row.중분류,
    amount: toNumber(row.금액),
  }));
}

function normalizeMonthlyEvents(rows) {
  return rows.map((row) => ({
    year: Number(row.연도),
    month: Number(row.월),
    month_key: toYearMonthString(row.연도, row.월),
    event_type: row.유형,
    scenario: row.시나리오,
    impact_direction: row.영향방향,
    impact_strength: row.강도,
    target_scope: row.영향대상,
  }));
}

function normalizeSpecialProducts(rows) {
  return rows.map((row) => ({
    year: Number(row.연도),
    month: Number(row.월),
    month_key: toYearMonthString(row.연도, row.월),
    product_name: row.상품명,
    product_group: row.구분,
    major_category: row.대분류,
    minor_category: row.중분류,
    month_open: toNumber(row.월초),
    health_month_open: toNumber(row.건강월초),
    life_month_open: toNumber(row.종신월초),
    include_in_body: String(row.본표포함여부).toUpperCase() === "Y",
    managed: String(row.세부관리여부).toUpperCase() === "Y",
    description: row.설명,
  }));
}

function normalizeSimpleProfile(rows, keyA, keyB) {
  return rows.map((row) => ({
    [keyA]: row[keyA],
    [keyB]: row[keyB],
    share: toNumber(row.비중),
  }));
}

function chunkTextList(text, limit = 650) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > limit && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildKnowledgeChunks() {
  const chunks = [];

  const summaries = normalizeMonthlySummary(readCsv("monthly_summary.csv"));
  for (const row of summaries) {
    const text = [
      `${row.year}년 ${row.month}월 전사 월초 ${row.month_open}`,
      `건강 ${row.health_month_open}`,
      `종신 ${row.life_month_open}`,
      `연금 ${row.annuity_month_open}`,
      `시장전체 ${row.market_total}`,
      `M/S ${row.market_share}`,
      `판촉비총량 ${row.promo_cost_total}`,
    ].join(", ");
    chunks.push({
      source_kind: "summary_row",
      source_name: "monthly_summary.csv",
      source_key: row.month_key,
      year: row.year,
      month: row.month,
      chunk_no: 1,
      chunk_type: "summary_row",
      search_text: text,
      embedding: "",
      embedding_model: "",
      embedding_updated_at: "",
      source_file_id: "",
    });
  }

  const events = normalizeMonthlyEvents(readCsv("monthly_events.csv"));
  for (const row of events) {
    const text = `${row.year}년 ${row.month}월 ${row.event_type} / ${row.scenario} / ${row.impact_direction} / ${row.impact_strength} / ${row.target_scope}`;
    chunks.push({
      source_kind: "event_row",
      source_name: "monthly_events.csv",
      source_key: `${row.month_key}-${row.event_type}`,
      year: row.year,
      month: row.month,
      chunk_no: 1,
      chunk_type: "event_row",
      search_text: text,
      embedding: "",
      embedding_model: "",
      embedding_updated_at: "",
      source_file_id: "",
    });
  }

  const specialProducts = normalizeSpecialProducts(readCsv("special_products.csv"));
  for (const row of specialProducts) {
    const text = `${row.year}년 ${row.month}월 ${row.product_name} ${row.product_group} ${row.major_category} ${row.minor_category} ${row.month_open}`;
    chunks.push({
      source_kind: "product_row",
      source_name: "special_products.csv",
      source_key: `${row.month_key}-${row.product_name}`,
      year: row.year,
      month: row.month,
      chunk_no: 1,
      chunk_type: "product_row",
      search_text: text,
      embedding: "",
      embedding_model: "",
      embedding_updated_at: "",
      source_file_id: "",
    });
  }

  const markdownFiles = fs
    .readdirSync(docsDir)
    .filter((name) => name.toLowerCase().endsWith(".md"));
  for (const fileName of markdownFiles) {
    const raw = fs.readFileSync(path.join(docsDir, fileName), "utf8");
    const chunksFromDoc = chunkTextList(raw);
    chunksFromDoc.forEach((chunkText, index) => {
      chunks.push({
        source_kind: "markdown",
        source_name: fileName,
        source_key: `${fileName}#${index + 1}`,
        year: "",
        month: "",
        chunk_no: index + 1,
        chunk_type: "markdown",
        search_text: chunkText,
        embedding: "",
        embedding_model: "",
        embedding_updated_at: "",
        source_file_id: "",
      });
    });
  }

  return chunks;
}

function buildSourceManifest() {
  const names = [
    ["csv", "monthly_summary.csv"],
    ["csv", "main_fact.csv"],
    ["csv", "monthly_events.csv"],
    ["csv", "special_products.csv"],
    ["csv", "channel_profile.csv"],
    ["csv", "product_profile.csv"],
    ["json", "dummy_data_bundle.json"],
    ["xlsx", "channel_volume_dummy_data.xlsx"],
  ];

  const docs = fs
    .readdirSync(docsDir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => ["markdown", path.join("docs", "최종", name)]);

  return [...names, ...docs].map(([kind, filePath]) => ({
    source_kind: kind,
    original_filename: path.basename(filePath),
    storage_bucket: storageBucket,
    storage_path: `${manifestUserId || "user_id"}/${ingestMonth}/${path.basename(filePath)}`,
    source_year: "",
    source_month: "",
    note: kind === "markdown" ? "문서 원본" : "원본 데이터",
  }));
}

function main() {
  ensureDir(outDir);

  const monthlySummary = normalizeMonthlySummary(readCsv("monthly_summary.csv"));
  const mainFact = normalizeMainFact(readCsv("main_fact.csv"));
  const monthlyEvents = normalizeMonthlyEvents(readCsv("monthly_events.csv"));
  const specialProducts = normalizeSpecialProducts(readCsv("special_products.csv"));
  const channelProfile = normalizeSimpleProfile(readCsv("channel_profile.csv"), "구분", "채널");
  const productProfile = normalizeSimpleProfile(readCsv("product_profile.csv"), "대분류", "중분류");
  const knowledgeChunks = buildKnowledgeChunks();
  const sourceManifest = buildSourceManifest();

  writeCsv(path.join(outDir, "monthly_summary.normalized.csv"), monthlySummary);
  writeCsv(path.join(outDir, "main_fact.normalized.csv"), mainFact);
  writeCsv(path.join(outDir, "monthly_events.normalized.csv"), monthlyEvents);
  writeCsv(path.join(outDir, "special_products.normalized.csv"), specialProducts);
  writeCsv(path.join(outDir, "channel_profile.normalized.csv"), channelProfile);
  writeCsv(path.join(outDir, "product_profile.normalized.csv"), productProfile);
  writeCsv(path.join(outDir, "knowledge_chunks.normalized.csv"), knowledgeChunks);
  writeCsv(path.join(outDir, "source_files.manifest.csv"), sourceManifest);

  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        rows: {
          monthly_summary: monthlySummary.length,
          main_fact: mainFact.length,
          monthly_events: monthlyEvents.length,
          special_products: specialProducts.length,
          channel_profile: channelProfile.length,
          product_profile: productProfile.length,
          knowledge_chunks: knowledgeChunks.length,
          source_files: sourceManifest.length,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

main();
