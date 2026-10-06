/* global messenger */

const dashboard = document.querySelector("main");
const list = document.querySelector("#tracked-list");
const repliedList = document.querySelector("#replied-list");
const repliedSection = document.querySelector("#replied-section");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
const totalCount = document.querySelector("#total-count");
const overdueCount = document.querySelector("#overdue-count");
const todayCount = document.querySelector("#today-count");
let dashboardData;
let refreshSequence = 0;
let activeActions = 0;
let refreshTimer;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (activeActions || document.activeElement?.matches("input")) {
      scheduleRefresh();
      return;
    }
    refreshDashboard().catch(console.error);
  }, 200);
}

messenger.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.trackedMessages) scheduleRefresh();
});

function dueState(dueDate, today) {
  if (dueDate.status === "replied") return { label: "Reply received", className: "replied" };
  if (dueDate.dueDate < today) return { label: "Overdue", className: "overdue" };
  if (dueDate.dueDate === today) return { label: "Due today", className: "today" };
  return { label: "Upcoming", className: "upcoming" };
}

function recipientLabel(entry) {
  return entry.recipients?.join(", ") || entry.author || "Unknown recipient";
}

function createMessageCard(entry, today) {
  const state = dueState(entry, today);
  const card = document.createElement("article");
  card.className = `message-card${entry.status === "replied" ? " replied-card" : ""}`;
  card.dataset.trackingId = entry.trackingId;

  const heading = document.createElement("h2");
  heading.textContent = entry.subject || "(No subject)";
  const recipient = document.createElement("p");
  recipient.className = "recipient";
  recipient.textContent = recipientLabel(entry);
  const stateLabel = document.createElement("span");
  stateLabel.className = `due-state ${state.className}`;
  stateLabel.textContent = state.label;

  const replyDetails = document.createElement("p");
  replyDetails.className = "reply-details";
  if (entry.status === "replied") {
    replyDetails.textContent = `Reply received from ${entry.replyAuthor || "an unknown sender"}.`;
  }

  const controls = document.createElement("div");
  controls.className = "controls";
  const dueDate = document.createElement("input");
  dueDate.type = "date";
  dueDate.value = entry.dueDate;
  dueDate.setAttribute("aria-label", `Due date for ${entry.subject || "message"}`);
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.dataset.action = "save-date";
  saveButton.textContent = "Save date";
  const openOriginalButton = document.createElement("button");
  openOriginalButton.type = "button";
  openOriginalButton.dataset.action = "open-original";
  openOriginalButton.textContent = "Open original";
  const openReplyButton = document.createElement("button");
  openReplyButton.type = "button";
  openReplyButton.dataset.action = "open-reply";
  openReplyButton.textContent = "Open reply";
  const composeButton = document.createElement("button");
  composeButton.type = "button";
  composeButton.dataset.action = "compose-follow-up";
  composeButton.textContent = "Compose follow-up";
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.dataset.action = "stop-tracking";
  stopButton.className = "secondary";
  stopButton.textContent = "Stop tracking";

  controls.append(openOriginalButton, dueDate, saveButton);
  if (entry.status !== "replied") controls.append(composeButton);
  if (entry.status === "replied") controls.append(openReplyButton);
  controls.append(stopButton);
  card.append(heading, recipient, stateLabel);
  if (entry.status === "replied") card.append(replyDetails);
  card.append(controls);
  return card;
}

function renderDashboard({ items, today }) {
  dashboardData = { items, today };
  const cards = new Map([...list.children, ...repliedList.children].map(card => [card.dataset.trackingId, card]));
  const wanted = new Set(items.map(item => item.trackingId));
  for (const [id, card] of cards) if (!wanted.has(id)) card.remove();
  totalCount.textContent = items.length;
  overdueCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate < today).length;
  todayCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate === today).length;
  emptyState.hidden = items.length > 0;
  const awaitingReplies = items.filter(item => item.status !== "replied");
  const receivedReplies = items.filter(item => item.status === "replied");
  for (const [entries, container] of [[awaitingReplies, list], [receivedReplies, repliedList]]) {
    entries.forEach((item, index) => {
      const signature = JSON.stringify([item, today]);
      let card = cards.get(item.trackingId);
      if (!card || card.dataset.signature !== signature) {
        card?.remove();
        card = createMessageCard(item, today);
        card.dataset.signature = signature;
      }
      if (container.children[index] !== card) container.insertBefore(card, container.children[index] ?? null);
    });
  }
  repliedSection.hidden = receivedReplies.length === 0;
}

