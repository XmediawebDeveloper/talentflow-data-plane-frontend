/**
 * Extracts every test-check row ("What to Check" / "Expected Result") from the
 * sprint sheets of the master tracking workbook into one consolidated Excel:
 * e2e/data/master-test-cases.xlsx
 *
 * Usage: node e2e/scripts/extract-master-test-cases.mjs "/path/to/Jira Points - RMS SAAS .xlsx"
 */
import ExcelJS from "exceljs";

const SOURCE = process.argv[2] || "/root/data_plane/Jira Points - RMS SAAS .xlsx";

// Data-plane relevant sheets (control-plane sheets belong to the other repo).
const SHEETS = [
  "Sprint 2 (JD)",
  "Sprint - 3(ResumeDB)",
  "Sprint -4(Assessment)",
  "Sprint - 5(RBAC)",
  "Sprint-6 (Api) (MVP-2)",
  "Sprint 7 (Audit Logs)",
  "Sprint 8 -AI Interview (Type 1 ",
  "Sprint 8 (AI Interview) Type 2",
  "Sprint-11 (Team )",
  "Sprint -10 (Enhancement) ",
  "Sprint 12",
  "BUGS",
  "Jira Issue ",
];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);

const out = new ExcelJS.Workbook();
const ws = out.addWorksheet("MasterTestCases");
ws.addRow([
  "tc_id", "source_sheet", "scrum_id", "module", "title",
  "what_to_check", "expected_result", "status", "automatable",
]);
ws.getRow(1).font = { bold: true };

let tcNum = 0;
for (const name of SHEETS) {
  const sheet = wb.worksheets.find((w) => w.name === name || w.name.trim() === name.trim());
  if (!sheet) { console.warn("SKIP (not found):", name); continue; }

  // Find header row (within first 5 rows) and map column indexes by header text.
  let headerRow = null, cols = {};
  for (let r = 1; r <= 5 && !headerRow; r++) {
    const map = {};
    sheet.getRow(r).eachCell((cell, col) => {
      let t = "";
      try { t = String(cell.text || "").trim().toLowerCase(); } catch { return; }
      if (t === "what to check") map.check = col;
      else if (t === "expected result" || t === "expected results") map.expected = col;
      else if (t === "title") map.title = col;
      else if (t === "module") map.module = col;
      else if (t.startsWith("scrum") || t === "bug id") map.scrum = col;
      else if (t.includes("status")) map.status = map.status || col;
    });
    if (map.check && map.expected) { headerRow = r; cols = map; }
  }
  if (!headerRow) { console.warn("SKIP (no What to Check header):", name.trim()); continue; }

  let count = 0;
  sheet.eachRow((row, n) => {
    if (n <= headerRow) return;
    const get = (c) => {
      if (!c) return "";
      try { return String(row.getCell(c).text || "").trim(); } catch { return ""; }
    };
    const check = get(cols.check);
    const expected = get(cols.expected);
    if (!check && !expected) return;
    tcNum++;
    count++;
    ws.addRow([
      `TC-${String(tcNum).padStart(4, "0")}`,
      name.trim(),
      get(cols.scrum),
      get(cols.module),
      get(cols.title),
      check,
      expected,
      get(cols.status),
      "", // automatable: to be triaged (yes / no / partial)
    ]);
  });
  console.log(name.trim().padEnd(34), "→", count, "cases");
}

ws.columns.forEach((c, i) => (c.width = [10, 26, 14, 18, 30, 60, 60, 14, 12][i] || 20));
const dest = new URL("../data/master-test-cases.xlsx", import.meta.url).pathname;
await out.xlsx.writeFile(dest);
console.log(`\n✅ TOTAL ${tcNum} test cases → ${dest}`);
