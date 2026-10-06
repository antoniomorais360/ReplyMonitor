/* global messenger */

const STORAGE_KEY = "settings";
const TRACKED_MESSAGES_KEY = "trackedMessages";
const DEFAULT_DUE_DAYS = 7;
const DEFAULT_RECENT_REPLY_SCAN_DAYS = 2;
const MAX_RECENT_REPLY_SCAN_DAYS = 15;
const REMINDER_ALARM_NAME = "overdue-reply-reminder";
const OVERDUE_NOTIFICATION_ID = "reply-monitor-overdue";

const defaultSettings = Object.freeze({
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
  remindersEnabled: true,
  reminderHour: 9,
  recentReplyScanDays: DEFAULT_RECENT_REPLY_SCAN_DAYS,
});

let trackedMessagesMutationQueue = Promise.resolve();
let recentReplyScanPromise = null;
const followUpComposeTabs = new Map();
const composeTrackingRequests = new Map();

function normalizeSettings(settings = {}) {
  const reminderHour = Number(settings.reminderHour);
  const recentReplyScanDays = Number(settings.recentReplyScanDays);
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
    recentReplyScanDays: Number.isInteger(recentReplyScanDays) &&
      recentReplyScanDays >= 1 && recentReplyScanDays <= MAX_RECENT_REPLY_SCAN_DAYS
      ? recentReplyScanDays
      : defaultSettings.recentReplyScanDays,
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
    const trackingId = entry.trackingId ?? createTrackingId();
    const originalMessageLocalId = entry.originalMessageLocalId ?? entry.localMessageId;
    if (entry.trackingId && entry.originalMessageLocalId != null) return entry;
    migrated = true;
    return { ...entry, trackingId, originalMessageLocalId };
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

function apiHeaderMessageId(messageId) {
  const trimmed = messageId?.trim();
  if (!trimmed) return null;
  const bracketedId = trimmed.match(/^<([^<>]+)>$/);
  return bracketedId?.[1] ?? trimmed;
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
      originalMessageLocalId: messageId,
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
  let message;
  try {
    message = await findStoredMessage(
      entry.originalMessageLocalId ?? entry.localMessageId,
      entry.messageId,
      entry
    );
  } catch (error) {
    throw new Error("The original message could not be found for this follow-up.", {
      cause: error,
    });
  }

  const to = uniqueRecipients(message.recipients ?? entry.recipients ?? []);
  if (to.length === 0) throw new Error("No recipients are available for this follow-up.");

  const cc = settings.includeCc
    ? uniqueRecipients(message.ccList ?? entry.ccRecipients ?? [])
    : [];
  const bcc = settings.includeBcc
    ? uniqueRecipients(message.bccList ?? entry.bccRecipients ?? [])
    : [];

  const details = {
    to,
    subject: followUpSubject(entry.subject),
  };
  if (cc.length > 0) details.cc = cc;
  if (bcc.length > 0) details.bcc = bcc;

  const tab = await messenger.compose.beginReply(message.id, "replyToAll", details);
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

function normalizeMessageText(value) {
  return (value ?? "").trim().toLowerCase();
}

function emailAddress(value) {
  return normalizeMessageText(value).match(/<([^>]+)>/)?.[1] ?? normalizeMessageText(value);
}

async function getOwnEmailAddresses() {
  const identities = await messenger.identities.list();
  return new Set(identities.map(identity => emailAddress(identity.email)).filter(Boolean));
}

function hasMatchingRecipient(message, recipients) {
  const expectedRecipients = (recipients ?? []).map(emailAddress).filter(Boolean);
  if (expectedRecipients.length === 0) return true;
  return (message.recipients ?? []).some(recipient =>
    expectedRecipients.includes(emailAddress(recipient))
  );
}

async function findOriginalMessageByMetadata(entry) {
  if (!entry.subject || !messenger.messages.query) return null;
  const ownAddresses = await getOwnEmailAddresses();
  const candidates = await allMessagesInList(await messenger.messages.query({
    subject: entry.subject,
  }));
  return candidates.find(message =>
    ownAddresses.has(emailAddress(message.author)) &&
    normalizeMessageText(message.subject) === normalizeMessageText(entry.subject) &&
    hasMatchingRecipient(message, entry.recipients)
  ) ?? null;
}

function matchesStoredMessage(message, metadata) {
  if (!metadata) return true;
  const subjectMatches = !metadata.subject ||
    normalizeMessageText(message.subject) === normalizeMessageText(metadata.subject);
  return subjectMatches && hasMatchingRecipient(message, metadata.recipients);
}

async function findStoredMessage(localMessageId, headerMessageId, metadata) {
  let localMessageError;
  if (localMessageId != null) {
    try {
      const localMessage = await messenger.messages.get(localMessageId);
      if (matchesStoredMessage(localMessage, metadata)) return localMessage;
    } catch (error) {
      localMessageError = error;
    }
  }

  const searchableHeaderMessageId = apiHeaderMessageId(headerMessageId);
  if (searchableHeaderMessageId) {
    try {
      const matchingMessages = await allMessagesInList(
        await messenger.messages.query({ headerMessageId: searchableHeaderMessageId })
      );
      if (matchingMessages[0]) return matchingMessages[0];
    } catch (queryError) {
      localMessageError = queryError;
    }
  }

  const metadataMessage = metadata ? await findOriginalMessageByMetadata(metadata) : null;
  if (metadataMessage) return metadataMessage;
  throw localMessageError ?? new Error("No saved message reference is available.");
}

async function openStoredMessage(localMessageId, headerMessageId, metadata) {
  const message = await findStoredMessage(localMessageId, headerMessageId, metadata);
  return messenger.messageDisplay.open({
    messageId: message.id,
    location: "tab",
    active: true,
  });
}

async function openTrackedMessage(trackingId, messageType) {
  const trackedMessages = await getTrackedMessages();
  const entry = trackedMessages.find(item => item.trackingId === trackingId);
  if (!entry) throw new Error("Tracked message not found.");

  if (messageType === "original") {
    return openStoredMessage(
      entry.originalMessageLocalId ?? entry.localMessageId,
      entry.messageId,
      entry
    );
  }
  if (messageType === "reply") {
    if (entry.status !== "replied") throw new Error("No reply has been recorded for this message.");
    return openStoredMessage(entry.replyMessageLocalId, entry.replyMessageId);
  }
  throw new Error("Unknown tracked message type.");
}

async function getTrackedMessageForLocalMessage(messageId) {
  const fullMessage = await messenger.messages.getFull(messageId);
  const messageHeaderId = fullMessage.headers?.["message-id"]?.[0] ?? null;
  const trackedMessages = await getTrackedMessages();
  return trackedMessages.find(entry =>
    entry.localMessageId === messageId ||
    entry.originalMessageLocalId === messageId ||
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
  const ownAddresses = await getOwnEmailAddresses();

  for (const receivedMessage of await allMessagesInList(messageList)) {
    scanned += 1;
    if (ownAddresses.has(emailAddress(receivedMessage.author))) continue;
    const fullMessage = await messenger.messages.getFull(receivedMessage.id);
    const replyReferences = new Set(
      messageIdsFromHeaderValues([
        ...(fullMessage.headers?.["in-reply-to"] ?? []),
        ...(fullMessage.headers?.references ?? []),
      ]).map(normalizeMessageId)
    );
    if (replyReferences.size === 0) continue;
    receivedReplies.push({
      receivedMessage,
      replyReferences,
      replyMessageId: fullMessage.headers?.["message-id"]?.[0] ?? null,
    });
  }

  return mutateTrackedMessages(trackedMessages => {
    let detected = 0;
    for (const { receivedMessage, replyReferences, replyMessageId } of receivedReplies) {
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
        trackedMessage.replyMessageId = replyMessageId;
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
    const trackedMessages = (await getTrackedMessages()).filter(entry =>
      entry.status !== "replied"
    );
    if (trackedMessages.length === 0) return { scanned: 0, detected: 0 };

    const { recentReplyScanDays } = await ensureSettings();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - recentReplyScanDays);
    const candidates = new Map();
    const searches = new Map();

    for (const entry of trackedMessages) {
      const subject = entry.subject?.trim() ?? "";
      const createdAt = new Date(entry.createdAt);
      const fromDate = Number.isNaN(createdAt.getTime()) || createdAt < cutoff
        ? cutoff
        : createdAt;
      const searchKey = subject || "__all_messages__";
      const existingFromDate = searches.get(searchKey);
      if (!existingFromDate || fromDate < existingFromDate) {
        searches.set(searchKey, fromDate);
      }
    }

    for (const [subject, fromDate] of searches) {
      const queryInfo = { fromDate };
      if (subject !== "__all_messages__") queryInfo.subject = subject;
      const matchingMessages = await allMessagesInList(
        await messenger.messages.query(queryInfo)
      );
      matchingMessages.forEach(message => candidates.set(message.id, message));
    }

    return markRepliesReceived({ id: null, messages: [...candidates.values()] });
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
  scanRecentReplies().catch(error => {
    console.error("Could not scan for replies after Thunderbird started.", error);
  });
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

messenger.compose.onAfterSend.addListener(async (tab, sendInfo) => {
  const trackingRequest = composeTrackingRequests.get(tab.id);
  if (trackingRequest && !sendInfo.error) {
    const sentMessageId = sendInfo.messages?.[0]?.id;
    if (!sentMessageId) {
      throw new Error("Thunderbird did not provide a sent message to track.");
    }
    await createTrackedMessage(sentMessageId, trackingRequest.dueDate);
    composeTrackingRequests.delete(tab.id);
  }

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
      entry.followUpMessageLocalId = sendInfo.messages[0].id;
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
  if (request.type === "get-compose-tracking") {
    return composeTrackingRequests.get(request.tabId) ?? null;
  }
  if (request.type === "set-compose-tracking") {
    assertValidDueDate(request.dueDate);
    composeTrackingRequests.set(request.tabId, { dueDate: request.dueDate });
    return composeTrackingRequests.get(request.tabId);
  }
  if (request.type === "clear-compose-tracking") {
    composeTrackingRequests.delete(request.tabId);
    return null;
  }
  if (request.type === "open-tracked-message") {
    return openTrackedMessage(request.trackingId, request.messageType);
  }
  if (request.type === "test-reminder") {
    return showOverdueReminder({ force: true });
  }
  if (request.type === "scan-recent-replies") {
    return scanRecentReplies();
  }
  return undefined;
});
