/* global messenger */

const STORAGE_KEY = "settings";
const TRACKED_MESSAGES_KEY = "trackedMessages";
const DEFAULT_DUE_DAYS = 7;
const RECENT_REPLY_SCAN_DAYS = 30;
const REMINDER_ALARM_NAME = "overdue-reply-reminder";
const OVERDUE_NOTIFICATION_ID = "reply-monitor-overdue";

const defaultSettings = Object.freeze({
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
  remindersEnabled: true,
  reminderHour: 9,
});

let trackedMessagesMutationQueue = Promise.resolve();
let recentReplyScanPromise = null;
const followUpComposeTabs = new Map();

function normalizeSettings(settings = {}) {
  const reminderHour = Number(settings.reminderHour);
  return {
    reminderTemplate: typeof settings.reminderTemplate === "string"
      ? settings.reminderTemplate
      : defaultSettings.reminderTemplate,
    includeCc: typeof settings.includeCc === "boolean"
      ? settings.includeCc
      : defaultSettings.includeCc,
    includeBcc: typeof settings.includeBcc === "boolean"
      ? settings.includeBcc
      : defaultSettings.includeBcc,
    remindersEnabled: typeof settings.remindersEnabled === "boolean"
      ? settings.remindersEnabled
      : defaultSettings.remindersEnabled,
    reminderHour: Number.isInteger(reminderHour) && reminderHour >= 0 && reminderHour <= 23
      ? reminderHour
      : defaultSettings.reminderHour,
  };
}

async function ensureSettings() {
  const { [STORAGE_KEY]: settings } = await messenger.storage.local.get(STORAGE_KEY);
  if (settings) {
    const normalizedSettings = normalizeSettings(settings);
    if (JSON.stringify(settings) !== JSON.stringify(normalizedSettings)) {
      await messenger.storage.local.set({ [STORAGE_KEY]: normalizedSettings });
    }
    return normalizedSettings;
  }

  await messenger.storage.local.set({ [STORAGE_KEY]: defaultSettings });
  return defaultSettings;
}

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAfterDays(days, startDate = new Date()) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function todayAsIsoDate() {
  return localIsoDate();
}

