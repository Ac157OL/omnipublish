chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FILL_JUEJIN") {
    // We will respond asynchronously
    fillJuejinContent().then(msg => sendResponse({ message: msg })).catch(err => sendResponse({ message: "Error: " + err.message }));
    return true; // Keep the message channel open for async response
  }
});

async function fillJuejinContent() {
  try {
    const res = await fetch("http://localhost:8080/api/publish/latest-browser-job");
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const data = await res.json();
    if (data && data.variantSnapshot) {
      const { title, markdown } = data.variantSnapshot;

      // Fill Title
      const titleInput = document.querySelector('input.title-input');
      if (titleInput) {
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        console.warn("Juejin title input not found");
      }

      // Fill Markdown Editor (CodeMirror)
      // Juejin uses ByteMD. We can set value to the textarea and dispatch input event
      const textarea = document.querySelector('.bytemd-editor textarea');
      if (textarea) {
        // Clear existing content
        textarea.value = markdown;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
         console.warn("Juejin textarea not found");
         alert("无法找到掘金的编辑器输入框，请确保在草稿编辑页面");
         return "编辑器未找到";
      }

      // Report to server that user interaction is awaited (Optional: just show an alert)
      alert("内容已填充，请确认无误后手动点击发布");

      // Optional: Update job status to 'submitted' using another API call if needed.
      // But according to the requirement, the extension stops before the publish button.

      return "填充成功，请手动确认发布";
    } else {
      return "没有找到待填充的任务";
    }
  } catch (err) {
    console.error("Fetch error:", err);
    return "获取任务失败，请确保本地服务器(8080端口)正在运行";
  }
}