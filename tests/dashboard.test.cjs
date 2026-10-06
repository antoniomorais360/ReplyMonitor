const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const elements = new Map();
function element() {
  return { listeners: {}, children: [], addEventListener(name, fn) { this.listeners[name] = fn; } };
}
const document = { querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, element());
  return elements.get(selector);
} };
let send = () => new Promise(() => {});
const context = vm.createContext({ document, console: { error() {} }, setTimeout, clearTimeout,
  messenger: { runtime: { sendMessage: request => send(request) }, storage: { onChanged: { addListener() {} } } },
});
vm.runInContext(fs.readFileSync("dashboard/dashboard.js", "utf8"), context);
const click = elements.get("main").listeners.click;
const card = { dataset: { trackingId: "one" }, remove() { this.removed = true; } };
const button = { dataset: { action: "stop-tracking" }, closest: () => card, disabled: false };
const event = { target: { closest: () => button } };
vm.runInContext('dashboardData = { today: "2026-10-06", items: [{ trackingId: "one", status: "awaiting-reply" }] }', context);
(async () => {
  let complete;
  let calls = 0;
  send = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  const pending = click(event);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Removing…");
  await click(event);
  assert.equal(calls, 1);
  complete();
  await pending;
  assert.equal(card.removed, true);
  assert.equal(elements.get("#total-count").textContent, 0);
  assert.equal(button.disabled, false);

  card.removed = false;
  send = async () => { throw new Error("Storage unavailable"); };
  await click(event);
  assert.equal(card.removed, false);
  assert.equal(button.disabled, false);
  assert.match(elements.get("#status").value, /Storage unavailable/);

  vm.runInContext('renderDashboard = data => { dashboardData = data; }', context);
  const refresh = vm.runInContext("refreshDashboard", context);
  const resolvers = [];
  send = () => new Promise(resolve => resolvers.push(resolve));
  const old = refresh();
  const fresh = refresh();
  resolvers[1]({ marker: "fresh" });
  await fresh;
  resolvers[0]({ marker: "old" });
  await old;
  assert.equal(vm.runInContext("dashboardData.marker", context), "fresh");
  console.log("dashboard.test.cjs: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