function nextReminderTime(reminderHour) {
  const next = new Date();
  next.setHours(reminderHour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function createTrackingId() {
  return crypto.randomUUID();
}

async function loadTrackedMessages() {
  const { [TRACKED_MESSAGES_KEY]: trackedMessages = [] } =
    await messenger.storage.local.get(TRACKED_MESSAGES_KEY);
  let migrated = false;
  const items = trackedMessages.map(entry => {
    if (entry.trackingId) return entry;
    migrated = true;
    return { ...entry, trackingId: createTrackingId() };
  });
  return { items, migrated };
}

async function getTrackedMessages() {
  await trackedMessagesMutationQueue;
  const { items, migrated } = await loadTrackedMessages();
  if (!migrated) return items;
  return mutateTrackedMessages(trackedMessages => trackedMessages);
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

function mutateTrackedMessages(mutator) {
  const operation = trackedMessagesMutationQueue.then(async () => {
    const { items } = await loadTrackedMessages();
    const result = await mutator(items);
    await saveTrackedMessages(items);
    return result;
  });
  trackedMessagesMutationQueue = operation.catch(() => undefined);
  return operation;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function assertValidDueDate(dueDate) {
  if (!isValidIsoDate(dueDate)) throw new Error("A valid due date is required.");
}

async function scheduleReminderAlarm() {
  const settings = await ensureSettings();
  await messenger.alarms.clear(REMINDER_ALARM_NAME);
  if (!settings.remindersEnabled) return;

  await messenger.alarms.create(REMINDER_ALARM_NAME, {
    when: nextReminderTime(settings.reminderHour),
    periodInMinutes: 24 * 60,
  });
}

async function showOverdueReminder({ force = false } = {}) {
  const settings = await ensureSettings();
  if (!force && !settings.remindersEnabled) return false;

  const overdueMessages = (await getTrackedMessages()).filter(entry =>
    entry.status !== "replied" && entry.dueDate < todayAsIsoDate()
  );
  if (overdueMessages.length === 0 && !force) return false;

  const count = overdueMessages.length;
  const message = count === 0
    ? "There are no overdue replies right now."
    : `${count} ${count === 1 ? "reply is" : "replies are"} overdue.`;
  await messenger.notifications.create(OVERDUE_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: messenger.runtime.getURL("icons/reply-monitor.svg"),
    title: "Reply Monitor",
    message,
  });
  return true;
}

async function createTrackedMessage(messageId, dueDate) {
  assertValidDueDate(dueDate);
  const message = await messenger.messages.get(messageId);
  const fullMessage = await messenger.messages.getFull(messageId);
  const messageHeaderId = fullMessage.headers?.["message-id"]?.[0] ?? null;
  return mutateTrackedMessages(trackedMessages => {
    const existingIndex = trackedMessages.findIndex(entry =>
      (messageHeaderId && entry.messageId === messageHeaderId) ||
      (messageHeaderId && entry.messageIds?.includes(messageHeaderId)) ||
      entry.localMessageId === messageId
    );
    const existingEntry = existingIndex >= 0 ? trackedMessages[existingIndex] : null;
    const entry = {
      trackingId: existingEntry?.trackingId ?? createTrackingId(),
      localMessageId: messageId,
      messageId: existingEntry?.messageId ?? messageHeaderId,
      messageIds: existingEntry?.messageIds ?? [],
      subject: message.subject,
      author: message.author,
      recipients: message.recipients,
      ccRecipients: message.ccList ?? [],
      bccRecipients: message.bccList ?? [],
      dueDate,
      createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
      status: "awaiting-reply",
    };

    if (existingIndex >= 0) trackedMessages[existingIndex] = entry;
    else trackedMessages.push(entry);
    return entry;
  });
}

function uniqueRecipients(...recipientLists) {
  const seen = new Set();
  return recipientLists.flat().filter(recipient => {
    const normalized = recipient.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function followUpSubject(subject) {
  return /^re:/i.test(subject ?? "") ? subject : `Re: ${subject || "(No subject)"}`;
}

function followUpBody(template, subject) {
  const intro = template || "Hello,\n\nI would like to follow up on the message below.";
  return `${intro}\n\nRegarding: ${subject || "(No subject)"}\n\nBest regards,`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextAsHtml(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

async function composeFollowUp(trackingId) {
  const trackedMessages = await getTrackedMessages();
  const entry = trackedMessages.find(item => item.trackingId === trackingId);
  if (!entry) throw new Error("Tracked message not found.");
  if (entry.status === "replied") throw new Error("This message already has a recorded reply.");

  const settings = await ensureSettings();
  let message = null;
  try {
    message = await messenger.messages.get(entry.localMessageId);
  } catch (error) {
    console.warn("Could not read the original message; using stored recipients.", error);
  }

  const to = uniqueRecipients(message?.recipients ?? entry.recipients ?? []);
  if (to.length === 0) throw new Error("No recipients are available for this follow-up.");

  const cc = settings.includeCc
    ? uniqueRecipients(message?.ccList ?? entry.ccRecipients ?? [])
    : [];
  const bcc = settings.includeBcc
    ? uniqueRecipients(message?.bccList ?? entry.bccRecipients ?? [])
    : [];

  const details = {
    to,
    subject: followUpSubject(entry.subject),
  };
  if (cc.length > 0) details.cc = cc;
  if (bcc.length > 0) details.bcc = bcc;

  const tab = await messenger.compose.beginNew(undefined, details);
  const currentDetails = await messenger.compose.getComposeDetails(tab.id);
  const followUpText = followUpBody(settings.reminderTemplate, entry.subject);
  if (currentDetails.isPlainText) {
    await messenger.compose.setComposeDetails(tab.id, {
      plainTextBody: `${followUpText}\n\n${currentDetails.plainTextBody ?? ""}`,
    });
  } else {
    await messenger.compose.setComposeDetails(tab.id, {
      body: `${plainTextAsHtml(followUpText)}<br><br>${currentDetails.body ?? ""}`,
    });
  }
  followUpComposeTabs.set(tab.id, trackingId);
  return { tabId: tab.id };
}

async function removeTrackedMessage(trackingId) {
  return mutateTrackedMessages(trackedMessages => {
    const index = trackedMessages.findIndex(entry => entry.trackingId === trackingId);
    if (index >= 0) trackedMessages.splice(index, 1);
    return null;
  });
}

async function updateTrackedMessageDueDate(trackingId, dueDate) {
  assertValidDueDate(dueDate);
  return mutateTrackedMessages(trackedMessages => {
    const entry = trackedMessages.find(item => item.trackingId === trackingId);
    if (!entry) throw new Error("Tracked message not found.");
    entry.dueDate = dueDate;
    return entry;
  });
}

async function getTrackedMessageForLocalMessage(messageId) {
  const fullMessage = await messenger.messages.getFull(messageId);
  const messageHeaderId = fullMessage.headers?.["message-id"]?.[0] ?? null;
  const trackedMessages = await getTrackedMessages();
  return trackedMessages.find(entry =>
    entry.localMessageId === messageId ||
    (messageHeaderId && entry.messageId === messageHeaderId) ||
    (messageHeaderId && entry.messageIds?.includes(messageHeaderId))
  ) ?? null;
}

async function removeTrackedMessageForLocalMessage(messageId) {
  const entry = await getTrackedMessageForLocalMessage(messageId);
  if (entry) await removeTrackedMessage(entry.trackingId);
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
  let scanned = 0;
  const receivedReplies = [];

  for (const receivedMessage of await allMessagesInList(messageList)) {
    scanned += 1;
    const fullMessage = await messenger.messages.getFull(receivedMessage.id);
    const replyReferences = new Set(
      messageIdsFromHeaderValues([
        ...(fullMessage.headers?.["in-reply-to"] ?? []),
        ...(fullMessage.headers?.references ?? []),
      ]).map(normalizeMessageId)
    );
    if (replyReferences.size === 0) continue;
    receivedReplies.push({ receivedMessage, replyReferences });
  }

  return mutateTrackedMessages(trackedMessages => {
    let detected = 0;
    for (const { receivedMessage, replyReferences } of receivedReplies) {
      for (const trackedMessage of trackedMessages) {
        const trackedIds = [
          trackedMessage.messageId,
          ...(trackedMessage.messageIds ?? []),
        ].map(normalizeMessageId).filter(Boolean);
        if (trackedMessage.status === "replied" ||
            !trackedIds.some(messageId => replyReferences.has(messageId))) continue;

        trackedMessage.status = "replied";
        trackedMessage.repliedAt = new Date(receivedMessage.date).toISOString();
        trackedMessage.replyMessageLocalId = receivedMessage.id;
        trackedMessage.replyAuthor = receivedMessage.author;
        trackedMessage.replySubject = receivedMessage.subject;
        detected += 1;
      }
    }
    return { scanned, detected };
  });
}

function scanRecentReplies() {
  if (recentReplyScanPromise) return recentReplyScanPromise;
  recentReplyScanPromise = (async () => {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - RECENT_REPLY_SCAN_DAYS);
    const recentMessages = await messenger.messages.query({
      fromDate,
      fromMe: false,
    });
    return markRepliesReceived(recentMessages);
  })().finally(() => {
    recentReplyScanPromise = null;
  });
  return recentReplyScanPromise;
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
    await Promise.all(messageIds.map(removeTrackedMessageForLocalMessage));
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

messenger.notifications.onClicked.addListener(notificationId => {
  if (notificationId === OVERDUE_NOTIFICATION_ID) {
    openDashboard().catch(error => {
      console.error("Could not open the dashboard from a notification.", error);
    });
  }
});

messenger.compose.onAfterSend.addListener((tab, sendInfo) => {
  const trackingId = followUpComposeTabs.get(tab.id);
  if (!trackingId) return;
  followUpComposeTabs.delete(tab.id);
  if (sendInfo.error || !sendInfo.headerMessageId) return;

  mutateTrackedMessages(trackedMessages => {
    const entry = trackedMessages.find(item => item.trackingId === trackingId);
    if (!entry) return null;
    entry.messageIds ??= [];
    if (!entry.messageIds.includes(sendInfo.headerMessageId)) {
      entry.messageIds.push(sendInfo.headerMessageId);
    }
    if (sendInfo.messages?.[0]?.id) {
      entry.localMessageId = sendInfo.messages[0].id;
    }
    return entry;
  }).catch(error => {
    console.error("Could not update follow-up reply tracking after send.", error);
  });
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
    await removeTrackedMessage(request.trackingId);
    return null;
  }
  if (request.type === "get-tracked-message") {
    return getTrackedMessageForLocalMessage(request.messageId);
  }
  if (request.type === "get-dashboard-data") {
    return getDashboardData();
  }
  if (request.type === "update-due-date") {
    return updateTrackedMessageDueDate(request.trackingId, request.dueDate);
  }
  if (request.type === "remove-tracked-message") {
    await removeTrackedMessage(request.trackingId);
    return null;
  }
  if (request.type === "compose-follow-up") {
    return composeFollowUp(request.trackingId);
  }
  if (request.type === "test-reminder") {
    return showOverdueReminder({ force: true });
  }
  if (request.type === "scan-recent-replies") {
    return scanRecentReplies();
  }
  return undefined;
});
