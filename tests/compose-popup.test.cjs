const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

process.env.TZ = "America/Manaus";

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-08-24T02:30:00Z"]));
  }
}

function element() {
  return {
    addEventListener() {},
    hidden: false,
    textContent: "",
    value: "",
  };
}

const elements = new Map();
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  },
};

const messenger = {
  tabs: { async query() { return [{ id: 41 }]; } },
  compose: { async getComposeDetails() { return { subject: "Project update" }; } },
  runtime: { async sendMessage() { return null; } },
};

const context = vm.createContext({ console, Date: FixedDate, document, messenger });
vm.runInContext(fs.readFileSync("compose/track.js", "utf8"), context);

const defaultDueDate = vm.runInContext("defaultDueDate", context);
assert.equal(defaultDueDate(), "2026-08-30");
console.log("compose-popup.test.cjs: passed");
