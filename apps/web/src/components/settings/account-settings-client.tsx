"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { saveApiAccount, triggerBrowserBinding, deleteAccount, deletePlatformAccounts } from "@/actions/accounts";
import { Plus, Search, Layers, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const SUPPORTED_PLATFORMS = [
  { id: 'wechat', name: '微信公众号', type: 'api', desc: '官方 API 接入' },
  { id: 'cnblogs', name: '博客园', type: 'api', desc: 'XML-RPC MetaWeblog 接入' },
  { id: 'juejin', name: '掘金', type: 'browser', desc: 'Cookie 接入' },
  { id: 'xiaohongshu', name: '小红书', type: 'browser', desc: 'Cookie 接入' },
  { id: 'zhihu', name: '知乎', type: 'browser', desc: 'Cookie 接入' },
  { id: 'csdn', name: 'CSDN', type: 'browser', desc: 'Cookie 接入' }
];

export function AccountSettingsClient({ initialAccounts }: { initialAccounts: any[] }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("configured");

  // Wechat Form
  const [showWechatForm, setShowWechatForm] = useState(false);
  const [wechatAppId, setWechatAppId] = useState("");
  const [wechatAppSecret, setWechatAppSecret] = useState("");

  // Cnblogs Form
  const [showCnblogsForm, setShowCnblogsForm] = useState(false);
  const [cnblogsBlogApp, setCnblogsBlogApp] = useState("");
  const [cnblogsUsername, setCnblogsUsername] = useState("");
  const [cnblogsPassword, setCnblogsPassword] = useState("");
  const [cnblogsToken, setCnblogsToken] = useState("");

  // Cookie Form
  const [showCookieForm, setShowCookieForm] = useState(false);
  const [cookiePlatformId, setCookiePlatformId] = useState("");
  const [cookieDisplayName, setCookieDisplayName] = useState("");
  const [cookieValue, setCookieValue] = useState("");

  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Auto-refresh if binding
  useEffect(() => {
    const hasBindingAccounts = initialAccounts.some(acc => acc.status === 'binding');
    if (!hasBindingAccounts) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [initialAccounts, router]);

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

  const handleSaveWechat = async () => {
    if (!wechatAppId || !wechatAppSecret) return toast.error("请填写完整配置");
    setIsLoading("wechat");
    try {
      await saveApiAccount("wechat", "微信公众号", { appId: wechatAppId, appSecret: wechatAppSecret });
      toast.success("绑定成功");
      setShowWechatForm(false);
      setWechatAppId("");
      setWechatAppSecret("");
      setActiveTab("configured");
    } catch (e: any) {
      toast.error("绑定失败: " + e.message);
    }
    setIsLoading(null);
  };

  const handleSaveCnblogs = async () => {
    if (!cnblogsBlogApp || !cnblogsUsername || !cnblogsPassword) {
      return toast.error("请填写 blogApp、用户名和密码");
    }
    setIsLoading("cnblogs");
    try {
      await saveApiAccount("cnblogs", "博客园", {
        blogApp: cnblogsBlogApp,
        username: cnblogsUsername,
        password: cnblogsPassword,
        sourceName: cnblogsToken,
      });
      toast.success("绑定成功");
      setShowCnblogsForm(false);
      setCnblogsBlogApp("");
      setCnblogsUsername("");
      setCnblogsPassword("");
      setCnblogsToken("");
      setActiveTab("configured");
    } catch (e: any) {
      toast.error("绑定失败: " + e.message);
    }
    setIsLoading(null);
  };

  const handleSaveCookie = async () => {
    if (!cookieValue) {
      return toast.error("请填写 Cookie");
    }
    const displayName = cookieDisplayName || "默认账号";
    setIsLoading("cookie");
    try {
      const platformName = SUPPORTED_PLATFORMS.find(p => p.id === cookiePlatformId)?.name || cookiePlatformId;
      await saveApiAccount(cookiePlatformId, platformName, {
        displayName: displayName,
        sessionToken: cookieValue
      });
      toast.success("绑定成功");
      setShowCookieForm(false);
      setCookiePlatformId("");
      setCookieDisplayName("");
      setCookieValue("");
      setActiveTab("configured");
    } catch (e: any) {
      toast.error("绑定失败: " + e.message);
    }
    setIsLoading(null);
  };

  const handleBindBrowser = async (platform: string) => {
    setIsLoading(platform);
    toast.info("已通知后台启动浏览器，请留意弹出的窗口", { duration: 5000 });
    try {
      await triggerBrowserBinding(platform);
      setActiveTab("configured");
    } catch (e: any) {
      toast.error("触发绑定失败: " + e.message);
    }
    setIsLoading(null);
  };

  const handleAddPlatform = (platformId: string, type: string) => {
    if (platformId === 'wechat') setShowWechatForm(true);
    else if (platformId === 'cnblogs') setShowCnblogsForm(true);
    else {
      setCookiePlatformId(platformId);
      setShowCookieForm(true);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("确定要删除该账号吗？")) return;
    try {
      await deleteAccount(id);
      toast.success("账号已删除");
    } catch (e: any) {
      toast.error("删除失败: " + e.message);
    }
  };

  const handleDeletePlatform = async (platformId: string) => {
    if (!confirm("确定要删除该平台下的所有账号吗？")) return;
    try {
      await deletePlatformAccounts(platformId);
      toast.success("平台已删除");
    } catch (e: any) {
      toast.error("删除失败: " + e.message);
    }
  };

  // Group accounts by platform
  const configuredPlatformsMap = useMemo(() => {
    const map = new Map<string, any[]>();
    initialAccounts.forEach(acc => {
      if (!map.has(acc.platform)) map.set(acc.platform, []);
      map.get(acc.platform)!.push(acc);
    });
    return map;
  }, [initialAccounts]);

  const configuredPlatformsList = Array.from(configuredPlatformsMap.entries());

  // Filtered square platforms
  const filteredSquarePlatforms = SUPPORTED_PLATFORMS.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between glass-panel p-6 rounded-2xl border-white/10 shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">平台配置中心</h2>
          <p className="text-sm text-muted-foreground mt-1">管理你的多平台分发账号</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl glass-panel p-1 border-white/10">
          <TabsTrigger value="configured" className="rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white/10 text-foreground">
            已配置 ({configuredPlatformsList.length})
          </TabsTrigger>
          <TabsTrigger value="square" className="rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white/10 text-foreground">
            平台广场
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configured" className="mt-6">
          <AnimatePresence mode="wait">
            {configuredPlatformsList.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center py-20 rounded-2xl glass-panel border-white/10 shadow-lg"
              >
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                  <div className="relative bg-black/40 backdrop-blur-xl w-full h-full rounded-2xl shadow-lg flex items-center justify-center border border-white/10">
                    <Layers className="w-10 h-10 text-primary" />
                  </div>
                </div>
                <p className="text-lg font-medium text-foreground">暂无配置任何平台</p>
                <Button variant="outline" onClick={() => setActiveTab("square")} className="mt-4 rounded-xl border-dashed border-white/20 bg-black/20 hover:bg-white/10 text-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  前往平台广场添加
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {configuredPlatformsList.map(([platformId, accounts], index) => {
                  const platformInfo = SUPPORTED_PLATFORMS.find(p => p.id === platformId) || { name: platformId, desc: '', type: 'browser' };
                  return (
                    <motion.div
                      key={platformId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, type: "spring", stiffness: 300, damping: 24 }}
                    >
                      <Card className="flex flex-col h-full rounded-2xl glass-panel border-white/10 shadow-lg overflow-hidden">
                        <CardHeader className="bg-black/20 border-b border-white/10 pb-4">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="text-3xl p-2 rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
                                {getPlatformIcon(platformId)}
                              </div>
                              <div>
                                <CardTitle className="text-lg text-foreground">{platformInfo.name}</CardTitle>
                                <CardDescription className="text-xs mt-1 uppercase tracking-wider text-muted-foreground">{platformId}</CardDescription>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" className="rounded-lg hover:bg-white/10 text-foreground" onClick={() => handleAddPlatform(platformId, platformInfo.type)} disabled={isLoading === platformId}>
                                {isLoading === platformId ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Plus className="w-4 h-4" />}
                                <span className="hidden sm:inline ml-1">添加账号</span>
                              </Button>
                              <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10" onClick={() => handleDeletePlatform(platformId)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 flex-1 space-y-3">
                          {accounts.map(acc => (
                            <div key={acc.id} className={`group flex justify-between items-center p-3 rounded-xl border transition-all ${acc.status === 'binding' ? 'border-orange-500/30 bg-orange-500/10' : 'bg-black/20 border-white/10 hover:border-white/30'}`}>
                              <div>
                                <p className="text-sm font-medium text-foreground">{acc.displayName}</p>
                                <div className="flex items-center mt-1.5 gap-2">
                                  {acc.status === "active" && <span className="inline-flex items-center text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3 mr-1"/> 可用</span>}
                                  {acc.status === "binding" && <span className="inline-flex items-center text-[10px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> 登录中</span>}
                                  {acc.status === "error" && <span className="inline-flex items-center text-[10px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full"> 失效</span>}
                                  <span className="text-[10px] text-muted-foreground">· {new Date(acc.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteAccount(acc.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="square" className="mt-6 space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="搜索平台 (例如：小红书、掘金)..."
              className="pl-10 rounded-xl border-white/10 glass-panel h-12 text-foreground focus-visible:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <AnimatePresence>
            {showWechatForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="rounded-2xl glass-panel border-white/10 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                  <CardHeader>
                    <CardTitle className="text-emerald-400">绑定微信公众号</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-4">
                    <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" placeholder="AppID" value={wechatAppId} onChange={e => setWechatAppId(e.target.value)} />
                    <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" type="password" placeholder="AppSecret" value={wechatAppSecret} onChange={e => setWechatAppSecret(e.target.value)} />
                  </CardContent>
                  <CardFooter className="justify-end gap-2">
                    <Button variant="ghost" className="rounded-xl hover:bg-white/10 text-foreground" onClick={() => setShowWechatForm(false)}>取消</Button>
                    <Button onClick={handleSaveWechat} disabled={isLoading === "wechat"} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                      {isLoading === "wechat" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 保存并绑定
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCnblogsForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="rounded-2xl glass-panel border-white/10 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                  <CardHeader>
                    <CardTitle className="text-amber-400">绑定博客园</CardTitle>
                    <CardDescription className="text-xs">需在博客园后台「设置 → MetaWeblog API」开启并获取访问令牌</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" placeholder="blogApp（博客别名，cnblogs.com/ 后面那部分）" value={cnblogsBlogApp} onChange={e => setCnblogsBlogApp(e.target.value)} />
                      <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" placeholder="用户名" value={cnblogsUsername} onChange={e => setCnblogsUsername(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" type="password" placeholder="密码" value={cnblogsPassword} onChange={e => setCnblogsPassword(e.target.value)} />
                      <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" placeholder="MetaWeblog 访问令牌（可选）" value={cnblogsToken} onChange={e => setCnblogsToken(e.target.value)} />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2">
                    <Button variant="ghost" className="rounded-xl hover:bg-white/10 text-foreground" onClick={() => setShowCnblogsForm(false)}>取消</Button>
                    <Button onClick={handleSaveCnblogs} disabled={isLoading === "cnblogs"} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white">
                      {isLoading === "cnblogs" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 保存并绑定
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCookieForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="rounded-2xl glass-panel border-white/10 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                  <CardHeader>
                    <CardTitle className="text-blue-400">绑定 {SUPPORTED_PLATFORMS.find(p => p.id === cookiePlatformId)?.name}</CardTitle>
                    <CardDescription className="text-xs">请在浏览器 Network 面板中提取 Cookie 字符串并粘贴到下方</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Input className="rounded-xl border-white/20 bg-black/20 text-foreground" placeholder="账号别名 (例如: 我的知乎小号)" value={cookieDisplayName} onChange={e => setCookieDisplayName(e.target.value)} />
                    <textarea
                      className="w-full h-32 rounded-xl border border-white/20 bg-black/20 text-foreground p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="在此粘贴完整的 Cookie 字符串..."
                      value={cookieValue}
                      onChange={e => setCookieValue(e.target.value)}
                    />
                  </CardContent>
                  <CardFooter className="justify-end gap-2">
                    <Button variant="ghost" className="rounded-xl hover:bg-white/10 text-foreground" onClick={() => setShowCookieForm(false)}>取消</Button>
                    <Button onClick={handleSaveCookie} disabled={isLoading === "cookie"} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                      {isLoading === "cookie" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 验证并保存
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.1 }
              }
            }}
          >
            {filteredSquarePlatforms.map(platform => {
              const isConfigured = configuredPlatformsMap.has(platform.id);
              return (
                <motion.div key={platform.id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 }}}>
                  <Card className="flex flex-col h-full rounded-2xl glass-panel border-white/10 shadow-lg hover:-translate-y-1 transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="text-3xl p-2 rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
                          {getPlatformIcon(platform.id)}
                        </div>
                        <div>
                          <CardTitle className="text-lg text-foreground">{platform.name}</CardTitle>
                          <CardDescription className="text-xs mt-1 uppercase tracking-wider text-muted-foreground">{platform.id}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-sm text-muted-foreground leading-relaxed">{platform.desc}</p>
                    </CardContent>
                    <CardFooter>
                      {isConfigured ? (
                        <Button variant="secondary" className="w-full rounded-xl text-emerald-400 cursor-default bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/10">
                          <CheckCircle2 className="w-4 h-4 mr-2" /> 已配置
                        </Button>
                      ) : (
                        <Button className="w-full rounded-xl bg-black/20 border border-white/10 hover:bg-white/10 text-foreground shadow-sm" onClick={() => handleAddPlatform(platform.id, platform.type)} disabled={isLoading === platform.id}>
                          {isLoading === platform.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" /> : <Plus className="w-4 h-4 mr-2 text-primary" />}
                          添加此平台
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
            {filteredSquarePlatforms.length === 0 && (
              <div className="col-span-full text-center py-10 text-muted-foreground">
                未找到匹配的平台
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}