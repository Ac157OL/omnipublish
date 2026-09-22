import { getDocuments } from "@/actions/documents";
import { DocumentList } from "@/components/documents/document-list";

export default async function DocumentsPage() {
  const docs = await getDocuments();

  return (
    <div className="max-w-6xl mx-auto">
      <DocumentList documents={docs} />
    </div>
  );
}
