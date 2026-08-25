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
  const composeButton = document.createElement("button");
  composeButton.type = "button";
  composeButton.dataset.action = "compose-follow-up";
  composeButton.textContent = "Compose follow-up";
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.dataset.action = "stop-tracking";
  stopButton.className = "secondary";
  stopButton.textContent = "Stop tracking";

  controls.append(dueDate, saveButton);
  if (entry.status !== "replied") controls.append(composeButton);
  controls.append(stopButton);
  card.append(heading, recipient, stateLabel);
  if (entry.status === "replied") card.append(replyDetails);
  card.append(controls);
  return card;
}

function renderDashboard({ items, today }) {
  list.replaceChildren();
  repliedList.replaceChildren();
  totalCount.textContent = items.length;
  overdueCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate < today).length;
  todayCount.textContent = items.filter(item => item.status !== "replied" && item.dueDate === today).length;
  emptyState.hidden = items.length > 0;
  const awaitingReplies = items.filter(item => item.status !== "replied");
  const receivedReplies = items.filter(item => item.status === "replied");
  awaitingReplies.forEach(item => list.append(createMessageCard(item, today)));
  receivedReplies.forEach(item => repliedList.append(createMessageCard(item, today)));
  repliedSection.hidden = receivedReplies.length === 0;
}

async function refreshDashboard() {
  const data = await messenger.runtime.sendMessage({ type: "get-dashboard-data" });
  renderDashboard(data);
}

dashboard.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest(".message-card");
  const trackingId = card.dataset.trackingId;
  try {
    if (button.dataset.action === "save-date") {
      const dueDate = card.querySelector("input[type=date]").value;
      if (!dueDate) return;
      await messenger.runtime.sendMessage({ type: "update-due-date", trackingId, dueDate });
      status.value = "Due date saved.";
    }
    if (button.dataset.action === "stop-tracking") {
      await messenger.runtime.sendMessage({ type: "remove-tracked-message", trackingId });
      status.value = "Reply tracking stopped.";
    }
    if (button.dataset.action === "compose-follow-up") {
      await messenger.runtime.sendMessage({ type: "compose-follow-up", trackingId });
      status.value = "Follow-up draft opened. Review it before sending.";
    }
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    status.value = "Could not update the tracked message.";
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

refreshDashboard().catch(error => {
  console.error(error);
  status.value = "Could not load tracked messages.";
});
