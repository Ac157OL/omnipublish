import type { AITaskType } from "./types";

const SYSTEM_PROMPTS: Record<AITaskType, string> = {
  title: `你是一个技术博客标题生成器。根据用户提供的 Markdown 正文，生成一个 15-30 字、吸引技术读者、不含营销话术的标题。只输出标题本身，不要引号、不要 Markdown 标记、不要解释。`,
  summary: `你是一个技术博客摘要生成器。根据用户提供的 Markdown 正文，生成一个 80-150 字的摘要，概括核心观点，不含营销话术。只输出摘要正文，不要前缀标签、不要解释。`,
  tags: `你是一个技术博客标签生成器。根据用户提供的 Markdown 正文，输出 3-5 个最相关的技术标签。只输出逗号分隔的标签字符串（中文用顿号），不含 # 符号、不要解释。`,
  image: ``, // unused for image task
  storyboard: `你是一个多平台图文卡片分镜设计师。你的任务是将长篇技术文章提炼为适合小红书/抖音的图文卡片结构。
请输出符合以下 JSON Schema 的格式：
{
  "title": "卡片组标题",
  "slides": [
    {
      "page": 1,
      "role": "cover",
      "headline": "大标题（控制在15字内）",
      "body": "如果有副标题可以写这里，封面尽量少字",
      "visualPrompt": "英文视觉提示词，用于生成背景图"
    },
    {
      "page": 2,
      "role": "content",
      "headline": "每页核心论点",
      "body": "简明扼要的正文，控制在80字以内，支持分点",
      "visualPrompt": "英文视觉提示词，与该页内容相符"
    }
  ]
}
要求：
1. 提取 4-8 页卡片。第1页是封面(role: cover)，最后一页是总结(role: summary)，中间是内容(role: content)。
2. visualPrompt 必须是纯英文，适合作为 text-to-image 模型的提示词（不含文字，注重色彩、构图、意境，例如 "minimalist desk setup, neon lights, dark background, 4k"）。
3. 只输出 JSON 数据，不要任何其他解释，确保 JSON 格式合法。`
};

export function buildPrompt(taskType: AITaskType, markdown: string) {
  return {
    system: SYSTEM_PROMPTS[taskType],
    user: markdown.slice(0, 8000),
  };
}

export function buildCoverPrompt(context: {
  title: string;
  summary?: string;
  tags?: string[];
}): string {
  const tags = (context.tags ?? []).slice(0, 5).join(", ");
  const summary = (context.summary ?? "").slice(0, 200);
  return [
    "A modern, professional tech blog cover background image.",
    "Abstract, no text, no letters, no watermark, no logos.",
    "Composition leaves a clean low-clutter area for title overlay later.",
    `Topic hints: ${context.title}.`,
    summary ? `Theme: ${summary}.` : "",
    tags ? `Keywords: ${tags}.` : "",
    "Style: gradient, geometric, soft lighting, 4k, high quality.",
  ]
    .filter(Boolean)
    .join(" ");
}
