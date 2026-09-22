import { PlatformAdapter, PublishContext, PublishResult, MetricFetchInput, MetricFetchResult } from "../core/types";
import { markdownToHtml, parseMarkdown, extractImages, replaceImageUrls } from "@omnipublish/content-core";

const WECHAT_API_BASE = "https://api.weixin.qq.com/cgi-bin";
const TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000;

const ERR_MAP: Record<number, string> = {
  40001: "WECHAT_TOKEN_INVALID",
  40002: "WECHAT_GRANT_TYPE_INVALID",
  40003: "WECHAT_OPENID_INVALID",
  40004: "WECHAT_MEDIA_TYPE_INVALID",
  40007: "WECHAT_MEDIA_ID_INVALID",
  40125: "WECHAT_APPSECRET_INVALID",
  40164: "WECHAT_IP_NOT_IN_WHITELIST",
  45009: "WECHAT_API_RATE_LIMIT",
  48001: "WECHAT_API_NO_PERMISSION",
  48002: "WECHAT_API_NOT_SUBSCRIBER",
  48004: "WECHAT_API_NOT_CERTIFIED",
};

interface TokenCache {
  token: string;
  expiresAt: number;
}

const sharedTokenCache = new Map<string, TokenCache>();

export class WechatAdapter implements PlatformAdapter {
  platformCode = "wechat";
  name = "微信公众号";

  private appId: string;
  private appSecret: string;
  private cacheKey: string;

  constructor(config: { appId?: string; appSecret?: string } = {}) {
    this.appId = config.appId || process.env.WECHAT_APP_ID || "";
    this.appSecret = config.appSecret || process.env.WECHAT_APP_SECRET || "";
    this.cacheKey = `${this.appId}:${this.appSecret}`;
  }

  async isReady(): Promise<boolean> {
    return !!this.appId && !!this.appSecret;
  }

  async adaptContent(context: PublishContext): Promise<PublishContext> {
    const htmlContent = await markdownToHtml(context.markdown);
    return { ...context, html: htmlContent };
  }

  private async getAccessToken(): Promise<string> {
    if (!this.appId || !this.appSecret) {
      throw new Error("微信公众号未配置 AppID / AppSecret");
    }

    const cached = sharedTokenCache.get(this.cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt - now > TOKEN_REFRESH_LEAD_MS) {
      return cached.token;
    }

    const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode) {
      const mapped = ERR_MAP[data.errcode] || "WECHAT_API_ERROR";
      const hint = data.errcode === 40164
        ? `当前出口 IP 不在白名单。请在公众号后台「设置与开发 → 基本配置 → IP 白名单」中添加本机出口 IP。`
        : "";
      throw new Error(`[${mapped}] ${data.errmsg}${hint ? ` | ${hint}` : ""}`);
    }

