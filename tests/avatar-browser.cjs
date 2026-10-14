// Run against a prepared local database. Creates temporary test accounts with runtime-only passwords.
// Requires Playwright and Edge; screenshots go to the ignored .run-avatar directory.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.AVATAR_TEST_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Set AVATAR_TEST_URL to the local preview.");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const failures = [];
  const first = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await first.newPage();
  page.on("pageerror", error => failures.push(error.message));
  let checks = 0;
  const check = (condition, message) => { assert(condition, message); checks++; };
  const out = path.resolve(".run-avatar");
  fs.mkdirSync(out, { recursive: true });
  async function register(context) {
    const p = await context.newPage();
    await p.goto(base + "/account/register");
    await p.locator("#Email").fill("avatar-check-" + crypto.randomUUID() + "@example.invalid");
    await p.locator("#Password").fill(crypto.randomBytes(18).toString("base64url"));
    await Promise.all([p.waitForURL("**/profile/avatar?onboarding=true"), p.getByRole("button", { name: "Зарегистрироваться", exact: true }).click()]);
    return p;
  }
  try {
    for (const asset of ["/css/theme-green.css", "/css/avatar.css", "/js/nav.js", "/js/avatar-editor.js"]) {
      for (const encoding of ["identity", "gzip", "br"]) {
        const response = await page.request.get(base + asset, { headers: { "Accept-Encoding": encoding } });
        const body = await response.body();
        check(response.ok() && body.length > 100, "Static asset is not empty with " + encoding + ": " + asset);
      }
    }
    const anonymous = await page.request.get(base + "/profile/avatar", { maxRedirects: 0 });
    check(anonymous.status() === 302, "Editor requires authentication.");
    for (const query of ["Hair=unknown", "HairColor=%3Cscript%3E", "emotion=99", "portrait=invalid"]) {
      const response = await page.request.get(base + "/avatars/render?" + query);
      check(response.status() === 400, "Renderer rejects unknown values: " + query);
    }
    const p = await register(first);
    p.on("pageerror", error => failures.push(error.message));
    check(await p.getByRole("link", { name: "Пропустить →", exact: true }).isVisible(), "Registration is skippable.");
    const hairButton = p.getByRole("button", { name: "Волосы", exact: true });
    await hairButton.focus(); await p.keyboard.press("Enter");
    check(await p.locator("#avatar-panel-hair").isVisible(), "Category works with keyboard.");
    await p.locator("#avatar-Hair-short").focus(); await p.keyboard.press("ArrowRight");
    check(await p.locator("#avatar-Hair-waves").isChecked(), "Native radio keyboard navigation.");
    await p.locator('label[for="avatar-Hair-bob"]').click();
    await p.locator('label[for="avatar-HairColor-copper"]').click();
    await p.getByRole("button", { name: "Одежда", exact: true }).click();
    await p.locator('label[for="avatar-Top-hoodie"]').click();
    check((await p.locator("#avatar-preview-image").getAttribute("src")).includes("Hair=bob"), "Live preview uses chosen details.");
    check(await p.locator('input[name*="Pants"],input[name*="Shoes"]').count() === 0, "Lower clothes remain fixed.");
    await Promise.all([p.waitForURL(base + "/"), p.getByRole("button", { name: "Сохранить и продолжить", exact: true }).click()]);
    await p.goto(base + "/profile");
    check((await p.locator(".profile-identity img").getAttribute("src")).includes("Hair=bob"), "Avatar persists in profile.");
    check((await p.locator(".header-actions .profile-avatar img").getAttribute("src")).includes("Top=hoodie"), "Header uses saved clothing.");
    await p.goto(base + "/profile/avatar");
    check(await p.locator("#avatar-Hair-bob").isChecked(), "Reload restores choices from database.");
    const token = await p.locator('#avatar-form input[name="__RequestVerificationToken"]').inputValue();
    const noCsrf = await p.request.post(base + "/profile/avatar", { form: { "Options.Hair": "long" }, maxRedirects: 0 });
    check(noCsrf.status() === 400, "Saving requires CSRF token.");
    const invalid = await p.request.post(base + "/profile/avatar", {
      form: { __RequestVerificationToken: token, "Options.HairColor": "#fff;script", "Options.Hair": "long" }, maxRedirects: 0
    });
    check(invalid.status() === 200 && (await invalid.text()).includes("validation-summary-errors"), "Invalid details return a safe editor with validation.");
    await p.reload();
    check(await p.locator("#avatar-Hair-bob").isChecked(), "Rejected save does not alter database.");
    await p.getByRole("button", { name: "Волосы", exact: true }).click();
    await p.locator('label[for="avatar-Hair-long"]').click();
    await p.getByRole("link", { name: "Отмена", exact: true }).click();
    await p.goto(base + "/profile/avatar");
    check(await p.locator("#avatar-Hair-bob").isChecked(), "Cancel does not save preview.");
    const second = await browser.newContext();
    const other = await register(second);
    await other.getByRole("link", { name: "Пропустить →", exact: true }).click();
    await other.goto(base + "/profile/avatar");
    check(await other.locator("#avatar-Hair-waves").isChecked(), "Skipping leaves default avatar; accounts are isolated.");
    await second.close();
    await p.getByRole("button", { name: "Волосы", exact: true }).click();
    await p.screenshot({ path: path.join(out, "avatar-desktop.png"), fullPage: true });
    for (const width of [360, 600, 768, 1024, 1280, 1920]) {
      await p.setViewportSize({ width, height: 1000 });
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow at " + width);
      check(await p.getByRole("button", { name: "Сохранить аватар", exact: true }).isVisible(), "Save remains available at " + width);
    }
    await p.setViewportSize({ width: 360, height: 900 });
    await p.screenshot({ path: path.join(out, "avatar-mobile.png"), fullPage: true });
    await p.getByRole("button", { name: "Лицо", exact: true }).click();
    await p.evaluate(() => {
      const elements = [...document.querySelectorAll("body *")];
      const sizes = elements.map(el => parseFloat(getComputedStyle(el).fontSize));
      elements.forEach((el, i) => { if (sizes[i] > 0) el.style.fontSize = sizes[i] * 2 + "px"; });
    });
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow with enlarged text.");
    await p.goto(base + "/translate");
    const avatarUrl = await p.locator("#exercise-avatar img").getAttribute("src");
    check(avatarUrl.includes("Hair=bob") && avatarUrl.includes("Top=hoodie"), "Exercises use the saved avatar.");
    await p.evaluate(() => AdamAvatar.setEmotion(document.getElementById("exercise-avatar"), "Supportive"));
    check((await p.locator("#exercise-avatar img").getAttribute("src")).includes("emotion=Supportive"), "Exercise can change emotion without changing appearance.");
    for (const emotion of ["Neutral", "Happy", "Thinking", "Surprised", "Sad", "Supportive"]) {
      const response = await p.request.get(base + "/avatars/render?emotion=" + emotion);
      check(response.ok() && (await response.text()).includes('<svg xmlns='), "Valid SVG for " + emotion);
    }
    for (const top of ["sweatshirt", "hoodie", "tee", "shirt", "jacket", "knit"]) {
      const response = await p.request.get(base + "/avatars/render?Top=" + top);
      const svg = await response.text();
      check(response.ok() && await p.evaluate(svg => !new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror"), svg), "Valid clothing SVG: " + top);
    }
    const shirt = await (await p.request.get(base + "/avatars/render?Top=shirt")).text();
    const jacket = await (await p.request.get(base + "/avatars/render?Top=jacket")).text();
    check(shirt !== jacket, "Shirt and jacket have distinct artwork.");
    const plainContext = await browser.newContext({ javaScriptEnabled: false, storageState: await first.storageState() });
    const plain = await plainContext.newPage();
    await plain.goto(base + "/profile/avatar");
    check(await plain.locator("#avatar-panel-clothes").isVisible(), "All categories remain available without JavaScript.");
    await plain.locator('label[for="avatar-Hair-short"]').click();
    await Promise.all([plain.waitForURL("**/profile"), plain.getByRole("button", { name: "Сохранить аватар", exact: true }).click()]);
    check((await plain.locator(".profile-identity img").getAttribute("src")).includes("Hair=short"), "Plain HTML form saves without JavaScript.");
    await plainContext.close();
    check(failures.length === 0, "No JavaScript exceptions.");
    console.log("Avatar browser checks passed: " + checks);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
