import { PlatformAdapter, PublishContext, PublishResult, MetricFetchInput, MetricFetchResult } from "../core/types";
import { markdownToHtml, parseMarkdown, extractImages, replaceImageUrls } from "@omnipublish/content-core";

const CNBLOGS_RPC_BASE = "https://rpc.cnblogs.com/metaweblog";

const ERR_PREFIX: Record<string, string> = {
  "0": "CNBLOGS_UNKNOWN_ERROR",
  "1": "CNBLOGS_AUTH_FAILED",
  "2": "CNBLOGS_POST_NOT_FOUND",
  "3": "CNBLOGS_PERMISSION_DENIED",
};

interface MetaWeblogBlogInfo {
  blogid: string;
  url: string;
  blogName: string;
}

interface MetaWeblogMediaObject {
  url: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildXmlRpcCall(methodName: string, params: any[]): string {
  const paramXml = params
    .map((p) => `<param><value>${toXmlValue(p)}</value></param>`)
    .join("");
  return `<?xml version="1.0"?><methodCall><methodName>${methodName}</methodName><params>${paramXml}</params></methodCall>`;
}

function toXmlValue(value: any): string {
  if (value === null || value === undefined) {
    return "<string></string>";
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? `<int>${value}</int>`
      : `<double>${value}</double>`;
  }
  if (typeof value === "boolean") {
    return `<boolean>${value ? 1 : 0}</boolean>`;
  }
  if (Buffer.isBuffer(value)) {
    return `<base64>${value.toString("base64")}</base64>`;
  }
  if (typeof value === "object") {
    const members = Object.entries(value)
      .map(([k, v]) => `<member><name>${escapeXml(k)}</name><value>${toXmlValue(v)}</value></member>`)
      .join("");
    return `<struct>${members}</struct>`;
  }
  return `<string>${escapeXml(String(value))}</string>`;
}

interface XmlRpcFault {
  faultCode: number;
  faultString: string;
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  const len = xml.length;

