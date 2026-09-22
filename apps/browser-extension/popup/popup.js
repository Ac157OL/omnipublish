document.getElementById('fillBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('juejin.cn')) {
    chrome.tabs.sendMessage(tab.id, { action: "FILL_JUEJIN" }, (response) => {
        if (chrome.runtime.lastError) {
            document.getElementById('status').innerText = "通信失败，请刷新页面后重试";
        } else {
            document.getElementById('status').innerText = response?.message || "命令已发送";
        }
    });
  } else {
    alert("请在掘金创作者中心的草稿页面使用此功能");
  }
});