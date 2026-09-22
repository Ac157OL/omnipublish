export interface RenderOptions {
  backgroundUrl?: string; // Data URL or remote URL
  headline: string;
  body?: string;
  pageNumber?: number;
  totalPages?: number;
  width?: number;
  height?: number;
  themeColor?: string;
}

export async function renderCardAsSvg(options: RenderOptions): Promise<string> {
  const width = options.width || 1200;
  const height = options.height || 1600; // 3:4 aspect ratio by default
  const bgColor = options.themeColor || "#1e293b"; // Slate 800

  // Fallback gradient if no background URL is provided
  const bg = options.backgroundUrl
    ? `<image href="${options.backgroundUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.8"/>`
    : `<rect width="${width}" height="${height}" fill="url(#bgGradient)" />`;

  const safeBody = (options.body || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const safeHeadline = (options.headline || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Wrapping text in foreignObject allows us to use HTML/CSS for word wrapping and layout
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgColor}" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <style>
      .container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: white;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 120px;
        box-sizing: border-box;
      }
      .headline {
        font-size: 80px;
        font-weight: 800;
        line-height: 1.2;
        margin-bottom: 60px;
        text-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      .body {
        font-size: 40px;
        font-weight: 400;
        line-height: 1.6;
        opacity: 0.9;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      .footer {
        position: absolute;
        bottom: 80px;
        left: 120px;
        right: 120px;
        display: flex;
        justify-content: space-between;
        font-size: 32px;
        opacity: 0.7;
        border-top: 2px solid rgba(255,255,255,0.2);
        padding-top: 40px;
      }
    </style>
  </defs>

  <!-- Background -->
  ${bg}

  <!-- Content -->
  <foreignObject width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="container">
      <div class="headline">${safeHeadline}</div>
      <div class="body">${safeBody}</div>

      ${options.pageNumber ? `
      <div class="footer">
        <span>OmniPublish</span>
        <span>${options.pageNumber} / ${options.totalPages || "-"}</span>
      </div>
      ` : ""}
    </div>
  </foreignObject>
</svg>
`.trim();
}