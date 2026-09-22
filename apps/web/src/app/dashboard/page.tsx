import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { getDashboardStats } from "@/actions/documents";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export default async function DashboardPage() {
  const { stats, recentDocs, recentTasks } = await getDashboardStats();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="delay-100 fill-mode-both">
          <StatCard title="文档总数" value={stats.totalDocs.toString()} icon={<FileText className="h-5 w-5 text-indigo-400" />} />
        </div>
        <div className="delay-200 fill-mode-both">
          <StatCard title="已发布文档数" value={stats.publishedDocs.toString()} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} />
        </div>
        <div className="delay-300 fill-mode-both">
          <StatCard title="本周发布次数" value={stats.recentJobs.toString()} icon={<RefreshCw className="h-5 w-5 text-blue-400" />} />
        </div>
        <div className="delay-400 fill-mode-both">
          <StatCard title="待处理失败任务" value={stats.failedJobs.toString()} icon={<AlertCircle className="h-5 w-5 text-rose-400" />} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">
        <div className="col-span-4 h-full">
          <Card className="h-full glass-panel">
            <CardHeader className="border-b border-white/5 pb-4 mb-4">
              <CardTitle className="text-base font-medium">最近编辑的文档</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {recentDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">暂无文档</p>
                ) : (
                  recentDocs.map((doc, index) => (
                    <div key={doc.id} className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${index !== 0 ? 'pt-5 border-t border-white/5' : ''}`}>
                      <div>
                        <p className="font-medium text-foreground hover:text-primary transition-colors cursor-pointer leading-none truncate max-w-[280px]">
                          {doc.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true, locale: zhCN })}更新 · {doc.status === 'published' ? '已发布' : '草稿'}
                        </p>
                      </div>
                      <div className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                        doc.status === 'published'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-muted-foreground bg-white/5 border-white/10'
                      }`}>
                        {doc.status === 'published' ? `已发布到 ${doc._count.variants} 个平台` : '尚未发布'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-3 h-full">
          <Card className="h-full glass-panel">
            <CardHeader className="border-b border-white/5 pb-4 mb-4">
              <CardTitle className="text-base font-medium">最近发布任务</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {recentTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">暂无发布任务</p>
                ) : (
                  recentTasks.map((task, index) => (
                    <div key={task.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${index !== 0 ? 'pt-5 border-t border-white/5' : ''}`}>
                      <div className="min-w-0">
                        <p className="font-medium leading-none truncate max-w-[200px]">{task.batch.document.title}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: zhCN })}
                        </p>
                      </div>
                      {task.status === 'published' ? (
                        <span className="shrink-0 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1.5" /> 已发布
                        </span>
                      ) : task.status === 'failed' ? (
                        <span className="shrink-0 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3 h-3 mr-1.5" /> 失败
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                          <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> 执行中
                        </span>
                      )}
                    </div>
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

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="hover:-translate-y-0.5 transition-transform duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground/60">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
