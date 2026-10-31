import base from "./playwright.config";
export default { ...base, retries: 0, projects: [{ name: "chrome", use: { browserName: "chromium" as const, channel: "chrome" } }] };
