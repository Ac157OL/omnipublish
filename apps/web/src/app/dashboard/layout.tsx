"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, Images, Send, BarChart2, Settings, LogOut, ChevronRight } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-screen text-foreground overflow-hidden relative">
      {/* 装饰性夜空发光球体 (模拟月光与暖灯) */}
      <div className="absolute top-[5%] right-[10%] w-64 h-64 rounded-full bg-[#fca311] opacity-[0.12] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[15%] w-96 h-96 rounded-full bg-[#fca311] opacity-[0.08] blur-[120px] pointer-events-none" />

      {/* Sidebar - 采用暗夜毛玻璃效果 */}
      <aside className="w-[240px] shrink-0 border-r border-white/10 glass-panel flex flex-col z-20 relative">
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-lg tracking-tight hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-primary to-orange-400 text-primary-foreground shadow-lg shadow-primary/20">
              <Send className="h-4 w-4" />
            </div>
            <span className="text-foreground tracking-wide">OmniPublish</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar py-6 px-4 flex flex-col gap-8">
          <div className="space-y-1.5">
            <p className="px-3 text-[11px] font-medium text-muted-foreground mb-3 tracking-widest uppercase">核心工作流</p>
            <NavItem href="/dashboard" icon={<LayoutDashboard size={18} />} label="总览概况" currentPath={pathname} />
            <NavItem href="/dashboard/documents" icon={<FileText size={18} />} label="内容管理" currentPath={pathname} />
            <NavItem href="/dashboard/publish" icon={<Send size={18} />} label="发布中心" currentPath={pathname} />
          </div>

          <div className="space-y-1.5">
            <p className="px-3 text-[11px] font-medium text-muted-foreground mb-3 tracking-widest uppercase">资源与数据</p>
            <NavItem href="/dashboard/assets" icon={<Images size={18} />} label="统一素材库" currentPath={pathname} />
            <NavItem href="/dashboard/metrics" icon={<BarChart2 size={18} />} label="数据回收" currentPath={pathname} />
          </div>

          <div className="space-y-1.5 mt-auto">
            <NavItem href="/dashboard/settings" icon={<Settings size={18} />} label="平台配置" currentPath={pathname} />
          </div>
        </div>

        {/* 用户信息卡片 */}
        <div className="p-4 border-t border-white/5 bg-black/10">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-secondary/80 border border-white/10 flex items-center justify-center text-sm font-medium text-primary">
                {session?.user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-none text-foreground/90">{session?.user?.name || 'User'}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" title="退出登录" onClick={() => signOut()} className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-400 hover:bg-rose-500/10">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 z-10">
        {/* Header - 玻璃态顶部 */}
        <header className="flex h-16 shrink-0 items-center justify-between px-8 border-b border-white/5 bg-card/30 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
            <span className="hover:text-primary cursor-pointer transition-colors">工作空间</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            <span className="capitalize font-medium text-foreground">{pathname.split('/').pop() || '概览'}</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full max-w-7xl mx-auto p-8 relative z-10"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function NavItem({ href, icon, label, currentPath }: { href: string; icon: React.ReactNode; label: string; currentPath: string }) {
  const isActive = currentPath === href || (href !== '/dashboard' && currentPath.startsWith(href));

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group overflow-hidden
        ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
    >
      {isActive && (
        <motion.div
          layoutId="nav-bg"
          className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <div className="relative z-10 flex items-center gap-3">
        <span className={`transition-transform duration-300 ${isActive ? 'text-primary scale-110' : 'text-muted-foreground group-hover:text-foreground'}`}>
          {icon}
        </span>
        {label}
      </div>
    </Link>
  );
}
