"use client";

import { useEffect, useState } from "react";
import {
  getMetricsOverview,
  getMetricsTotals,
  type MetricJobRow,
  type MetricTotalRow,
} from "@/actions/metrics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { RefreshCw, Eye, Heart, MessageCircle, Share2, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const PLATFORM_COLORS = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ef4444"];

export default function MetricsPage() {
  const [jobs, setJobs] = useState<MetricJobRow[]>([]);
  const [totals, setTotals] = useState<MetricTotalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, t] = await Promise.all([
        getMetricsOverview(),
        getMetricsTotals(),
      ]);
      setJobs(j);
      setTotals(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between glass-panel p-6 rounded-2xl border-white/10 shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">数据看板</h2>
          <p className="text-sm text-muted-foreground mt-1">各平台发布后的阅读 / 点赞 / 评论 / 分享数据回收</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-black/20 border border-white/10 px-4 py-2 text-sm font-medium hover:bg-white/10 text-foreground transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新数据
        </button>
      </div>

      {error && (
        <Card className="rounded-2xl glass-panel border-rose-500/50 shadow-lg">
          <CardContent className="pt-6 text-rose-400 text-sm font-medium">{error}</CardContent>
        </Card>
      )}

      {totals.length === 0 && !loading && (
        <Card className="rounded-2xl glass-panel border-white/10 shadow-lg">
          <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground text-sm">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground">暂无回收数据</p>
            <p className="mt-2 text-balance text-center text-muted-foreground">先去发布中心发布几篇文章，系统会每小时自动从平台抓取最新数据指标并在这里展示。</p>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {totals.length > 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <SummaryCard icon={<Eye className="h-5 w-5 text-blue-500" />} label="总阅读" value={totals.reduce((s, r) => s + r.totalViews, 0)} />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <SummaryCard icon={<Heart className="h-5 w-5 text-rose-500" />} label="总点赞" value={totals.reduce((s, r) => s + r.totalLikes, 0)} />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <SummaryCard icon={<MessageCircle className="h-5 w-5 text-emerald-500" />} label="总评论" value={totals.reduce((s, r) => s + r.totalComments, 0)} />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
            <SummaryCard icon={<Share2 className="h-5 w-5 text-purple-500" />} label="总分享" value={totals.reduce((s, r) => s + r.totalShares, 0)} />
          </motion.div>
        </motion.div>
      )}

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Per-platform bar chart */}
        {totals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="col-span-4"
          >
            <Card className="h-full rounded-2xl glass-panel border-white/10 shadow-lg">
              <CardHeader className="bg-black/20 border-b border-white/10 pb-4">
                <CardTitle className="text-foreground">各平台累计指标</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={totals}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="platform" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.7)' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.7)' }} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,0.8)', color: 'white', backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                    <Legend iconType="circle" wrapperStyle={{ color: 'white' }} />
                    <Bar dataKey="totalViews" name="阅读" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="totalLikes" name="点赞" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="totalComments" name="评论" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Distribution pie */}
        {totals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="col-span-3"
          >
            <Card className="h-full rounded-2xl glass-panel border-white/10 shadow-lg">
              <CardHeader className="bg-black/20 border-b border-white/10 pb-4">
                <CardTitle className="text-foreground">平台流量占比</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={totals}
                      dataKey="totalViews"
                      nameKey="platform"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      labelLine={false}
                    >
                      {totals.map((_, idx) => (
                        <Cell key={idx} fill={PLATFORM_COLORS[idx % PLATFORM_COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,0.8)', color: 'white', backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                    <Legend iconType="circle" wrapperStyle={{ color: 'white' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Per-job time series */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="rounded-2xl glass-panel border-white/10 shadow-lg overflow-hidden">
          <CardHeader className="bg-black/20 border-b border-white/10 pb-4">
            <CardTitle className="text-foreground">已发布任务的指标趋势</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">暂无发布任务的时间序列数据。</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {jobs.map((job) => (
                  <JobMetricChart key={job.publishJobId} job={job} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="rounded-2xl glass-panel border-white/10 shadow-lg hover:-translate-y-1 transition-transform duration-300">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <div className="p-2 bg-black/20 border border-white/10 rounded-lg">
            {icon}
          </div>
          {label}
        </div>
        <div className="mt-4 text-3xl font-bold bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent">
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function JobMetricChart({ job }: { job: MetricJobRow }) {
  const data = job.snapshots.map((s) => ({
    time: new Date(s.capturedAt).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    阅读: s.views,
    点赞: s.likes,
    评论: s.comments,
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">{job.title}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span className="uppercase tracking-wider font-medium">{job.platform}</span>
            <span>·</span>
            {job.remoteUrl ? (
              <a
                href={job.remoteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-0.5"
              >
                原文链接 ↗
              </a>
            ) : (
              "无链接"
            )}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <MetricChip label="阅读" value={job.latest.views} color="text-blue-400 bg-blue-500/10 border border-blue-500/20" />
          <MetricChip label="点赞" value={job.latest.likes} color="text-rose-400 bg-rose-500/10 border border-rose-500/20" />
          <MetricChip label="评论" value={job.latest.comments} color="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" />
        </div>
      </div>
      {data.length > 0 ? (
        <div className="mt-6">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="time" tickLine={false} axisLine={false} fontSize={12} tickMargin={10} tick={{ fill: 'rgba(255,255,255,0.7)' }} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: 'rgba(255,255,255,0.7)' }} />
              <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,0.8)', color: 'white', backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', color: 'white' }} />
              <Line type="monotone" dataKey="阅读" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="点赞" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="评论" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center bg-black/20 border border-white/5 rounded-lg mt-4">
          <RefreshCw className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            暂无快照，等待下次回收
          </p>
        </div>
      )}
    </div>
  );
}

function MetricChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className={`px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${color}`}>
      {label} <strong className="font-bold">{value.toLocaleString()}</strong>
    </span>
  );
}