    sharedTokenCache.set(this.cacheKey, {
      token: data.access_token,
      expiresAt: now + (data.expires_in || 7200) * 1000,
    });
    return data.access_token;
  }

  private async uploadImageToWechat(token: string, imageUrl: string, isArticleImage: boolean): Promise<string> {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`下载图片失败: ${imageUrl} -> ${imgRes.status}`);
    }
    const blob = await imgRes.blob();
    const ext = (blob.type.split("/")[1] || "png").toLowerCase();
    const filename = `img_${Date.now()}.${ext}`;

    const formData = new FormData();
    formData.append("media", blob, filename);

    const endpoint = isArticleImage
      ? `${WECHAT_API_BASE}/media/uploadimg?access_token=${token}`
      : `${WECHAT_API_BASE}/material/add_material?access_token=${token}&type=image`;

    const uploadRes = await fetch(endpoint, { method: "POST", body: formData });
    const uploadData = await uploadRes.json();

    if (uploadData.errcode) {
      const mapped = ERR_MAP[uploadData.errcode] || "WECHAT_UPLOAD_ERROR";
      throw new Error(`[${mapped}] 图片上传失败: ${uploadData.errmsg}`);
    }

    return isArticleImage ? uploadData.url : uploadData.media_id;
  }

  private async processInlineImages(token: string, context: PublishContext): Promise<string> {
    const ast = parseMarkdown(context.markdown);
    const imageUrls = extractImages(ast);

    if (imageUrls.length === 0) {
      return context.html || await markdownToHtml(context.markdown);
    }

    const urlMap: Record<string, string> = {};
    for (const url of imageUrls) {
      if (url.includes("mmbiz.qpic.cn")) continue;
      try {
        const wechatUrl = await this.uploadImageToWechat(token, url, true);
        urlMap[url] = wechatUrl;
      } catch (e: any) {
        console.warn(`[wechat] 内嵌图上传失败，保留原图: ${url} -> ${e.message}`);
      }
    }

    if (Object.keys(urlMap).length > 0) {
      replaceImageUrls(ast, urlMap);
    }

    const newMarkdown = ast.toString();
    return await markdownToHtml(newMarkdown);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    try {
      const token = await this.getAccessToken();

      let thumbMediaId = context.platformConfig?.thumb_media_id;
      if (!thumbMediaId) {
        if (!context.coverImageUrl) {
          throw new Error("微信公众号要求文章必须包含封面图，请先在编辑器中配置或使用 AI 生成封面图。");
        }
        thumbMediaId = await this.uploadImageToWechat(token, context.coverImageUrl, false);
      }

      const html = await this.processInlineImages(token, context);

      const draftUrl = `${WECHAT_API_BASE}/draft/add?access_token=${token}`;
      const payload = {
        articles: [
          {
            title: context.title,
            author: context.platformConfig?.author || "",
            digest: context.platformConfig?.digest || "",
            content: html,
            content_source_url: context.platformConfig?.content_source_url || "",
            thumb_media_id: thumbMediaId,
            need_open_comment: 1,
            only_fans_can_comment: 0,
          },
        ],
      };

      const res = await fetch(draftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.errcode) {
        const mapped = ERR_MAP[data.errcode] || "WECHAT_DRAFT_ERROR";
        return {
          success: false,
          platform: this.platformCode,
          errorMessage: `[${mapped}] ${data.errmsg}`,
          errorCode: mapped,
        };
      }

      const mediaId = data.media_id;

      if (context.publishAction === "direct") {
        const publishUrl = `${WECHAT_API_BASE}/freepublish/submit?access_token=${token}`;
        const pubRes = await fetch(publishUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ media_id: mediaId }),
        });
        const pubData = await pubRes.json();

        if (pubData.errcode) {
          const mapped = ERR_MAP[pubData.errcode] || "WECHAT_PUBLISH_ERROR";
          const hint = pubData.errcode === 48001
            ? "（订阅号需认证后才有直发权限，可改用存草稿）"
            : "";
          return {
            success: false,
            platform: this.platformCode,
            errorMessage: `草稿创建成功，但发布失败: [${mapped}] ${pubData.errmsg}${hint}`,
            errorCode: mapped,
            remoteId: mediaId,
          };
        }

        return {
          success: true,
          platform: this.platformCode,
          remoteId: pubData.publish_id || mediaId,
          remoteUrl: `https://mp.weixin.qq.com/cgi-bin/appmsg?ts=${Date.now()}`,
        };
      }

      return {
        success: true,
        platform: this.platformCode,
        remoteId: mediaId,
        remoteUrl: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid=${mediaId}`,
      };
    } catch (error: any) {
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: error.message || "Unknown error",
        errorCode: error.message?.startsWith("[") ? error.message.slice(1, error.message.indexOf("]")) : "WECHAT_NETWORK_ERROR",
      };
    }
  }

  async fetchMetrics(input: MetricFetchInput): Promise<MetricFetchResult> {
    try {
      if (!input.remoteId) {
        return { success: false, errorMessage: "缺少 remoteId (media_id)" };
      }

      const token = await this.getAccessToken();
      const url = `${WECHAT_API_BASE}/freepublish/getarticle?access_token=${token}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: input.remoteId }),
      });
      const data = await res.json();

      if (data.errcode) {
        const mapped = ERR_MAP[data.errcode] || "WECHAT_METRICS_ERROR";
        return {
          success: false,
          errorMessage: `[${mapped}] ${data.errmsg}`,
          errorCode: mapped,
        };
      }

      const news = data.news_item?.[0];
      return {
        success: true,
        views: news?.read_num,
        likes: news?.like_num,
        comments: news?.comment_count,
        shares: news?.share_count,
      };
    } catch (error: any) {
      return {
        success: false,
        errorMessage: error.message,
        errorCode: "WECHAT_METRICS_NETWORK_ERROR",
      };
    }
  }
}
