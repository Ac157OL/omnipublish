import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Image, Link } from "mdast";

export interface MarkdownAST {
  root: Root;
  toString: () => string;
}

export function parseMarkdown(markdown: string): MarkdownAST {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);

  const root = processor.parse(markdown) as Root;

  return {
    root,
    toString: () => {
      const stringifier = unified()
        .use(remarkStringify)
        .use(remarkGfm);
      return stringifier.stringify(root);
    }
  };
}

/**
 * Extract all image URLs from Markdown
 */
export function extractImages(ast: MarkdownAST): string[] {
  const urls: string[] = [];
  visit(ast.root, "image", (node: Image) => {
    if (node.url && !urls.includes(node.url)) {
      urls.push(node.url);
    }
  });
  return urls;
}

/**
 * Replace image URLs based on a mapping dictionary
 */
export function replaceImageUrls(ast: MarkdownAST, urlMap: Record<string, string>): void {
  visit(ast.root, "image", (node: Image) => {
    if (node.url && urlMap[node.url]) {
      node.url = urlMap[node.url];
    }
  });
}

/**
 * Convert Markdown string directly to HTML
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
