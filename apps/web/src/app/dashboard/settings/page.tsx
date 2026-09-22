import { getAccounts } from "@/actions/accounts";
import { AccountSettingsClient } from "@/components/settings/account-settings-client";

export default async function SettingsPage() {
  const accounts = await getAccounts();

  return (
    <div className="max-w-4xl mx-auto py-8">
      <AccountSettingsClient initialAccounts={accounts} />
    </div>
  );
}