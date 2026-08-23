/* global messenger */

const STORAGE_KEY = "settings";
const TRACKED_MESSAGES_KEY = "trackedMessages";
const DEFAULT_DUE_DAYS = 7;
const REMINDER_ALARM_NAME = "overdue-reply-reminder";

const defaultSettings = Object.freeze({
  enabled: true,
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
  remindersEnabled: true,
  reminderHour: 9,
});

async function ensureSettings() {
  const { [STORAGE_KEY]: settings } = await messenger.storage.local.get(STORAGE_KEY);
  if (settings) {
    return { ...defaultSettings, ...settings };
  }

  await messenger.storage.local.set({ [STORAGE_KEY]: defaultSettings });
  return defaultSettings;
}

function dateAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayAsIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextReminderTime(reminderHour) {
  const next = new Date();
  next.setHours(reminderHour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

async function getTrackedMessages() {
  const { [TRACKED_MESSAGES_KEY]: trackedMessages = [] } =
    await messenger.storage.local.get(TRACKED_MESSAGES_KEY);
  return trackedMessages;
}

function normalizeMessageId(messageId) {
  return messageId?.trim().toLowerCase() ?? null;
}

function messageIdsFromHeaderValues(headerValues = []) {
  return headerValues.flatMap(value => value.match(/<[^>]+>/g) ?? []);
}

async function allMessagesInList(messageList) {
  const messages = [];
  let currentList = messageList;
  while (currentList) {
    messages.push(...currentList.messages);
    currentList = currentList.id
      ? await messenger.messages.continueList(currentList.id)
      : null;
  }
  return messages;
}

async function saveTrackedMessages(trackedMessages) {
  await messenger.storage.local.set({ [TRACKED_MESSAGES_KEY]: trackedMessages });
}

async function scheduleReminderAlarm() {
  const settings = await ensureSettings();
  await messenger.alarms.clear(REMINDER_ALARM_NAME);
  if (!settings.enabled || !settings.remindersEnabled) return;

  await messenger.alarms.create(REMINDER_ALARM_NAME, {
    when: nextReminderTime(settings.reminderHour),
    periodInMinutes: 24 * 60,
  });
}

async function showOverdueReminder({ force = false } = {}) {
  const settings = await ensureSettings();
  if (!force && (!settings.enabled || !settings.remindersEnabled)) return false;

  const overdueMessages = (await getTrackedMessages()).filter(entry =>
    entry.status !== "replied" && entry.dueDate < todayAsIsoDate()
  );
  if (overdueMessages.length === 0 && !force) return false;

  const count = overdueMessages.length;
  const message = count === 0
    ? "There are no overdue replies right now."
    : `${count} ${count === 1 ? "reply is" : "replies are"} overdue.`;
  await messenger.notifications.create("reply-monitor-overdue", {
    type: "basic",
    iconUrl: messenger.runtime.getURL("icons/reply-monitor.svg"),
    title: "Reply Monitor",
    message,
  });
  return true;
}

async function createTrackedMessage(messageId, dueDate) {
  const message = await messenger.messages.get(messageId);
  const fullMessage = await messenger.messages.getFull(messageId);
  const messageHeaderId = fullMessage.headers?.["message-id"]?.[0] ?? null;
  const trackedMessages = await getTrackedMessages();
  const existingIndex = trackedMessages.findIndex(entry =>
    entry.messageId === messageHeaderId || entry.localMessageId === messageId
  );
  const entry = {
    localMessageId: messageId,
    messageId: messageHeaderId,
    subject: message.subject,
    author: message.author,
    recipients: message.recipients,
    dueDate,
    createdAt: new Date().toISOString(),
    status: "awaiting-reply",
  };

  if (existingIndex >= 0) {
    trackedMessages[existingIndex] = { ...trackedMessages[existingIndex], ...entry };
  } else {
    trackedMessages.push(entry);
  }
  await saveTrackedMessages(trackedMessages);
  return entry;
}

async function removeTrackedMessage(messageId) {
  const trackedMessages = await getTrackedMessages();
  await saveTrackedMessages(
    trackedMessages.filter(entry => entry.localMessageId !== messageId)
  );
}

async function updateTrackedMessageDueDate(messageId, dueDate) {
  const trackedMessages = await getTrackedMessages();
  const entry = trackedMessages.find(item => item.localMessageId === messageId);
  if (!entry) {
    throw new Error("Tracked message not found.");
  }

  entry.dueDate = dueDate;
  await saveTrackedMessages(trackedMessages);
  return entry;
}

async function getDashboardData() {
  const trackedMessages = await getTrackedMessages();
  return {
    today: todayAsIsoDate(),
    items: trackedMessages.toSorted((first, second) =>
      (first.status === "replied") - (second.status === "replied") ||
      first.dueDate.localeCompare(second.dueDate)
    ),
  };
}

async function markRepliesReceived(messageList) {
  const trackedMessages = await getTrackedMessages();
  let hasChanges = false;

  for (const receivedMessage of await allMessagesInList(messageList)) {
    const fullMessage = await messenger.messages.getFull(receivedMessage.id);
    const replyReferences = new Set(
      messageIdsFromHeaderValues([
        ...(fullMessage.headers?.["in-reply-to"] ?? []),
        ...(fullMessage.headers?.references ?? []),
      ]).map(normalizeMessageId)
    );
    if (replyReferences.size === 0) continue;

    const trackedMessage = trackedMessages.find(entry =>
      entry.status !== "replied" &&
      replyReferences.has(normalizeMessageId(entry.messageId))
    );
    if (!trackedMessage) continue;

    trackedMessage.status = "replied";
    trackedMessage.repliedAt = new Date(receivedMessage.date).toISOString();
    trackedMessage.replyMessageLocalId = receivedMessage.id;
    trackedMessage.replyAuthor = receivedMessage.author;
    trackedMessage.replySubject = receivedMessage.subject;
    hasChanges = true;
  }

  if (hasChanges) {
    await saveTrackedMessages(trackedMessages);
  }
}

async function openDashboard() {
  const dashboardUrl = messenger.runtime.getURL("dashboard/index.html");
  const [existingTab] = await messenger.tabs.query({ url: dashboardUrl });
  if (existingTab) {
    await messenger.tabs.update(existingTab.id, { active: true });
    return;
  }
  await messenger.tabs.create({ url: dashboardUrl });
}

async function selectedMessageIds(messageList) {
  return (messageList?.messages ?? []).map(message => message.id);
}

async function createMenus() {
  await messenger.menus.removeAll();
  messenger.menus.create({
    id: "track-reply",
    title: "Track reply (due in 7 days)",
    contexts: ["message_list"],
  });
  messenger.menus.create({
    id: "stop-tracking-reply",
    title: "Stop tracking reply",
    contexts: ["message_list"],
  });
}

messenger.runtime.onInstalled.addListener(() => {
  ensureSettings().catch(console.error);
  createMenus().catch(console.error);
  scheduleReminderAlarm().catch(console.error);
});

messenger.runtime.onStartup.addListener(() => {
  ensureSettings().catch(console.error);
  createMenus().catch(console.error);
  scheduleReminderAlarm().catch(console.error);
});

messenger.action.onClicked.addListener(async () => {
  await openDashboard();
});

messenger.menus.onClicked.addListener(async info => {
  const messageIds = await selectedMessageIds(info.selectedMessages);
  if (info.menuItemId === "track-reply") {
    await Promise.all(messageIds.map(messageId =>
      createTrackedMessage(messageId, dateAfterDays(DEFAULT_DUE_DAYS))
    ));
  }
  if (info.menuItemId === "stop-tracking-reply") {
    await Promise.all(messageIds.map(removeTrackedMessage));
  }
});

messenger.messages.onNewMailReceived.addListener((folder, messages) => {
  markRepliesReceived(messages).catch(error => {
    console.error("Could not check a received message for a reply.", error);
  });
});

messenger.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REMINDER_ALARM_NAME) {
    showOverdueReminder().catch(error => {
      console.error("Could not show overdue reply reminder.", error);
    });
  }
});

messenger.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    scheduleReminderAlarm().catch(console.error);
  }
});

messenger.runtime.onMessage.addListener(async request => {
  if (request.type === "track-message") {
    return createTrackedMessage(request.messageId, request.dueDate);
  }
  if (request.type === "untrack-message") {
    await removeTrackedMessage(request.messageId);
    return null;
  }
  if (request.type === "get-tracked-message") {
    const trackedMessages = await getTrackedMessages();
    return trackedMessages.find(entry => entry.localMessageId === request.messageId) ?? null;
  }
  if (request.type === "get-dashboard-data") {
    return getDashboardData();
  }
  if (request.type === "update-due-date") {
    return updateTrackedMessageDueDate(request.messageId, request.dueDate);
  }
  if (request.type === "remove-tracked-message") {
    await removeTrackedMessage(request.messageId);
    return null;
  }
  if (request.type === "test-reminder") {
    return showOverdueReminder({ force: true });
  }
  return undefined;
});
