/**
 * Generates e2e/data/auth-cases.xlsx — login cases traced back to the master
 * tracking workbook (Scrum 1031: "Sign-in Mail ID – Case Sensitive").
 * Run with: node e2e/scripts/create-auth-cases-xlsx.mjs
 */
import ExcelJS from "exceljs";

const rows = [
  // tc_id      | scrum_id   | test_case                          | email                  | password    | expected | expected_message
  ["TC-A01", "Scrum 1031", "Login with lowercase email",        "admin@talentflow.com", "Admin@123", "success", ""],
  ["TC-A02", "Scrum 1031", "Login with UPPERCASE email",        "ADMIN@TALENTFLOW.COM", "Admin@123", "success", ""],
  ["TC-A03", "Scrum 1031", "Login with Mixed Case email",       "Admin@TalentFlow.com", "Admin@123", "success", ""],
  ["TC-A04", "Scrum 1031", "Email with leading/trailing spaces", " admin@talentflow.com ", "Admin@123", "success", ""],
  ["TC-A05", "Scrum 1031", "Case variation with wrong password", "ADMIN@TALENTFLOW.COM", "wrongpass", "failure", "Invalid email or password"],
  ["TC-A06", "—",          "Unknown user rejected",             "nouser@talentflow.com", "Admin@123", "failure", "Invalid email or password"],
  ["TC-A07", "—",          "Empty password blocked client-side", "admin@talentflow.com", "",          "failure", ""],
  ["TC-A08", "—",          "Empty email blocked client-side",   "",                     "Admin@123", "failure", ""],
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("AuthCases");
ws.addRow(["tc_id", "scrum_id", "test_case", "email", "password", "expected", "expected_message"]);
ws.getRow(1).font = { bold: true };
rows.forEach((r) => ws.addRow(r));
ws.columns.forEach((c, i) => (c.width = [10, 12, 36, 26, 14, 10, 30][i] || 20));

await wb.xlsx.writeFile(new URL("../data/auth-cases.xlsx", import.meta.url).pathname);
console.log("✅ e2e/data/auth-cases.xlsx created with", rows.length, "cases");
