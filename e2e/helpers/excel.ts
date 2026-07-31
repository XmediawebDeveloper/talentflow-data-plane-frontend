/**
 * Excel test-data helpers.
 *
 * Flow: global-setup.ts converts every workbook in e2e/data/ to a matching
 * .json file before the run. Spec files then call loadRowsSync("<name>") at
 * module scope so Playwright can generate one test() per Excel row.
 * (exceljs reads are async and test collection must be synchronous — hence
 * the JSON intermediate step.)
 */
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export const DATA_DIR = path.join(__dirname, "..", "data");

/** Rows of the login/auth data sheets (testdata.xlsx, auth-cases.xlsx). */
export interface LoginRow {
  test_case: string;
  email: string;
  password: string;
  expected: "success" | "failure";
  expected_message: string;
}

/** Read one workbook's first sheet as objects keyed by the header row. */
async function readSheet(xlsxPath: string): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.worksheets[0];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.value ?? "")));

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    headers.forEach((header, col) => {
      if (!header) return;
      const cell = row.getCell(col);
      obj[header] = cell.value == null ? "" : String(cell.text ?? cell.value);
    });
    rows.push(obj);
  });
  return rows;
}

/**
 * Convert every .xlsx in e2e/data/ to a sibling .json file.
 * master-test-cases.xlsx is the extracted tracking inventory, not test input —
 * skip it so we don't spend seconds parsing 2,700 rows on every run.
 */
export async function xlsxToJson(): Promise<void> {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$") && f !== "master-test-cases.xlsx");

  for (const file of files) {
    const rows = await readSheet(path.join(DATA_DIR, file));
    const jsonPath = path.join(DATA_DIR, file.replace(/\.xlsx$/, ".json"));
    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  }
}

/**
 * Synchronously load a converted sheet — safe to call at spec module scope.
 * `name` is the workbook basename without extension, e.g. "testdata".
 */
export function loadRowsSync<T = LoginRow>(name: string): T[] {
  const jsonPath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(jsonPath)) return [];
  return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
}
