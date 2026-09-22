import { getDocuments } from "@/actions/documents";
import { getRecentPublishJobs } from "@/actions/publish";
import { getAccounts } from "@/actions/accounts";
import { PublishTester } from "@/components/publish/publish-tester";

export default async function PublishPage() {
  const documents = await getDocuments();
  const recentJobs = await getRecentPublishJobs();
  const accounts = await getAccounts();

  return (
    <div className="max-w-6xl mx-auto">
      <PublishTester documents={documents} recentJobs={recentJobs} accounts={accounts} />
    </div>
  );
}
