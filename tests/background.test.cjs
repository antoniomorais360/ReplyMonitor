const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

process.env.TZ = "America/Manaus";

const storage = new Map();
const notifications = [];
const composeCalls = [];
const composeUpdates = [];
const createdTabs = [];
const recentReplyQueries = [];
const openedMessages = [];
let generatedTrackingId = 0;

function event() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    async emit(...args) { return Promise.all(listeners.map(listener => listener(...args))); },
  };
}

const messenger = {
  identities: {
    async list() {
      return [{ id: "identity-1", email: "owner@example.test" }];
    },
  },
  storage: {
    local: {
      async get(key) {
        if (typeof key === "string") {
          return { [key]: structuredClone(storage.get(key)) };
        }
        return Object.fromEntries(Object.keys(key).map(name => [
          name,
          structuredClone(storage.get(name) ?? key[name]),
        ]));
      },
      async set(values) {
        Object.entries(values).forEach(([key, value]) => storage.set(key, structuredClone(value)));
      },
    },
    onChanged: event(),
  },
  messages: {
    async get(messageId) {
      if ([1, 2, 4, 8, 9, 10, 11, 45].includes(messageId)) {
        return {
          id: messageId,
          subject: messageId === 1
            ? "Original message"
            : messageId === 2
              ? "Re: Original message"
              : messageId === 4
                ? "Project update"
                : messageId === 45
                  ? "Composed message"
                  : `Message ${messageId}`,
          recipients: [`recipient${messageId}@example.test`],
          ccList: ["cc@example.test"],
          bccList: ["bcc@example.test"],
        };
      }
      throw new Error(`Unexpected message ${messageId}`);
    },
    async getFull(messageId) {
      if (messageId === 2) {
        return {
          headers: {
            "in-reply-to": ["<original@example.test>"],
            "message-id": ["<reply@example.test>"],
          },
        };
      }
      if (messageId === 7) {
        return { headers: { references: ["<scan-target@example.test>"] } };
      }
      if (messageId === 8 || messageId === 9) {
        return { headers: { "message-id": [`<message-${messageId}@example.test>`] } };
      }
      if (messageId === 45) {
        return { headers: { "message-id": ["<composed-message@example.test>"] } };
      }
      return { headers: {} };
    },
    async query(queryInfo) {
      recentReplyQueries.push(queryInfo);
      if (queryInfo.headerMessageId === "fallback@example.test") {
        return {
          id: null,
          messages: [{ id: 12, author: "Fallback sender", subject: "Fallback message" }],
        };
      }
      if (queryInfo.subject === "Metadata fallback" && !("fromMe" in queryInfo)) {
        return {
          id: null,
          messages: [{
            id: 13,
            subject: "Metadata fallback",
            author: "Owner <owner@example.test>",
            recipients: ["recipient@example.test"],
          }],
        };
      }
      return {
        id: null,
        messages: [{ id: 7, author: "Recent reply sender", subject: "Re: Scan target", date: "2026-08-23T12:00:00Z" }],
      };
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
  messageDisplay: {
    async open(details) {
      if (details.messageId === 999 || details.headerMessageId === "fallback@example.test") {
        throw new Error("Message is no longer available locally.");
      }
      openedMessages.push(details);
      return { id: openedMessages.length };
    },
  },
  tabs: {
    onRemoved: event(),
    query: async () => [],
    create: async details => { createdTabs.push(details); return { id: createdTabs.length }; },
    update: async () => {},
  },
  alarms: { clear: async () => {}, create: async () => {}, onAlarm: event() },
  notifications: {
    async create(id, options) {
      notifications.push({ id, options });
      return id;
    },
    onClicked: event(),
  },
  compose: {
    async beginNew() {
      throw new Error("compose.beginNew must not be used for follow-ups.");
    },
    async beginReply(messageId, replyType, details) {
      composeCalls.push({ messageId, replyType, details });
      return { id: 41 };
    },
    async getComposeDetails() {
      return { isPlainText: false, body: "<div>Antonio Morais<br></div>" };
    },
    async setComposeDetails(tabId, details) {
      composeUpdates.push({ tabId, details });
    },
    onAfterSend: event(),
  },
};

const crypto = { randomUUID: () => `tracking-${++generatedTrackingId}` };
const context = vm.createContext({ console, crypto, messenger, Date, Map, Set, setTimeout });
vm.runInContext(fs.readFileSync("src/background.js", "utf8"), context);

const parseMessageIds = vm.runInContext("messageIdsFromHeaderValues", context);
const normalizeSettings = vm.runInContext("normalizeSettings", context);
assert.equal(normalizeSettings({}).recentReplyScanDays, 2);
assert.equal(normalizeSettings({ recentReplyScanDays: 1 }).recentReplyScanDays, 1);
assert.equal(normalizeSettings({ recentReplyScanDays: 15 }).recentReplyScanDays, 15);
assert.equal(normalizeSettings({ recentReplyScanDays: 16 }).recentReplyScanDays, 2);
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
const composeFollowUp = vm.runInContext("composeFollowUp", context);
const dateAfterDays = vm.runInContext("dateAfterDays", context);
const scanRecentReplies = vm.runInContext("scanRecentReplies", context);
const createTrackedMessage = vm.runInContext("createTrackedMessage", context);
const getTrackedMessages = vm.runInContext("getTrackedMessages", context);
const updateTrackedMessageDueDate = vm.runInContext("updateTrackedMessageDueDate", context);
const openTrackedMessage = vm.runInContext("openTrackedMessage", context);
const openStoredMessage = vm.runInContext("openStoredMessage", context);

(async () => {
  await markRepliesReceived({
    id: null,
    messages: [{ id: 2, author: "Reply sender", subject: "Re: Original message", date: "2026-08-23T12:00:00Z" }],
  });
  assert.equal(storage.get("trackedMessages")[0].status, "replied");
  assert.equal(storage.get("trackedMessages")[0].replyAuthor, "Reply sender");
  assert.equal(storage.get("trackedMessages")[0].replyMessageId, "<reply@example.test>");

  const originalTrackingId = storage.get("trackedMessages")[0].trackingId;
  await openTrackedMessage(originalTrackingId, "original");
  await openTrackedMessage(originalTrackingId, "reply");
  await openStoredMessage(999, "<fallback@example.test>");
  assert.deepEqual(JSON.parse(JSON.stringify(openedMessages)), [
    { messageId: 1, location: "tab", active: true },
    { messageId: 2, location: "tab", active: true },
    { messageId: 12, location: "tab", active: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(recentReplyQueries[0])), {
    headerMessageId: "fallback@example.test",
  });
  await openStoredMessage(999, null, {
    subject: "Metadata fallback",
    recipients: ["recipient@example.test"],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(openedMessages[3])), {
    messageId: 13,
    location: "tab",
    active: true,
  });

  storage.set("trackedMessages", [{
    trackingId: "sent-message-guard",
    localMessageId: 1,
    messageId: "<original@example.test>",
    subject: "Original message",
    dueDate: "2026-08-30",
    status: "awaiting-reply",
  }]);
  await markRepliesReceived({
    id: null,
    messages: [{
      id: 14,
      author: "Owner <owner@example.test>",
      subject: "Re: Original message",
      date: "2026-08-23T12:00:00Z",
    }],
  });
  assert.equal(storage.get("trackedMessages")[0].status, "awaiting-reply");

  storage.set("trackedMessages", [{
    trackingId: "overdue-tracking",
    localMessageId: 3,
    messageId: "<overdue@example.test>",
    dueDate: "2000-01-01",
    status: "awaiting-reply",
  }]);
  assert.equal(await showOverdueReminder(), true);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].options.message, /1 reply is overdue/);
  await messenger.notifications.onClicked.emit("reply-monitor-overdue");
  assert.deepEqual(JSON.parse(JSON.stringify(createdTabs)), [{
    url: "moz-extension://reply-monitor/dashboard/index.html",
  }]);

  assert.equal(
    dateAfterDays(1, new Date("2026-08-24T02:30:00Z")),
    "2026-08-24"
  );

  storage.set("settings", {
    reminderTemplate: "Hello, please share an update.",
    includeCc: true,
    includeBcc: false,
  });
  storage.set("trackedMessages", [{
    trackingId: "follow-up-tracking",
    localMessageId: 4,
    messageId: "<follow-up@example.test>",
    subject: "Project update",
    recipients: ["recipient4@example.test"],
    ccRecipients: ["cc@example.test"],
    bccRecipients: ["bcc@example.test"],
    dueDate: "2026-08-30",
    status: "awaiting-reply",
  }]);
  assert.equal((await composeFollowUp("follow-up-tracking")).tabId, 41);
  assert.equal(composeCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(composeCalls[0])), {
    messageId: 4,
    replyType: "replyToAll",
    details: {
      to: ["recipient4@example.test"],
      cc: ["cc@example.test"],
      subject: "Re: Project update",
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(composeUpdates)), [{
    tabId: 41,
    details: {
      body: "Hello, please share an update.<br><br>Regarding: Project update<br><br>Best regards,<br><br><div>Antonio Morais<br></div>",
    },
  }]);

  await messenger.compose.onAfterSend.emit(
    { id: 41 },
    { headerMessageId: "<follow-up-sent@example.test>", messages: [{ id: 44 }] }
  );
  const sentFollowUp = (await getTrackedMessages()).find(entry =>
    entry.trackingId === "follow-up-tracking"
  );
  assert.deepEqual(sentFollowUp.messageIds, ["<follow-up-sent@example.test>"]);
  assert.equal(sentFollowUp.localMessageId, 4);
  assert.equal(sentFollowUp.originalMessageLocalId, 4);
  assert.equal(sentFollowUp.followUpMessageLocalId, 44);

  await messenger.runtime.onMessage.emit({
    type: "set-compose-tracking",
    tabId: 50,
    dueDate: "2026-09-05",
  });
  const [composeTracking] = await messenger.runtime.onMessage.emit({
    type: "get-compose-tracking",
    tabId: 50,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(composeTracking)), {
    dueDate: "2026-09-05",
  });
  await messenger.compose.onAfterSend.emit(
    { id: 50 },
    { headerMessageId: "<composed-message@example.test>", messages: [{ id: 45 }] }
  );
  const composedTracking = (await getTrackedMessages()).find(entry =>
    entry.messageId === "<composed-message@example.test>"
  );
  assert.equal(composedTracking.localMessageId, 45);
  assert.equal(composedTracking.dueDate, "2026-09-05");

  storage.set("trackedMessages", [{
    trackingId: "scan-tracking",
    localMessageId: 6,
    messageId: "<scan-target@example.test>",
    subject: "Scan target",
    dueDate: "2026-08-30",
    status: "awaiting-reply",
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await scanRecentReplies())), { scanned: 1, detected: 1 });
  assert.equal(storage.get("trackedMessages")[0].status, "replied");
  assert.equal(recentReplyQueries.length, 3);
  assert.equal("fromMe" in recentReplyQueries[2], false);
  assert.equal(recentReplyQueries[2].subject, "Scan target");
  assert.ok(recentReplyQueries[2].fromDate instanceof Date);

  storage.set("trackedMessages", []);
  await Promise.all([
    createTrackedMessage(8, "2026-08-30"),
    createTrackedMessage(9, "2026-08-30"),
  ]);
  assert.equal((await getTrackedMessages()).length, 2);

  storage.set("trackedMessages", []);
  await createTrackedMessage(10, "2026-08-30");
  await createTrackedMessage(11, "2026-08-30");
  assert.equal((await getTrackedMessages()).length, 2);

  await assert.rejects(
    updateTrackedMessageDueDate("tracking-unknown", "2026-02-30"),
    /valid due date/
  );
  const originalGetFull = messenger.messages.getFull;
  const originalSet = messenger.storage.local.set;
  let reads = 0;
  let writes = 0;
  messenger.messages.getFull = async () => { reads++; return { headers: {} }; };
  messenger.storage.local.set = async values => { writes++; await originalSet(values); };
  storage.set("trackedMessages", []);
  await markRepliesReceived({ id: null, messages: [{ id: 100 }] });
  assert.equal(reads, 0, "No message reads without pending records");
  assert.equal(writes, 0, "No unchanged storage writes");

  const pendingRecord = {
    trackingId: "slow-scan", originalMessageLocalId: 6, localMessageId: 6,
    messageId: "<slow@example.test>", status: "awaiting-reply",
  };
  storage.set("trackedMessages", [pendingRecord]);
  let releaseRead;
  let signalRead;
  const readStarted = new Promise(resolve => { signalRead = resolve; });
  messenger.messages.getFull = async () => {
    reads++;
    signalRead();
    await new Promise(resolve => { releaseRead = resolve; });
    return { headers: {} };
  };
  const slowScan = markRepliesReceived({ id: null, messages: [{ id: 101 }, { id: 102 }] });
  await readStarted;
  const remove = vm.runInContext("removeTrackedMessage", context);
  await remove("slow-scan");
  assert.equal(storage.get("trackedMessages").length, 0, "Removal does not wait for the message read");
  releaseRead();
  await slowScan;
  assert.equal(reads, 1, "Removing the last record stops subsequent reads");

  storage.set("trackedMessages", [pendingRecord]);
  messenger.messages.getFull = async id => {
    if (id === 103) throw new Error("Unavailable");
    return { headers: {} };
  };
  let pages = 0;
  messenger.messages.continueList = async () => {
    pages++;
    return { id: null, messages: [{ id: 104 }] };
  };
  const writeCount = writes;
  const result = await markRepliesReceived({ id: "next", messages: [{ id: 103 }] });
  assert.equal(result.scanned, 2, "Read failures do not prevent subsequent pages");
  assert.equal(pages, 1);
  assert.equal(writes, writeCount, "Unmatched scan does not rewrite storage");
  messenger.messages.getFull = originalGetFull;
  messenger.storage.local.set = originalSet;
  const automaticScan = vm.runInContext("scanAutomatically", context);
  const queryCount = recentReplyQueries.length;
  const skipped = await automaticScan();
  assert.equal(skipped.skipped, true, "Automatic scans respect the cooldown");
  assert.equal(recentReplyQueries.length, queryCount);
  vm.runInContext("lastScanCompletedAt = 0", context);
  storage.set("settings", { autoScanOnOpen: false });
  assert.equal((await automaticScan()).skipped, true, "Automatic scanning can be disabled");
  await scanRecentReplies();
  assert.ok(recentReplyQueries.length > queryCount, "Manual scans bypass the automatic preference");
  await messenger.runtime.onMessage.emit({ type: "set-compose-tracking", tabId: 99, dueDate: "2026-12-01" });
  await messenger.tabs.onRemoved.emit(99);
  assert.equal((await messenger.runtime.onMessage.emit({ type: "get-compose-tracking", tabId: 99 }))[0], null);
  console.log("background.test.cjs: passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
