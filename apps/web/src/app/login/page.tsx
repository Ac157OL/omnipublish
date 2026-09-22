"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { authenticate, register } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loginError, dispatchLogin] = useFormState(authenticate, undefined);
  const [registerError, dispatchRegister] = useFormState(register, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden bg-background">
      {/* 确保背景图片强制加载，解决中间件拦截或全局样式未覆盖的问题 */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat fixed"
        style={{ backgroundImage: "url('/bg-nocturnal.jpg')" }}
      />

      {/* 装饰性光效 */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-primary opacity-[0.15] blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full bg-secondary opacity-[0.2] blur-[120px] pointer-events-none z-0" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] z-10 p-4"
      >
        <Card className="bg-black/40 backdrop-blur-2xl border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-3xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <CardHeader className="space-y-4 text-center pt-10 pb-6 relative z-10">
            <div className="flex justify-center mb-2">
              <motion.div
                initial={{ rotate: -10, scale: 0.9 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-orange-500 text-primary-foreground shadow-[0_0_30px_rgba(248,160,11,0.4)]"
              >
                <Send className="h-7 w-7 ml-0.5" />
              </motion.div>
            </div>
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight text-white mb-2">
                OmniPublish
              </CardTitle>
              <CardDescription className="text-white/60 font-medium">
                {isLogin ? "欢迎回来，登录以继续您的多平台发布" : "创建一个新账号开始多平台分发"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="relative z-10 px-8 pb-8">
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.form
                  key="login"
                  action={dispatchLogin}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-white/80 font-medium ml-1">邮箱</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      className="h-12 rounded-xl bg-black/20 border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-white/30 transition-all"
                    />
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="password" className="text-white/80 font-medium ml-1">密码</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      className="h-12 rounded-xl bg-black/20 border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-white/30 transition-all"
                    />
                  </div>
                  {loginError && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-rose-300 text-center bg-rose-500/10 py-2.5 rounded-xl border border-rose-500/20">
                      {loginError}
                    </motion.div>
                  )}
                  <div className="pt-2">
                    <SubmitButton text="登录工作台" />
                  </div>
                </motion.form>
              ) : (
                <motion.form
                  key="register"
                  action={dispatchRegister}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  <div className="space-y-2.5">
                    <Label htmlFor="name" className="text-white/80 font-medium ml-1">昵称</Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="输入您的昵称"
                      required
                      className="h-12 rounded-xl bg-black/20 border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-white/30 transition-all"
                    />
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="reg-email" className="text-white/80 font-medium ml-1">邮箱</Label>
                    <Input
                      id="reg-email"
                      name="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      className="h-12 rounded-xl bg-black/20 border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-white/30 transition-all"
                    />
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="reg-password" className="text-white/80 font-medium ml-1">密码</Label>
                    <Input
                      id="reg-password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      className="h-12 rounded-xl bg-black/20 border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-white placeholder:text-white/30 transition-all"
                    />
                  </div>
                  {registerError && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-rose-300 text-center bg-rose-500/10 py-2.5 rounded-xl border border-rose-500/20">
                      {registerError}
                    </motion.div>
                  )}
                  <div className="pt-2">
                    <SubmitButton text="创建账号并登录" />
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6 pb-8 border-t border-white/5 bg-black/20 relative z-10">
            <div className="text-sm text-center text-white/50">
              {isLogin ? "还没有账号？" : "已有账号？"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:text-orange-400 font-medium focus:outline-none transition-colors ml-1"
              >
                {isLogin ? "立即注册" : "登录现有账号"}
              </button>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

function SubmitButton({ text }: { text: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-primary-foreground font-bold text-[15px] shadow-[0_0_20px_rgba(248,160,11,0.3)] hover:shadow-[0_0_30px_rgba(248,160,11,0.5)] transition-all active:scale-[0.98] border-none"
      type="submit"
      disabled={pending}
    >
      {pending ? "处理中..." : text}
    </Button>
  );
}
