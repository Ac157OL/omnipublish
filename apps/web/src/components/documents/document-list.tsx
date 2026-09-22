"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createDocument, importMarkdown, deleteDocument, renameDocument } from "@/actions/documents";
import { format } from "date-fns";
import { Plus, Upload, Trash2, Edit, FileText, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DocumentData = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
};

export function DocumentList({ documents }: { documents: DocumentData[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameDoc, setRenameDoc] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = async () => {
    try {
      const id = await createDocument();
      toast.success("文档创建成功");
      router.push(`/dashboard/documents/${id}`);
    } catch (e) {
      toast.error("创建失败");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const id = await importMarkdown(content, file.name);
        toast.success("导入成功");
        router.push(`/dashboard/documents/${id}`);
      } catch (err) {
        toast.error("导入失败: " + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此文档吗？")) return;
    try {
      await deleteDocument(id);
      toast.success("已移至回收站");
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameDoc || !newTitle.trim()) return;
    try {
      await renameDocument(renameDoc.id, newTitle.trim());
      toast.success("重命名成功");
      setRenameDoc(null);
    } catch (e) {
      toast.error("重命名失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between glass-panel p-6 rounded-2xl border-white/10 shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">文档管理</h2>
          <p className="text-sm text-muted-foreground mt-1">管理你的 Markdown 原稿与草稿</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".md"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
          />
          <Button variant="outline" className="rounded-xl bg-black/20 border-white/10 hover:bg-white/10 text-foreground" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            导入 .md
          </Button>
          <Button onClick={handleCreate} className="rounded-xl shadow-[0_0_15px_rgba(248,160,11,0.3)] hover:shadow-[0_0_20px_rgba(248,160,11,0.5)] transition-shadow bg-primary text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" />
            新建文档
          </Button>
        </div>
      </div>

      <div className="rounded-2xl glass-panel border-white/10 overflow-hidden shadow-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-black/20 border-b border-white/10 hover:bg-transparent">
              <TableHead className="font-medium text-muted-foreground pl-6">标题</TableHead>
              <TableHead className="font-medium text-muted-foreground">状态</TableHead>
              <TableHead className="font-medium text-muted-foreground">更新时间</TableHead>
              <TableHead className="text-right font-medium text-muted-foreground pr-6">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent border-none">
                <TableCell colSpan={4} className="h-[400px] text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex flex-col items-center justify-center text-muted-foreground max-w-md mx-auto"
                  >
                    <div className="relative w-32 h-32 mb-6">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
                      <div className="relative bg-black/40 backdrop-blur-xl w-full h-full rounded-3xl shadow-xl flex items-center justify-center border border-white/10 rotate-3 hover:rotate-6 transition-transform duration-500">
                        <FileEdit className="h-12 w-12 text-primary" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">这里空空如也</h3>
                    <p className="text-sm text-muted-foreground mb-6 text-center text-balance">
                      你还没有创建任何文档。点击下方按钮新建一篇空白文档，或者导入本地的 Markdown 文件。
                    </p>
                    <div className="flex gap-4">
                      <Button variant="outline" className="rounded-xl border-dashed border-white/20 bg-black/20 hover:bg-white/10" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" /> 导入
                      </Button>
                      <Button onClick={handleCreate} className="rounded-xl bg-primary text-primary-foreground shadow-[0_0_15px_rgba(248,160,11,0.3)] hover:shadow-[0_0_20px_rgba(248,160,11,0.5)]">
                        <Plus className="mr-2 h-4 w-4" /> 立即新建
                      </Button>
                    </div>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc, index) => (
                <motion.tr
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 24 }}
                  className="group hover:bg-white/5 border-b border-white/5 transition-colors"
                >
                  <TableCell className="font-medium pl-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300 border border-primary/20">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="group-hover:text-primary transition-colors cursor-pointer text-foreground" onClick={() => router.push(`/dashboard/documents/${doc.id}`)}>
                        {doc.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-black/40 text-foreground shadow-sm border border-white/10">
                      {doc.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(doc.updatedAt, "yyyy-MM-dd HH:mm")}</TableCell>
                  <TableCell className="text-right pr-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 transition-colors focus:outline-none border border-transparent hover:border-white/10">
                        <Edit className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl glass-panel border-white/10">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/documents/${doc.id}`)} className="cursor-pointer text-foreground hover:bg-white/10 focus:bg-white/10 focus:text-foreground">
                          编辑内容
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-foreground hover:bg-white/10 focus:bg-white/10 focus:text-foreground"
                          onClick={() => {
                            setRenameDoc({ id: doc.id, title: doc.title });
                            setNewTitle(doc.title);
                          }}
                        >
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-400 focus:text-rose-400 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除文档
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!renameDoc} onOpenChange={(open) => !open && setRenameDoc(null)}>
        <DialogContent className="rounded-2xl glass-panel border-white/10 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">重命名文档</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
              placeholder="输入新文档名称"
              className="rounded-xl bg-black/20 border-white/10 focus-visible:ring-primary/50 text-foreground"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl hover:bg-white/10 text-foreground" onClick={() => setRenameDoc(null)}>取消</Button>
            <Button className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleRenameSubmit}>保存更改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
