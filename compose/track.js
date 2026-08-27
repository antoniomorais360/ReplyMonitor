/* global messenger */

const form = document.querySelector("#track-form");
const subject = document.querySelector("#message-subject");
const dueDate = document.querySelector("#due-date");
const status = document.querySelector("#status");
const untrackButton = document.querySelector("#untrack-button");
let composeTabId;

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function initialize() {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("Could not find the active compose tab.");
  composeTabId = tab.id;
  const details = await messenger.compose.getComposeDetails(composeTabId);
  subject.textContent = details.subject || "(No subject)";
  dueDate.value = defaultDueDate();

  const trackingRequest = await messenger.runtime.sendMessage({
    type: "get-compose-tracking",
    tabId: composeTabId,
  });
  if (trackingRequest) {
    dueDate.value = trackingRequest.dueDate;
    status.value = "This message will be tracked after it is sent.";
  } else {
    untrackButton.hidden = true;
  }
  form.hidden = false;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  await messenger.runtime.sendMessage({
    type: "set-compose-tracking",
    tabId: composeTabId,
    dueDate: dueDate.value,
  });
  status.value = "This message will be tracked after it is sent.";
  untrackButton.hidden = false;
});

untrackButton.addEventListener("click", async () => {
  await messenger.runtime.sendMessage({
    type: "clear-compose-tracking",
    tabId: composeTabId,
  });
  status.value = "Reply tracking is disabled for this message.";
  untrackButton.hidden = true;
});

initialize().catch(error => {
  console.error(error);
  subject.textContent = "Could not load the composed message.";
});