async function refreshDashboard() {
  const sequence = ++refreshSequence;
  const data = await messenger.runtime.sendMessage({ type: "get-dashboard-data" });
  if (sequence === refreshSequence) renderDashboard(data);
}

dashboard.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest(".message-card");
  const trackingId = card.dataset.trackingId;
  if (button.disabled) return;
  button.disabled = true;
  activeActions++;
  refreshSequence++;
  try {
    if (button.dataset.action === "save-date") {
      const dueDate = card.querySelector("input[type=date]").value;
      if (!dueDate) return;
      await messenger.runtime.sendMessage({ type: "update-due-date", trackingId, dueDate });
      status.value = "Due date saved.";
    }
    if (button.dataset.action === "stop-tracking") {
      button.textContent = "Removing…";
      status.value = "Stopping reply tracking…";
      await messenger.runtime.sendMessage({ type: "remove-tracked-message", trackingId });
      dashboardData.items = dashboardData.items.filter(item => item.trackingId !== trackingId);
      card.remove();
      const { items, today } = dashboardData;
      totalCount.textContent = items.length;
      overdueCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate < today).length;
      todayCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate === today).length;
      emptyState.hidden = items.length > 0;
      repliedSection.hidden = !items.some(item => item.status === "replied");
      status.value = "Reply tracking stopped.";
      return;
    }
    if (button.dataset.action === "compose-follow-up") {
      await messenger.runtime.sendMessage({ type: "compose-follow-up", trackingId });
      status.value = "Follow-up draft opened. Review it before sending.";
    }
    if (button.dataset.action === "open-original") {
      await messenger.runtime.sendMessage({
        type: "open-tracked-message",
        trackingId,
        messageType: "original",
      });
      status.value = "Original message opened.";
    }
    if (button.dataset.action === "open-reply") {
      await messenger.runtime.sendMessage({
        type: "open-tracked-message",
        trackingId,
        messageType: "reply",
      });
      status.value = "Reply opened.";
    }
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    const detail = error?.message ? ` ${error.message}` : "";
    status.value = `Could not open or update the tracked message.${detail}`;
  } finally {
    activeActions--;
    button.disabled = false;
    if (button.dataset.action === "stop-tracking") button.textContent = "Stop tracking";
  }
});

document.querySelector("#preferences-button").addEventListener("click", () => {
  messenger.runtime.openOptionsPage();
});

document.querySelector("#scan-recent-replies-button").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  status.value = "Scanning recent replies…";
  try {
    const result = await messenger.runtime.sendMessage({ type: "scan-recent-replies" });
    const replyLabel = result.detected === 1 ? "reply" : "replies";
    status.value = `Scan complete: ${result.detected} ${replyLabel} detected in ${result.scanned} recent messages.`;
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    status.value = "Could not scan recent replies.";
  } finally {
    button.disabled = false;
  }
});

async function initializeDashboard() {
  await refreshDashboard();
  try {
    const result = await messenger.runtime.sendMessage({ type: "scan-recent-replies", automatic: true });
    if (result.detected > 0) {
      const replyLabel = result.detected === 1 ? "reply" : "replies";
      status.value = `${result.detected} ${replyLabel} detected automatically.`;
      await refreshDashboard();
    }
  } catch (error) {
    console.error(error);
    status.value = "Could not check for recent replies automatically.";
  }
}

initializeDashboard().catch(error => {
  console.error(error);
  status.value = "Could not load tracked messages.";
});
