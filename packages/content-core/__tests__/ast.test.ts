import { describe, it, expect } from 'vitest';
import { parseMarkdown, extractImages, replaceImageUrls, markdownToHtml } from '../src/ast';

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, and code blocks', () => {
    const md = '# Hello\n\nThis is a paragraph.\n\n```ts\nconst x = 1;\n```';
    const ast = parseMarkdown(md);
    expect(ast.root.type).toBe('root');
    expect(ast.root.children.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty string', () => {
    const ast = parseMarkdown('');
    expect(ast.root.children).toHaveLength(0);
  });

  it('handles plain text without markdown syntax', () => {
    const ast = parseMarkdown('just some text');
    expect(ast.root.children).toHaveLength(1);
  });

  it('parses GFM tables', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const ast = parseMarkdown(md);
    expect(ast.root.children.length).toBeGreaterThanOrEqual(1);
    const table = ast.root.children.find((c: any) => c.type === 'table');
    expect(table).toBeDefined();
  });

  it('toString round-trips correctly', () => {
    const md = '# Title\n\nSome text.\n\n- item 1\n- item 2';
    const ast = parseMarkdown(md);
    const result = ast.toString();
    expect(result).toContain('Title');
    expect(result).toContain('item 1');
  });
});

describe('extractImages', () => {
  it('extracts image URLs from markdown', () => {
    const md = '![alt](https://example.com/img.png)';
    const ast = parseMarkdown(md);
    const urls = extractImages(ast);
    expect(urls).toEqual(['https://example.com/img.png']);
  });

  it('extracts multiple image URLs', () => {
    const md = '![a](https://a.png) text ![b](https://b.png)';
    const ast = parseMarkdown(md);
    const urls = extractImages(ast);
    expect(urls).toHaveLength(2);
    expect(urls).toContain('https://a.png');
    expect(urls).toContain('https://b.png');
  });

  it('deduplicates repeated image URLs', () => {
    const md = '![a](https://a.png)\n\n![a again](https://a.png)';
    const ast = parseMarkdown(md);
    const urls = extractImages(ast);
    expect(urls).toHaveLength(1);
  });

  it('returns empty array when no images', () => {
    const ast = parseMarkdown('just text');
    const urls = extractImages(ast);
    expect(urls).toEqual([]);
  });
});

describe('replaceImageUrls', () => {
  it('replaces image URLs based on mapping', () => {
    const md = '![img](https://old.url/img.png)';
    const ast = parseMarkdown(md);
    replaceImageUrls(ast, { 'https://old.url/img.png': 'https://new.url/img.png' });

    const urls = extractImages(ast);
    expect(urls).toEqual(['https://new.url/img.png']);
  });

  it('does not modify URLs not in map', () => {
    const md = '![img](https://keep.url/img.png)';
    const ast = parseMarkdown(md);
    replaceImageUrls(ast, { 'https://other.url/img.png': 'https://new.url/img.png' });

    const urls = extractImages(ast);
    expect(urls).toEqual(['https://keep.url/img.png']);
  });

  it('handles multiple image replacements', () => {
    const md = '![a](https://a.png) ![b](https://b.png)';
    const ast = parseMarkdown(md);
    replaceImageUrls(ast, {
      'https://a.png': 'https://a-new.png',
      'https://b.png': 'https://b-new.png',
    });

    const urls = extractImages(ast);
    expect(urls).toContain('https://a-new.png');
    expect(urls).toContain('https://b-new.png');
  });
});

describe('markdownToHtml', () => {
  it('converts markdown to HTML', async () => {
    const html = await markdownToHtml('# Hello\n\nWorld.');
    expect(html).toContain('<h1>');
    expect(html).toContain('Hello');
    expect(html).toContain('</h1>');
    expect(html).toContain('<p>');
    expect(html).toContain('World');
  });

  it('converts GFM tables', async () => {
    const html = await markdownToHtml('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('<td>');
  });

  it('preserves code block language', async () => {
    const html = await markdownToHtml('```ts\nconst x = 1;\n```');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1');
  });
});
