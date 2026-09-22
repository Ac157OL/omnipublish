import { getDocument } from "@/actions/documents";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { notFound } from "next/navigation";

export default async function DocumentEditorPage({ params }: { params: { id: string } }) {
  const doc = await getDocument(params.id);

  if (!doc) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      {doc.coverImageUrl && (
        <div className="mb-4 flex items-center justify-between glass-panel p-4 rounded-xl border border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-md overflow-hidden border border-white/20">
              <img src={doc.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">已配置封面图</p>
              <p className="text-xs text-white/50 mt-1">此图片将在发布到微信等平台时用作文章封面</p>
            </div>
          </div>
          <a href={doc.coverImageUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
            查看大图 ↗
          </a>
        </div>
      )}
      <MarkdownEditor
        initialId={doc.id}
        initialTitle={doc.title}
        initialMarkdown={doc.markdown}
      />
    </div>
  );
}
