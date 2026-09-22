"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { getPresignedUploadUrl, createAssetRecord, deleteAsset } from "@/actions/assets";
import { toast } from "sonner";
import { Upload, Trash2, Image as ImageIcon, Copy, FileIcon } from "lucide-react";

export function AssetLibrary({ initialAssets }: { initialAssets: any[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const calculateHash = async (file: File) => {
    const buffer = await file.arrayBuffer();
    // Using a fallback for crypto.subtle if it's not available (e.g., non-HTTPS dev env)
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback hash for localhost without HTTPS
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.loading("准备上传...", { id: "upload" });

    try {
      // 1. Get hash
      const hash = await calculateHash(file);

      // 2. Get Presigned URL
      const { uploadUrl, publicUrl, storageKey } = await getPresignedUploadUrl(
        file.name,
        file.type,
        file.size
      );

      // 3. Upload to S3 directly
      toast.loading("上传至存储...", { id: "upload" });
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type }
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Upload to S3 failed: ${uploadRes.status} ${errorText}`);
      }

      // 4. Save to DB
      const record = await createAssetRecord({
        originalName: file.name,
        mimeType: file.type,
        byteSize: file.size,
        storageKey,
        publicUrl,
        hash
      });

      // Ensure byteSize is a Number for React state
      const safeRecord = {
        ...record,
        byteSize: Number(record.byteSize)
      };

      setAssets([safeRecord, ...assets]);
      toast.success("上传成功", { id: "upload" });
    } catch (err: any) {
      console.error("Upload error details:", err);
      toast.error(`上传失败: ${err.message}`, { id: "upload" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除后无法恢复，确定吗？")) return;
    try {
      await deleteAsset(id);
      setAssets(assets.filter(a => a.id !== id));
      toast.success("删除成功");
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(`![](${url})`);
    toast.success("Markdown 链接已复制");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">素材库</h2>
        <div>
          <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} accept="image/*,video/*" />
          <Button onClick={() => fileRef.current?.click()} disabled={isUploading}>
            <Upload className="mr-2 h-4 w-4" />
            {isUploading ? "上传中..." : "上传素材"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {assets.map((asset) => (
          <div key={asset.id} className="group relative rounded-lg border bg-white dark:bg-slate-950 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="aspect-square bg-slate-100 dark:bg-slate-900 flex items-center justify-center relative">
              {asset.kind === "image" ? (
                <img src={asset.publicUrl} alt={asset.originalName} className="object-cover w-full h-full" />
              ) : (
                <FileIcon className="h-12 w-12 text-slate-400" />
              )}

              {/* Overlay actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => copyToClipboard(asset.publicUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDelete(asset.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-3 text-xs">
              <p className="truncate font-medium" title={asset.originalName}>{asset.originalName}</p>
              <p className="text-slate-500 mt-1">{(Number(asset.byteSize) / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ))}
        {assets.length === 0 && (
          <div className="col-span-full h-32 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed rounded-lg">
            <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
            <p>暂无素材，点击上方按钮上传图片或视频</p>
          </div>
        )}
      </div>
    </div>
  );
}
