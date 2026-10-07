"use strict";
const defaults = { enabled: true, autoDownload: true, includeBinary: true };
const elements = Object.fromEntries(["enabled", "autoDownload", "includeBinary", "status", "dot", "count", "clear", "empty", "clips", "feedback"].map((id) => [id, document.getElementById(id)]));
let tabId;
let renderingKey = "";
let polling = false;

function feedback(text, error = false) {
  elements.feedback.textContent = text;
  elements.feedback.classList.toggle("error", error);
}

async function send(command, args = {}) {
  if (tabId === undefined) throw new Error("Open a ChatGPT tab to capture audio.");
  const response = await chrome.tabs.sendMessage(tabId, { kind: "speech-saver", command, ...args });
  if (!response?.ok) throw new Error(response?.error || "Refresh the ChatGPT tab to connect.");
  return response.data;
}

function render(data) {
  elements.status.textContent = !data.options.enabled ? "Capture paused" : data.pendingSynthesis ? "Fetching speech… playback can be stopped" : "Listening · click Read aloud in ChatGPT";
  elements.dot.classList.toggle("active", data.options.enabled);
  elements.count.textContent = data.clips.length;
  elements.clear.disabled = !data.clips.length;
  elements.empty.hidden = !!data.clips.length;
  for (const key of Object.keys(defaults)) elements[key].checked = data.options[key];
  const key = JSON.stringify(data.clips);
  if (key !== renderingKey) {
    renderingKey = key;
    elements.clips.replaceChildren();
    for (const clip of data.clips) {
      const item = document.createElement("li");
      const details = document.createElement("div");
      details.className = "clip-details";
      const title = document.createElement("span");
      title.className = "clip-title";
      title.textContent = clip.extension === "bin" ? "Binary blob" : `${clip.extension.toUpperCase()} audio`;
      const meta = document.createElement("span");
      meta.className = "clip-meta";
      const size = clip.size < 1024 * 1024 ? `${(clip.size / 1024).toFixed(1)} KB` : `${(clip.size / 1024 / 1024).toFixed(1)} MB`;
      meta.textContent = `${new Date(clip.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${size}${clip.source === "synthesis" ? " · direct capture" : ""}${clip.downloadRequests ? " · download requested" : ""}`;
      const button = document.createElement("button");
      button.className = "download";
      button.textContent = "Download";
      button.setAttribute("aria-label", `Download ${clip.filename}`);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          render(await send("download", { id: clip.id }));
          feedback("Download requested. Check Chrome’s downloads.");
        } catch (error) { feedback(error.message, true); }
        finally { button.disabled = false; }
      });
      details.append(title, meta);
      item.append(details, button);
      elements.clips.append(item);
    }
  }
  if (data.lastError) feedback(data.lastError, true);
}

for (const key of Object.keys(defaults)) {
  elements[key].addEventListener("change", async () => {
    elements[key].disabled = true;
    try {
      await chrome.storage.local.set({ [key]: elements[key].checked });
      feedback("Settings saved.");
    } catch (error) { feedback(error.message, true); }
    finally { elements[key].disabled = false; }
  });
}
elements.clear.addEventListener("click", async () => {
  try { render(await send("clear")); feedback("Captured clips cleared."); }
  catch (error) { feedback(error.message, true); }
});

async function refresh() {
  if (polling) return;
  polling = true;
  try { render(await send("status")); }
  catch {
    elements.status.textContent = "Open ChatGPT and refresh the tab to connect.";
    elements.dot.classList.remove("active");
    elements.clear.disabled = true;
    if (elements.clips.childElementCount) {
      elements.clips.replaceChildren();
      renderingKey = "";
      elements.count.textContent = "0";
      elements.empty.hidden = false;
    }
  } finally { polling = false; }
}

async function initialize() {
  const options = await chrome.storage.local.get(defaults);
  for (const key of Object.keys(defaults)) elements[key].checked = options[key];
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  await refresh();
  setInterval(refresh, 1000);
}
initialize().catch((error) => feedback(error.message, true));
