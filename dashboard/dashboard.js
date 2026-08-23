/* global messenger */

const list = document.querySelector("#tracked-list");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
const totalCount = document.querySelector("#total-count");
const overdueCount = document.querySelector("#overdue-count");
const todayCount = document.querySelector("#today-count");

function dueState(dueDate, today) {
  if (dueDate < today) return { label: "Overdue", className: "overdue" };
  if (dueDate === today) return { label: "Due today", className: "today" };
  return { label: "Upcoming", className: "upcoming" };
}

function recipientLabel(entry) {
  return entry.recipients?.join(", ") || entry.author || "Unknown recipient";
}

function createMessageCard(entry, today) {
  const state = dueState(entry.dueDate, today);
  const card = document.createElement("article");
  card.className = "message-card";
  card.dataset.messageId = entry.localMessageId;

  const heading = document.createElement("h2");
  heading.textContent = entry.subject || "(No subject)";
  const recipient = document.createElement("p");
  recipient.className = "recipient";
  recipient.textContent = recipientLabel(entry);
  const stateLabel = document.createElement("span");
  stateLabel.className = `due-state ${state.className}`;
  stateLabel.textContent = state.label;

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
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.dataset.action = "stop-tracking";
  stopButton.className = "secondary";
  stopButton.textContent = "Stop tracking";

  controls.append(dueDate, saveButton, stopButton);
  card.append(heading, recipient, stateLabel, controls);
  return card;
}

function renderDashboard({ items, today }) {
  list.replaceChildren();
  totalCount.textContent = items.length;
  overdueCount.textContent = items.filter(item => item.dueDate < today).length;
  todayCount.textContent = items.filter(item => item.dueDate === today).length;
  emptyState.hidden = items.length > 0;
  items.forEach(item => list.append(createMessageCard(item, today)));
}

async function refreshDashboard() {
  const data = await messenger.runtime.sendMessage({ type: "get-dashboard-data" });
  renderDashboard(data);
}

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest(".message-card");
  const messageId = Number(card.dataset.messageId);
  try {
    if (button.dataset.action === "save-date") {
      const dueDate = card.querySelector("input[type=date]").value;
      if (!dueDate) return;
      await messenger.runtime.sendMessage({ type: "update-due-date", messageId, dueDate });
      status.value = "Due date saved.";
    }
    if (button.dataset.action === "stop-tracking") {
      await messenger.runtime.sendMessage({ type: "remove-tracked-message", messageId });
      status.value = "Reply tracking stopped.";
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

refreshDashboard().catch(error => {
  console.error(error);
  status.value = "Could not load tracked messages.";
});
