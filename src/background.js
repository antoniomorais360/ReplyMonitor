/* global messenger */

const STORAGE_KEY = "settings";
const TRACKED_MESSAGES_KEY = "trackedMessages";
const DEFAULT_DUE_DAYS = 7;

const defaultSettings = Object.freeze({
  enabled: true,
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
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

async function getTrackedMessages() {
  const { [TRACKED_MESSAGES_KEY]: trackedMessages = [] } =
    await messenger.storage.local.get(TRACKED_MESSAGES_KEY);
  return trackedMessages;
}

async function saveTrackedMessages(trackedMessages) {
  await messenger.storage.local.set({ [TRACKED_MESSAGES_KEY]: trackedMessages });
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
});

messenger.runtime.onStartup.addListener(() => {
  ensureSettings().catch(console.error);
  createMenus().catch(console.error);
});

messenger.action.onClicked.addListener(async () => {
  await messenger.runtime.openOptionsPage();
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
  return undefined;
});
