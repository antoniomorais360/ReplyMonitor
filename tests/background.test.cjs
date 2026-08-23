const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const notifications = [];

function event() {
  return { addListener() {} };
}

const messenger = {
  storage: {
    local: {
      async get(key) {
        if (typeof key === "string") return { [key]: storage.get(key) };
        return Object.fromEntries(Object.keys(key).map(name => [name, storage.get(name) ?? key[name]]));
      },
      async set(values) {
        Object.entries(values).forEach(([key, value]) => storage.set(key, value));
      },
    },
    onChanged: event(),
  },
  messages: {
    async getFull(messageId) {
      if (messageId === 2) {
        return { headers: { "in-reply-to": ["<original@example.test>"] } };
      }
      return { headers: {} };
    },
    async continueList() { return null; },
    onNewMailReceived: event(),
  },
  menus: { removeAll: async () => {}, create() {}, onClicked: event() },
  runtime: {
    getURL(path) { return `moz-extension://reply-monitor/${path}`; },
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
  },
  action: { onClicked: event() },
  tabs: { query: async () => [], create: async () => {}, update: async () => {} },
  alarms: { clear: async () => {}, create: async () => {}, onAlarm: event() },
  notifications: {
    async create(id, options) {
      notifications.push({ id, options });
      return id;
    },
  },
};

const context = vm.createContext({ console, messenger, Date, Set });
vm.runInContext(fs.readFileSync("src/background.js", "utf8"), context);

const parseMessageIds = vm.runInContext("messageIdsFromHeaderValues", context);
assert.deepEqual(
  [...parseMessageIds(["<one@example.test> <two@example.test>"])],
  ["<one@example.test>", "<two@example.test>"]
);

storage.set("trackedMessages", [{
  localMessageId: 1,
  messageId: "<original@example.test>",
  subject: "Original message",
  dueDate: "2000-01-01",
  status: "awaiting-reply",
}]);

const markRepliesReceived = vm.runInContext("markRepliesReceived", context);
const showOverdueReminder = vm.runInContext("showOverdueReminder", context);

(async () => {
  await markRepliesReceived({
    id: null,
    messages: [{ id: 2, author: "Reply sender", subject: "Re: Original message", date: "2026-08-23T12:00:00Z" }],
  });
  assert.equal(storage.get("trackedMessages")[0].status, "replied");
  assert.equal(storage.get("trackedMessages")[0].replyAuthor, "Reply sender");

  storage.set("trackedMessages", [{
    localMessageId: 3,
    messageId: "<overdue@example.test>",
    dueDate: "2000-01-01",
    status: "awaiting-reply",
  }]);
  assert.equal(await showOverdueReminder(), true);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].options.message, /1 reply is overdue/);
  console.log("background.test.cjs: passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
