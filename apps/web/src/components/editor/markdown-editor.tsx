"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { useDebouncedCallback } from "use-debounce";
import { updateDocument } from "@/actions/documents";
import { generateAIBlend, generateDocumentStoryboard, enhanceDocumentContent } from "@/actions/ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, ArrowLeft, Sparkles, LayoutPanelLeft, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AIBlendResult } from "@/actions/ai";
import { StoryboardResult } from "@omnipublish/ai-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface EditorProps {
  initialId: string;
  initialTitle: string;
  initialMarkdown: string;
}

export function MarkdownEditor({ initialId, initialTitle, initialMarkdown }: EditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialMarkdown);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null);
  const [showStoryboard, setShowStoryboard] = useState(false);

  const handleGenerateAI = async () => {
    if (!content.trim()) {
      toast.error("文档内容为空,无法生成");
      return;
    }
    setIsGenerating(true);
    try {
      const result: AIBlendResult = await generateAIBlend(initialId, {
        title: true,
        summary: false,
        tags: false,
      });
      if (result.title?.success && result.title.data) {
        setTitle(result.title.data);
        debouncedSave(result.title.data, content);
        toast.success("已生成标题");
      } else if (result.title?.errorMessage) {
        toast.error(`生成失败: ${result.title.errorMessage}`);
      } else {
        toast.error("生成失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成异常");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnhanceContent = async () => {
    if (!content.trim()) {
      toast.error("文档内容为空，无法完善");
      return;
    }
    setIsGenerating(true);
    toast.loading("DeepSeek 正在丰富内容，并由 MiniMax 生成配图，请耐心等待 (约需 1-2 分钟)...", { id: "enhance" });
    try {
      const enrichedMarkdown = await enhanceDocumentContent(initialId);
      setContent(enrichedMarkdown);
      toast.success("内容已完善并配图！", { id: "enhance" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "完善失败", { id: "enhance" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAIStoryboard = async () => {
    if (!content.trim()) {
      toast.error("文档内容为空,无法生成");
      return;
    }
    setIsGenerating(true);
    toast.loading("DeepSeek 正在提炼分镜，这可能需要几十秒...", { id: "storyboard" });
    try {
      const result = await generateDocumentStoryboard(initialId);
      if (result.success && result.data) {
        toast.success(`生成成功！共提炼 ${result.data.slides.length} 页卡片`, { id: "storyboard" });
        console.log("Storyboard:", result.data);
        setStoryboard(result.data);
        setShowStoryboard(true);
      } else {
        toast.error(`生成失败: ${result.errorMessage}`, { id: "storyboard" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成异常", { id: "storyboard" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-save logic (debounced 1000ms)
  const debouncedSave = useDebouncedCallback(
    async (newTitle: string, newContent: string) => {
      setIsSaving(true);
      try {
        await updateDocument(initialId, newContent, newTitle);
        setLastSaved(new Date());
      } catch (error) {
        toast.error("自动保存失败");
      } finally {
        setIsSaving(false);
      }
    },
    1000
  );

  const handleContentChange = useCallback((val: string) => {
    setContent(val);
    debouncedSave(title, val);
  }, [title, debouncedSave]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    debouncedSave(newTitle, content);
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      await updateDocument(initialId, content, title);
      setLastSaved(new Date());
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] -m-6">
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/documents")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={title}
            onChange={handleTitleChange}
            className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 max-w-md px-0"
            placeholder="无标题文档"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>
            {isSaving ? "保存中..." : `已保存于 ${lastSaved.toLocaleTimeString()}`}
          </span>
          <Button
            size="sm"
            variant="default"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleEnhanceContent}
            disabled={isGenerating || isSaving}
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {isGenerating ? "完善中..." : "一键完善 (DeepSeek+MiniMax)"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3">
                <Sparkles className="h-4 w-4 mr-2" />
                其他 AI 功能
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleGenerateAI} className="cursor-pointer">
                生成优化标题
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGenerateAIStoryboard} className="cursor-pointer">
                提炼图文分镜
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="secondary" onClick={async () => {
            setIsGenerating(true);
            try {
              toast.loading("正在由 MiniMax 生成精美的封面背景图，请耐心等待...", { id: "cover" });
              // Trigger a dedicated server action to generate and save cover image, then return the url
              const res = await fetch(`/api/documents/${initialId}/cover`, { method: "POST" });
              const data = await res.json();
              if (data.url) {
                toast.success("封面图已生成并保存！", { id: "cover" });
              } else {
                toast.error(data.error || "封面生成失败", { id: "cover" });
              }
            } catch (e) {
              toast.error("请求失败", { id: "cover" });
            } finally {
              setIsGenerating(false);
              // 生成完成后重新刷新页面数据，以确保能看到最新状态
              router.refresh();
            }
          }} disabled={isGenerating || isSaving} className="bg-primary/10 text-primary hover:bg-primary/20">
            <Sparkles className="h-4 w-4 mr-2" />
            生成封面背景图
          </Button>
          <Button size="sm" onClick={handleManualSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            保存
          </Button>
        </div>
      </div>

      {/* Editor Split View */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: CodeMirror */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="w-1/2 border-r overflow-auto bg-slate-50 dark:bg-slate-900"
        >
          <CodeMirror
            value={content}
            height="100%"
            extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
            onChange={handleContentChange}
            className="h-full text-base [&>.cm-editor]:h-full"
            theme="light" // 还原为 light 主题，期望文字为黑色
          />
        </motion.div>

        {/* Right: Markdown Preview */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="w-1/2 overflow-auto bg-white dark:bg-slate-950 p-8"
        >
          <div className="prose prose-slate dark:prose-invert max-w-none transition-all duration-500 ease-in-out text-slate-900 dark:text-slate-100 [&_h1]:text-slate-900 dark:[&_h1]:text-slate-100 [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100 [&_p]:text-slate-900 dark:[&_p]:text-slate-100 [&_li]:text-slate-900 dark:[&_li]:text-slate-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "*请输入内容以预览*"}
            </ReactMarkdown>
          </div>
        </motion.div>
      </div>

      {/* Storyboard Visualizer Dialog */}
      <Dialog open={showStoryboard} onOpenChange={setShowStoryboard}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI 自动排版卡片预览 ({storyboard?.title})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-x-auto flex items-center gap-6 p-4 bg-slate-100 dark:bg-slate-900 rounded-lg">
            {storyboard?.slides.map((slide, idx) => (
              <div
                key={idx}
                className="flex-none w-[300px] h-[400px] bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col relative group"
              >
                {/* Simulated SVG render visually */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 z-0" />
                <div className="relative z-10 p-8 flex flex-col h-full text-white">
                  <div className="text-sm font-medium opacity-50 mb-4 tracking-wider uppercase">
                    {slide.role === 'cover' ? 'COVER' : slide.role === 'summary' ? 'SUMMARY' : 'PAGE ' + slide.page}
                  </div>
                  <h3 className="text-2xl font-bold leading-tight mb-4 text-white drop-shadow-md">
                    {slide.headline}
                  </h3>
                  <p className="text-sm opacity-90 leading-relaxed text-slate-200">
                    {slide.body}
                  </p>

                  <div className="mt-auto pt-4 border-t border-white/20 flex justify-between items-center opacity-60 text-xs">
                    <span>OmniPublish</span>
                    <span>{slide.page} / {storyboard.slides.length}</span>
                  </div>
                </div>

                {/* Visual Prompt Overlay on Hover */}
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-center text-white">
                  <span className="text-xs font-bold text-blue-400 mb-2">背景图生成提示词 (Visual Prompt)</span>
                  <p className="text-sm italic">{slide.visualPrompt}</p>
                  <p className="text-xs text-slate-400 mt-4">*D16 将使用此提示词调用 MiniMax 自动生成背景底图</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