  while (i < len) {
    if (xml[i] === "<") {
      if (xml.startsWith("<?", i)) {
        const end = xml.indexOf("?>", i);
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (xml.startsWith("<!--", i)) {
        const end = xml.indexOf("-->", i);
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (xml[i + 1] === "/") {
        const end = xml.indexOf(">", i);
        stack.pop();
        i = end === -1 ? len : end + 1;
        continue;
      }
      const end = xml.indexOf(">", i);
      if (end === -1) break;
      const tagContent = xml.slice(i + 1, end);
      const isSelfClose = tagContent.endsWith("/");
      const cleanTag = isSelfClose ? tagContent.slice(0, -1) : tagContent;
      const spaceIdx = cleanTag.search(/\s/);
      const tag = spaceIdx === -1 ? cleanTag : cleanTag.slice(0, spaceIdx);
      const attrsStr = spaceIdx === -1 ? "" : cleanTag.slice(spaceIdx + 1);
      const attrs: Record<string, string> = {};
      const attrRegex = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(attrsStr)) !== null) {
        attrs[m[1]] = m[2];
      }

      const node: XmlNode = { tag, attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClose) {
        stack.push(node);
      }
      i = end + 1;
    } else {
      const end = xml.indexOf("<", i);
      const text = end === -1 ? xml.slice(i) : xml.slice(i, end);
      if (stack.length > 1) {
        stack[stack.length - 1].text += text;
      }
      i = end === -1 ? len : end;
    }
  }
  return root;
}

function findFirst(node: XmlNode, tag: string): XmlNode | null {
  for (const c of node.children) {
    if (c.tag === tag) return c;
    const found = findFirst(c, tag);
    if (found) return found;
  }
  return null;
}

function findAll(node: XmlNode, tag: string): XmlNode[] {
  const result: XmlNode[] = [];
  for (const c of node.children) {
    if (c.tag === tag) result.push(c);
    result.push(...findAll(c, tag));
  }
  return result;
}

function parseXmlRpcValue(valueNode: XmlNode | null | undefined): any {
  if (!valueNode || valueNode.tag !== "value") return null;
  if (valueNode.children.length === 0) {
    return decodeXmlEntities(valueNode.text.trim());
  }
  const typed = valueNode.children[0];
  switch (typed.tag) {
    case "int":
    case "i4":
      return parseInt(typed.text || "0", 10);
    case "double":
      return parseFloat(typed.text || "0");
    case "boolean":
      return typed.text === "1";
    case "base64":
      return Buffer.from(typed.text || "", "base64");
    case "datetime.iso8601":
      return typed.text || "";
    case "array": {
      const dataNode = typed.children.find((c) => c.tag === "data");
      if (!dataNode) return [];
      return dataNode.children
        .filter((c) => c.tag === "value")
        .map((v) => parseXmlRpcValue(v));
    }
    case "struct": {
      const result: Record<string, any> = {};
      for (const m of typed.children.filter((c) => c.tag === "member")) {
        const nameNode = m.children.find((c) => c.tag === "name");
        const valNode = m.children.find((c) => c.tag === "value");
        const name = nameNode ? decodeXmlEntities(nameNode.text) : "";
        result[name] = parseXmlRpcValue(valNode);
      }
      return result;
    }
    case "string":
    default:
      return decodeXmlEntities((typed.text || "").trim());
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXmlRpcResponse(xmlText: string): { result?: any; fault?: XmlRpcFault } {
  const root = parseXml(xmlText);
  const methodResponse = findFirst(root, "methodResponse");
  if (!methodResponse) return { result: null };

  const faultNode = findFirst(methodResponse, "fault");
  if (faultNode) {
    const faultValue = faultNode.children.find((c) => c.tag === "value");
    const fault = parseXmlRpcValue(faultValue) as any;
    return { fault: { faultCode: fault?.faultCode ?? 0, faultString: fault?.faultString ?? "" } };
  }

  const paramValue = findFirst(methodResponse, "param")?.children.find((c) => c.tag === "value");
  if (!paramValue) return { result: null };
  return { result: parseXmlRpcValue(paramValue) };
}

export class CnblogsAdapter implements PlatformAdapter {
  platformCode = "cnblogs";
  name = "博客园";

  private blogApp: string;
  private username: string;
  private password: string;
  private sourceName: string;

  constructor(config: {
    blogApp?: string;
    username?: string;
    password?: string;
    sourceName?: string;
  } = {}) {
    this.blogApp = config.blogApp || process.env.CNBLOGS_BLOG_APP || "";
    this.username = config.username || process.env.CNBLOGS_USERNAME || "";
    this.password = config.password || process.env.CNBLOGS_PASSWORD || "";
    this.sourceName = config.sourceName || process.env.CNBLOGS_METAWEBLOG_TOKEN || "";
  }

  async isReady(): Promise<boolean> {
    return !!(this.blogApp && this.username && this.password);
  }

  private get endpoint(): string {
    return `${CNBLOGS_RPC_BASE}/${this.blogApp}`;
  }

  private async callRpc(methodName: string, params: any[], timeoutMs = 30000): Promise<any> {
    if (!this.blogApp) {
      throw new Error("[CNBLOGS_NO_BLOG_APP] 未配置 blogApp（博客别名），无法调用 XML-RPC");
    }

    const body = buildXmlRpcCall(methodName, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "User-Agent": "OmniPublish/1.0" },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`[CNBLOGS_HTTP_${res.status}] XML-RPC HTTP 错误: ${res.statusText}`);
      }

      const text = await res.text();
      const { result, fault } = parseXmlRpcResponse(text);

      if (fault) {
        const mapped = ERR_PREFIX[String(fault.faultCode)] || "CNBLOGS_RPC_FAULT";
        throw new Error(`[${mapped}] ${fault.faultString} (code=${fault.faultCode})`);
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async adaptContent(context: PublishContext): Promise<PublishContext> {
    return { ...context, html: await markdownToHtml(context.markdown) };
  }

  private async uploadImageToCnblogs(imageUrl: string): Promise<string> {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`下载图片失败: ${imageUrl} -> ${imgRes.status}`);
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const ext = (imgRes.headers.get("content-type") || "image/png").split("/")[1] || "png";
    const filename = `img_${Date.now()}.${ext}`;

    const result = await this.callRpc("metaWeblog.newMediaObject", [
      this.blogApp,
      this.username,
      this.password,
      {
        name: filename,
        type: imgRes.headers.get("content-type") || "image/png",
        bits: buffer,
      },
    ]) as MetaWeblogMediaObject;

    return result.url;
  }

  private async processInlineImages(context: PublishContext): Promise<string> {
    const ast = parseMarkdown(context.markdown);
    const imageUrls = extractImages(ast);

    if (imageUrls.length === 0) {
      return context.html || await markdownToHtml(context.markdown);
    }

    const urlMap: Record<string, string> = {};
    for (const url of imageUrls) {
      if (url.includes("cnblogs.com")) continue;
      try {
        const cnblogsUrl = await this.uploadImageToCnblogs(url);
        urlMap[url] = cnblogsUrl;
      } catch (e: any) {
        console.warn(`[cnblogs] 内嵌图上传失败，保留原图: ${url} -> ${e.message}`);
      }
    }

    if (Object.keys(urlMap).length > 0) {
      replaceImageUrls(ast, urlMap);
      const newMarkdown = ast.toString();
      return await markdownToHtml(newMarkdown);
    }

    return context.html || await markdownToHtml(context.markdown);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    try {
      if (!(await this.isReady())) {
        return {
          success: false,
          platform: this.platformCode,
          errorMessage: "博客园未配置 blogApp / username / password",
          errorCode: "CNBLOGS_NOT_CONFIGURED",
        };
      }

      // 1) 验证凭证 + 拿 blogid
      const blogs = await this.callRpc("blogger.getUsersBlogs", [
        this.sourceName || "OmniPublish",
        this.username,
        this.password,
      ]);
      if (!Array.isArray(blogs) || blogs.length === 0) {
        return {
          success: false,
          platform: this.platformCode,
          errorMessage: "凭证无效或未关联任何博客",
          errorCode: "CNBLOGS_AUTH_FAILED",
        };
      }

      // 2) 处理正文图片
      const html = await this.processInlineImages(context);

      // 3) 发布
      const isDirect = context.publishAction === "direct";
      const post = {
        title: context.title,
        description: html,
        categories: context.tags || [],
        mt_keywords: (context.tags || []).join(","),
        wp_slug: context.platformConfig?.slug || "",
        postType: isDirect ? "BlogPost" : "Draft",
      };

      const postId = await this.callRpc("metaWeblog.newPost", [
        this.blogApp,
        this.username,
        this.password,
        post,
        isDirect,
      ]);

      if (!postId) {
        return {
          success: false,
          platform: this.platformCode,
          errorMessage: "newPost 返回空 postId",
          errorCode: "CNBLOGS_EMPTY_POST_ID",
        };
      }

      return {
        success: true,
        platform: this.platformCode,
        remoteId: String(postId),
        remoteUrl: isDirect
          ? `https://www.cnblogs.com/${this.blogApp}/p/${postId}.html`
          : `https://i.cnblogs.com/posts/edit;postId=${postId}`,
      };
    } catch (error: any) {
      const msg = error.message || "Unknown error";
      const errorCode = msg.startsWith("[") ? msg.slice(1, msg.indexOf("]")) : "CNBLOGS_NETWORK_ERROR";
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: msg,
        errorCode,
      };
    }
  }

  async fetchMetrics(input: MetricFetchInput): Promise<MetricFetchResult> {
    // 博客园 MetaWeblog 不提供阅读数接口；返回未支持
    return {
      success: false,
      errorMessage: "博客园 XML-RPC 不提供阅读数据回收接口",
      errorCode: "CNBLOGS_METRICS_UNSUPPORTED",
    };
  }
}
