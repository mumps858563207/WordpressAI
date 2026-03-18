import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  FileText, 
  ShoppingCart, 
  Send, 
  Sparkles, 
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  analyzeAmazonProduct
} from './services/geminiService';

interface Post {
  id: number;
  title: { rendered: string };
  status: string;
  date: string;
  link: string;
}

interface AmazonSuggestion {
  name: string;
  reason: string;
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [userInfo, setUserInfo] = useState<{ name: string, roles: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor'>('dashboard');

  // Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [suggestions, setSuggestions] = useState<AmazonSuggestion[]>([]);
  const [amazonUrl, setAmazonUrl] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchPosts();
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (res.ok) {
        setUserInfo({ name: data.name, roles: data.roles });
      }
    } catch (error) {
      console.error('Failed to fetch user info');
    }
  };

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  };

  const processProductImages = async (imageUrls: string[], currentContent: string, currentTitle: string) => {
    if (!imageUrls || imageUrls.length === 0) return currentContent;
    let finalContent = currentContent;
    const imageTagMap: { [key: number]: string } = {};
    const imagesToProcess = imageUrls.slice(0, 2);

    for (let i = 0; i < imagesToProcess.length; i++) {
      try {
        const uploadRes = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image: imagesToProcess[i], 
            filename: `amberbrella-prod-${Date.now()}-${i}.jpg` 
          })
        });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok && uploadData.source_url) {
          imageTagMap[i] = `
            <figure class="wp-block-image size-large is-style-default my-8 shadow-sm">
              <img src="${uploadData.source_url}" alt="${currentTitle}" class="rounded-2xl w-full object-cover"/>
              <figcaption class="text-center text-sm text-gray-400 mt-2">產品實物拍攝</figcaption>
            </figure>`;
        }
      } catch (err) {
        console.error(`圖片上傳失敗`, err);
      }
    }
    imagesToProcess.forEach((_, index) => {
      finalContent = finalContent.replace(new RegExp(`\\[IMAGE_PLACEHOLDER_${index}\\]`, 'g'), imageTagMap[index] || "");
    });
    return finalContent;
  };

  const handleSmartGenerate = async (autoPublish = false) => {
    if (!amazonUrl) return;
    setIsGenerating(true);
    setMessage({ type: 'success', text: '正在深度分析 Amazon 商品內容...' });
    try {
      const result = await analyzeAmazonProduct(amazonUrl);
      if (result.title && result.content) {
        setTitle(result.title);
        let finalContent = result.content;
        if (result.imageUrls && result.imageUrls.length > 0) {
          finalContent = await processProductImages(result.imageUrls, finalContent, result.title);
        }
        const productLinkHtml = `
          <div class="amazon-product-box" style="border: 2px solid #FF9900; padding: 25px; border-radius: 20px; margin: 40px 0; background: #ffffff; box-shadow: 0 15px 35px rgba(0,0,0,0.08); font-family: system-ui, -apple-system, sans-serif;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
              <span style="background: #FF9900; color: white; padding: 4px 12px; border-radius: 50px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;">2026 嚴選推薦</span>
              <h4 style="margin: 0; font-size: 1.25rem; color: #232f3e; line-height: 1.4;">${result.title}</h4>
            </div>
            <a href="${amazonUrl}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; background: linear-gradient(180deg, #ffc439 0%, #ffa41c 100%); border: 1px solid #a88734; color: #111; padding: 16px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px;">在 Amazon 上查看此商品</a>
          </div>`;
        finalContent = finalContent.includes('[PRODUCT_LINK_PLACEHOLDER]') ? finalContent.replace(/\[PRODUCT_LINK_PLACEHOLDER\]/g, productLinkHtml) : finalContent + `\n\n${productLinkHtml}`;
        finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
        setContent(finalContent);
        if (autoPublish) {
          handlePublish(result.title, finalContent);
        } else {
          setMessage({ type: 'success', text: '分析完成！內容已載入。' });
        }
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `生成失敗：${error.message}` });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async (pTitle = title, pContent = content) => {
    if (!pTitle || !pContent) return;
    setIsPublishing(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pTitle, content: pContent, status: 'publish' })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '文章發布成功！' });
        setTitle(''); setContent('');
        fetchPosts();
        setTimeout(() => setActiveTab('dashboard'), 2000);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `發布錯誤：${error.message}` });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#1a1a1a]">
      {/* 桌面端側邊欄 - 僅在 lg 以上顯示 */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-black/5 p-6 z-20 flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Sparkles size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Amber-Brella</h1>
        </div>
        <div className="space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <LayoutDashboard size={20} /> <span className="font-medium">控制面板</span>
          </button>
          <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'editor' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <PlusCircle size={20} /> <span className="font-medium">智慧編輯器</span>
          </button>
        </div>
        <div className="mt-auto p-4 bg-gray-50 rounded-2xl border border-black/5">
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">管理者</p>
          <p className="text-sm font-medium truncate">{userInfo?.name || 'Mumps'}</p>
        </div>
      </nav>

      {/* 手機版底部導覽列 - 僅在 lg 以下顯示 */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 px-4 py-2 z-50 flex justify-around items-center shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 rounded-xl ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-gray-400'}`}>
          <LayoutDashboard size={22} />
          <span className="text-[10px] mt-1 font-bold">概覽</span>
        </button>
        <button onClick={() => setActiveTab('editor')} className={`flex flex-col items-center p-2 rounded-xl ${activeTab === 'editor' ? 'text-emerald-600' : 'text-gray-400'}`}>
          <PlusCircle size={22} />
          <span className="text-[10px] mt-1 font-bold">編輯器</span>
        </button>
      </nav>

      {/* 主內容區 - 響應式 Padding */}
      <main className="lg:ml-64 p-4 md:p-8 lg:p-10 pb-24 lg:pb-10">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-5xl mx-auto">
              <header className="mb-6 lg:mb-10">
                <h2 className="text-2xl lg:text-3xl font-bold tracking-tight mb-2">歡迎回來</h2>
                <p className="text-gray-500 text-sm">這是您的近期發布概覽。</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1 uppercase font-bold tracking-wider">文章總數</p>
                  <p className="text-3xl font-bold">{posts.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1 uppercase font-bold tracking-wider">系統狀態</p>
                  <p className="text-lg font-bold text-emerald-600">Jina API 已連接</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-black/5 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold text-sm lg:text-base">近期發布</h3>
                  <button onClick={fetchPosts} className="text-xs text-emerald-600 font-bold">刷新內容</button>
                </div>
                <div className="divide-y divide-black/5">
                  {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>
                  ) : posts.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">目前尚無文章</div>
                  ) : posts.slice(0, 8).map(post => (
                    <div key={post.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText size={18} className="text-gray-300 flex-shrink-0" />
                        <div className="truncate">
                          <h4 className="font-bold text-sm truncate" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                          <p className="text-[10px] text-gray-400">{new Date(post.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <a href={post.link} target="_blank" rel="noreferrer" className="p-2 text-emerald-600"><ExternalLink size={16} /></a>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-5xl mx-auto">
              <header className="mb-6 lg:mb-10 flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight mb-2">智慧編輯器</h2>
                  <p className="text-sm text-gray-500">輸入 Amazon 連結，由 AI 幫您產出文案。</p>
                </div>
                <button 
                  onClick={() => handlePublish()} 
                  disabled={isPublishing || !title || !content} 
                  className="w-full sm:w-auto bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-40 transition-all shadow-lg shadow-emerald-100"
                >
                  {isPublishing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  發布至 WordPress
                </button>
              </header>

              {message && (
                <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'} border border-black/5 shadow-sm`}>
                  {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <p className="font-medium text-xs md:text-sm">{message.text}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                <div className="lg:col-span-2 space-y-4 lg:space-y-6">
                  <div className="bg-white p-4 lg:p-6 rounded-2xl border border-black/5 shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">文章標題</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題將自動生成..." className="w-full text-lg lg:text-2xl font-bold border-none focus:ring-0 placeholder:text-gray-200 p-0 bg-transparent" />
                  </div>

                  <div className="bg-white p-4 lg:p-6 rounded-2xl border border-black/5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">內容預覽 (HTML)</label>
                      <Sparkles size={16} className="text-indigo-500" />
                    </div>
                    <textarea 
                      value={content} 
                      onChange={(e) => setContent(e.target.value)} 
                      placeholder="分析產品後這裡會顯示內容..." 
                      className="w-full h-[350px] lg:h-[500px] border-none focus:ring-0 font-mono text-xs lg:text-sm leading-relaxed resize-none p-0 bg-transparent" 
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <ShoppingCart className="text-orange-500" size={20} />
                      <h3 className="font-black text-base lg:text-lg">產品分析工具</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Amazon 連結</label>
                        <input type="text" value={amazonUrl} onChange={(e) => setAmazonUrl(e.target.value)} placeholder="貼上網址..." className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                      </div>
                      <button 
                        onClick={() => handleSmartGenerate(false)} 
                        disabled={isGenerating || !amazonUrl} 
                        className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-black transition-all"
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        深度分析生成
                      </button>
                      <button 
                        onClick={() => handleSmartGenerate(true)} 
                        disabled={isGenerating || isPublishing || !amazonUrl} 
                        className="w-full border-2 border-emerald-600 text-emerald-600 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                      >
                        分析並直接發布
                      </button>
                    </div>
                  </div>

                  <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden hidden sm:block">
                    <Sparkles className="absolute -right-4 -top-4 opacity-10" size={100} />
                    <h4 className="font-bold mb-2 relative z-10 text-sm">2026 營銷助手</h4>
                    <p className="text-[11px] opacity-80 leading-relaxed relative z-10">
                      透過 <b>Jina Reader</b> 直接解析，包含真實規格與 2 張精選圖片。建議發布前檢查圖片預覽。
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
  );
}
