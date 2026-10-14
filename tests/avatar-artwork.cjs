// Raster regression checks for opacity and occlusion; no test accounts or database writes.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.AVATAR_TEST_URL;
assert(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Set AVATAR_TEST_URL to the local preview.");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let checks = 0;
  const check = (ok, message) => { assert(ok, message); checks++; };
  await page.goto(base);
  async function svg(params) {
    const response = await page.request.get(base + "/avatars/render?" + new URLSearchParams(params));
    assert(response.ok());
    return response.text();
  }
  async function occlusion(markup, layers, points) {
    return page.evaluate(async ({ markup, layers, points }) => {
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      if (doc.querySelector("parsererror")) return false;
      const render = async source => {
        const image = new Image();
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 520;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0, 320, 520);
        return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
      };
      const before = await render(markup);
      layers.forEach(layer => doc.querySelectorAll('[data-avatar-layer="' + layer + '"]').forEach(el => el.remove()));
      const after = await render(new XMLSerializer().serializeToString(doc));
      return JSON.stringify(before) === JSON.stringify(after);
    }, { markup, layers, points });
  }
  try {
    for (const skin of ["light", "warm", "golden", "tan", "brown", "deep"]) {
      for (const face of ["oval", "round", "angular"]) {
        const markup = await svg({ Skin: skin, Face: face, Hair: "ponytail", HairColor: "silver" });
        check(await occlusion(markup, ["neck", "ears"], [[160, 201], [113, 140], [204, 140]]), "Ears and neck do not affect pixels inside face: " + skin + "/" + face);
      }
    }
    for (const top of ["tee", "sweatshirt", "hoodie", "shirt", "jacket", "knit"]) {
      for (const emotion of ["Neutral", "Happy", "Surprised"]) {
        const markup = await svg({ Top: top, emotion });
        check(await occlusion(markup, ["arms-back"], [[118, 242], [202, 242]]), "Torso covers shoulder joins: " + top + "/" + emotion);
      }
    }
    const emotions = ["Neutral", "Happy", "Thinking", "Surprised", "Sad", "Supportive"];
    const emotionLabels = { Neutral: "Спокойствие", Happy: "Радость", Thinking: "Задумчивость", Surprised: "Удивление", Sad: "Грусть", Supportive: "Поддержка" };
    const topLabels = { tee: "Футболка", shirt: "Рубашка", hoodie: "Худи" };
    const variants = [];
    for (const top of ["tee", "shirt", "hoodie"]) {
      for (const emotion of emotions) {
        const markup = await svg({ Skin: "golden", Face: "oval", Hair: "ponytail", HairColor: "silver", Eyes: "round", Accessory: "earrings", Top: top, TopColor: "slate", Background: "plain", emotion });
        variants.push({ top, emotion, markup });
      }
    }
    await page.setContent('<html lang="ru"><body style="margin:0;padding:24px;background:#f1f0ec;font-family:Arial"><h1 style="font-size:24px">Лицо и позы после исправлений</h1><main style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px">' +
      variants.map(({ top, emotion, markup }) => '<figure style="margin:0;padding:8px;background:white;border-radius:12px"><img width="210" height="342" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup) + '"/><figcaption style="text-align:center">' + topLabels[top] + ' · ' + emotionLabels[emotion] + '</figcaption></figure>').join("") + '</main></body></html>');
    await page.locator("img").evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
    fs.mkdirSync(".run-avatar", { recursive: true });
    await page.screenshot({ path: path.resolve(".run-avatar/avatar-anatomy-sheet.png"), fullPage: true });
    await page.setContent('<html lang="ru"><body style="margin:0;padding:24px;background:#f1f0ec;color:#101b34;font-family:Arial"><h1 style="font-size:24px">Исправленные лицо, рукава и жесты</h1><main style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px">' +
      variants.filter(item => item.top === "tee").map(({ emotion, markup }) => '<figure style="margin:0;padding:8px;background:white;border-radius:12px"><img style="width:100%;height:auto" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup) + '"/><figcaption style="text-align:center">' + emotionLabels[emotion] + '</figcaption></figure>').join("") + '</main></body></html>');
    await page.locator("img").evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
    await page.setViewportSize({ width: 1440, height: 480 });
    await page.screenshot({ path: path.resolve(".run-avatar/avatar-emotions-fixed.png"), fullPage: true });
    console.log("Avatar artwork checks passed: " + checks);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
