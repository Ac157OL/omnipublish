import { getAssets } from "@/actions/assets";
import { AssetLibrary } from "@/components/assets/asset-library";

export default async function AssetsPage() {
  const assets = await getAssets();

  // Convert BigInt to Number for JSON serialization to Client Component
  const serializedAssets = assets.map(a => ({
    ...a,
    byteSize: Number(a.byteSize)
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <AssetLibrary initialAssets={serializedAssets} />
    </div>
  );
}
