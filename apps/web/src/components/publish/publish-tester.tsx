"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { submitUnifiedPublishJob, deletePublishJob } from "@/actions/publish";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Send, Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

export function PublishTester({ documents, recentJobs, accounts }: { documents: any[], recentJobs: any[], accounts: any[] }) {
  const router = useRouter();
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id || "");
  const [selectedAccounts, setSelectedAccounts] = useState<{accountId: string, publishAction?: 'draft' | 'direct'}[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  // Simple auto-refresh to see queue status changes
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [router]);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'wechat': return "💬";
      case 'cnblogs': return "📒";
      case 'juejin': return "⛏️";
      case 'xiaohongshu': return "📕";
      case 'zhihu': return "🔵";
      case 'csdn': return "💻";
      default: return "🌐";
    }
  };

  const handleToggleAccount = (accountId: string) => {
    setSelectedAccounts(prev =>
      prev.some(a => a.accountId === accountId)
        ? prev.filter(a => a.accountId !== accountId)
        : [...prev, { accountId, publishAction: 'draft' }]
    );
  };

  const handleUpdateAction = (accountId: string, action: 'draft' | 'direct') => {
    setSelectedAccounts(prev =>
      prev.map(a => a.accountId === accountId ? { ...a, publishAction: action } : a)
    );
  };

  const handlePublish = async () => {
    if (!selectedDocId) {
      toast.error("请先选择一篇文档");
      return;
    }
    if (selectedAccounts.length === 0) {
      toast.error("请至少选择一个发布账号");
      return;
    }

    setIsPublishing(true);
    toast.loading("正在投递至后台队列...", { id: "pub" });

    try {
      const payload = selectedAccounts.map(a => ({
        accountId: a.accountId,
        publishAction: a.publishAction
      }));
      await submitUnifiedPublishJob(selectedDocId, payload);
      toast.success("已成功加入队列(将在后台异步执行)", { id: "pub" });
      setSelectedAccounts([]);
      router.refresh();
    } catch (e: any) {
      toast.error("投递队列失败: " + e.message, { id: "pub" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await deletePublishJob(jobId);
      toast.success("记录已删除");
      router.refresh();
    } catch (e) {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">发布中心</h2>
          <p className="text-sm text-muted-foreground mt-1">选择文档与目标平台，配置发布策略并执行分发</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* 左侧：表单流程 */}
        <div className="lg:col-span-3 space-y-8">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-sm font-medium text-foreground">1</div>
              <div className="w-px h-full bg-white/10 mt-2" />
            </div>
            <div className="flex-1 pb-8">
              <h3 className="text-base font-medium mb-1 text-foreground">选择原稿</h3>
              <p className="text-sm text-muted-foreground mb-4">请选择需要进行多平台发布的文档</p>
              <select
                className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
              >
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id} className="bg-secondary text-foreground">{doc.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary border border-white/10 flex items-center justify-center text-sm font-medium text-foreground">2</div>
              <div className="w-px h-full bg-white/10 mt-2" />
            </div>
            <div className="flex-1 pb-8">
              <h3 className="text-base font-medium mb-1 text-foreground">配置分发渠道</h3>
              <p className="text-sm text-muted-foreground mb-4">勾选需要发布的平台并设置各自的发布策略</p>

              {accounts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-white/20 rounded-lg bg-black/10">
                  <Layers className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">你还没有绑定任何平台账号</p>
                  <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/settings")} className="border-white/10 hover:bg-white/5">
                    前往平台配置中心
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {accounts.map(acc => {
                      const isSelected = selectedAccounts.some(a => a.accountId === acc.id);
                      const selectedConfig = selectedAccounts.find(a => a.accountId === acc.id);
                      return (
                      <motion.div
                        key={acc.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col p-4 rounded-lg border transition-all duration-200 ${isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-white/10 bg-card/40 backdrop-blur-sm hover:border-primary/50'}`}
                      >
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            id={`acc-${acc.id}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleAccount(acc.id)}
                            disabled={acc.status !== "active"}
                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                          />
                          <label htmlFor={`acc-${acc.id}`} className="flex-1 flex items-center cursor-pointer">
                            <span className="text-2xl mr-3">{getPlatformIcon(acc.platform)}</span>
                            <div className="flex-1">
                              <p className="text-sm font-medium leading-none text-foreground">{acc.displayName}</p>
                              <p className="text-xs text-muted-foreground mt-1 uppercase">{acc.platform}</p>
                            </div>
                            {acc.status === "active" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                可用
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                {acc.status === "binding" ? "绑定中..." : "异常"}
                              </span>
                            )}
                          </label>
                        </div>

                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="pl-9 grid grid-cols-2 gap-4 border-t border-white/10 mt-3 pt-3 overflow-hidden"
                            >
                              <div className="col-span-2">
                                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">执行策略</label>
                                <Select
                                  value={selectedConfig?.publishAction || 'draft'}
                                  onValueChange={(val) => { if (val) handleUpdateAction(acc.id, val as 'draft' | 'direct'); }}
                                >
                                  <SelectTrigger className="h-8 text-xs bg-black/20 border-white/10 text-foreground">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-secondary border-white/10 text-foreground">
                                    <SelectItem value="draft" className="text-xs">仅存草稿 (推荐)</SelectItem>
                                    {acc.platform !== 'xiaohongshu' && (
                                      <SelectItem value="direct" className="text-xs text-orange-400">直接发布 (有风险)</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )})}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shadow-[0_0_15px_rgba(248,160,11,0.5)]">3</div>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium mb-4 text-foreground">确认并执行</h3>
              <Button
                size="lg"
                onClick={handlePublish}
                disabled={isPublishing || !selectedDocId || selectedAccounts.length === 0}
                className="w-full sm:w-auto h-11 px-8 shadow-[0_0_20px_rgba(248,160,11,0.3)] transition-all active:scale-[0.98] bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              >
                {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                提交发布队列 ({selectedAccounts.length} 个渠道)
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧：执行结果流 */}
        <div className="lg:col-span-2">
          <Card className="h-full border-white/10 glass-panel">
            <CardHeader className="border-b border-white/5 pb-4 mb-4">
              <CardTitle className="text-sm font-medium flex items-center justify-between text-foreground">
                <span>任务执行历史</span>
                <span className="text-xs font-normal text-muted-foreground">{recentJobs.length} 条记录</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 pr-1 max-h-[600px] overflow-y-auto no-scrollbar">
                {recentJobs.length === 0 ? (
                  <div className="text-center py-10">
                    <Send className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">暂无执行记录</p>
                  </div>
                ) : (
                  recentJobs.map(job => (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group flex flex-col p-3 rounded-md border border-white/5 bg-black/20 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {job.status === "published" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : job.status === "failed" ? (
                            <XCircle className="h-3.5 w-3.5 text-rose-400" />
                          ) : job.status === "awaiting_user" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" />
                          ) : job.status === "queued" ? (
                            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                          )}
                          <p className="text-sm font-medium leading-none truncate max-w-[160px] text-foreground/90">{job.variantSnapshot.title}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          job.status === "published" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          job.status === "awaiting_user" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                          job.status === "failed" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-white/5 text-muted-foreground border-white/10"
                        }`}>
                          {job.status === "awaiting_user" ? "草稿完成" : job.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
                        <div className="flex items-center gap-2">
                          {job.errorMessage ? (
                            <span className="text-rose-400 truncate max-w-[100px]" title={job.errorMessage}>错误: {job.errorMessage}</span>
                          ) : job.remoteUrl ? (
                            <a href={job.remoteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              查看结果 ↗
                            </a>
                          ) : null}
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10" onClick={() => handleDeleteJob(job.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
