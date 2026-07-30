/**
 * One-off script: generates e2e/data/testdata.xlsx with sample login test cases.
 * Run with: node e2e/scripts/create-sample-xlsx.mjs
 * Edit the rows below (or edit the .xlsx directly in Excel) to change test data.
 */
import ExcelJS from "exceljs";

const rows = [
  // test_case            | email                  | password      | expected  | expected_message
  ["Valid login",          "admin@talentflow.com",  "Admin@123",    "success",  ""],
  ["Wrong password",       "admin@talentflow.com",  "wrongpass",    "failure",  "Invalid email or password"],
  ["Unknown user",         "nouser@talentflow.com", "Admin@123",    "failure",  "Invalid email or password"],
  ["Empty password",       "admin@talentflow.com",  "",             "failure",  ""],
  ["Invalid email format", "not-an-email",          "Admin@123",    "failure",  ""],
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("LoginTests");
ws.addRow(["test_case", "email", "password", "expected", "expected_message"]);
ws.getRow(1).font = { bold: true };
rows.forEach((r) => ws.addRow(r));
ws.columns.forEach((c) => (c.width = 26));

await wb.xlsx.writeFile(new URL("../data/testdata.xlsx", import.meta.url).pathname);
console.log("✅ e2e/data/testdata.xlsx created with", rows.length, "test cases");
