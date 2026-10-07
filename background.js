chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.kind !== "badge" || !sender.tab || sender.frameId !== 0) return;
  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url || "")) return;
  if (!Number.isInteger(message.count) || message.count < 0 || message.count > 30) return;
  void chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#187860" }).catch(() => {});
  void chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.count ? String(message.count) : "" }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
