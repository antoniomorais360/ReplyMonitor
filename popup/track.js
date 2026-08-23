/* global messenger */

const form = document.querySelector("#track-form");
const subject = document.querySelector("#message-subject");
const dueDate = document.querySelector("#due-date");
const status = document.querySelector("#status");
const untrackButton = document.querySelector("#untrack-button");
let currentMessage;

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function getDisplayedMessage() {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  const messageList = await messenger.messageDisplay.getDisplayedMessages(tab.id);
  return messageList.messages[0] ?? null;
}

async function initialize() {
  currentMessage = await getDisplayedMessage();
  if (!currentMessage) {
    subject.textContent = "Open a message to track its reply.";
    return;
  }

  subject.textContent = currentMessage.subject || "(No subject)";
  dueDate.value = defaultDueDate();
  const trackedMessage = await messenger.runtime.sendMessage({
    type: "get-tracked-message",
    messageId: currentMessage.id,
  });
  if (trackedMessage) {
    dueDate.value = trackedMessage.dueDate;
  } else {
    untrackButton.hidden = true;
  }
  form.hidden = false;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  await messenger.runtime.sendMessage({
    type: "track-message",
    messageId: currentMessage.id,
    dueDate: dueDate.value,
  });
  status.value = "Reply tracking is active.";
  untrackButton.hidden = false;
});

untrackButton.addEventListener("click", async () => {
  await messenger.runtime.sendMessage({
    type: "untrack-message",
    messageId: currentMessage.id,
  });
  status.value = "Reply tracking stopped.";
  untrackButton.hidden = true;
});

initialize().catch(error => {
  console.error(error);
  subject.textContent = "Could not load the displayed message.";
});
