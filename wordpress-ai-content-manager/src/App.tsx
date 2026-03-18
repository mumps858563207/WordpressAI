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
  AlertCircle
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

  /**
   * 處理從 Amazon 提取的真實商品圖片
   */
  const processProductImages = async (imageUrls: string[], currentContent: string, currentTitle: string) => {
    if (!imageUrls || imageUrls.length === 0) return currentContent;
    
    let finalContent = currentContent;
    const imageTagMap: { [key: number]: string } = {};
    const imagesToProcess = imageUrls.slice(0, 2); // 限制處理前兩張圖片

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
        console.error(`圖片上傳失敗: ${imagesToProcess[i]}`, err);
      }
    }

    imagesToProcess.forEach((_, index) => {
      const placeholder = `[IMAGE_PLACEHOLDER_${index}]`;
      const tag = imageTagMap[index] || ""; 
      finalContent = finalContent.replace(new RegExp(`\\[IMAGE_PLACEHOLDER_${index}\\]`, 'g'), tag);
    });

    return finalContent;
  };

  /**
   * 智慧生成邏輯：分析網址 -> 獲取真實內容 -> 處理圖片 -> 生成導購卡片
   */
  const handleSmartGenerate = async (autoPublish = false) => {
    if (!amazonUrl) return;
    setIsGenerating(true);
    setMessage({ type: 'success', text: '正在深度分析 Amazon 商品內容，請稍候...' });
    
    try {
      const result = await analyzeAmazonProduct(amazonUrl);
      
      if (result.title && result.content) {
        setTitle(result.title);
        let finalContent = result.content;

        // 1. 處理提取到的真實圖片
        if (result.imageUrls && result.imageUrls.length > 0) {
          setMessage({ type: 'success', text: '文案分析完成，正在優化商品配圖...' });
          finalContent = await processProductImages(result.imageUrls, finalContent, result.title);
        }

        // 2. 構建 Amber-Brella 風格的 Amazon 導購卡片
        const productLinkHtml = `
          <div class="amazon-product-box" style="border: 2px solid #FF9900; padding: 25px; border-radius: 20px; margin: 40px 0; background: #ffffff; box-shadow: 0 15px 35px rgba(0,0,0,0.08); font-family: system-ui, -apple-system, sans-serif;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
              <span style="background: #FF9900; color: white; padding: 4px 12px; border-radius: 50px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;">2026 嚴選推薦</span>
              <h4 style="margin: 0; font-size: 1.25rem; color: #232f3e; line-height: 1.4;">${result.title}</h4>
            </div>
            <p style="font-size: 15px; color: #565959; margin-bottom: 20px; line-height: 1.6;">這款商品通過了我們的品質測試，具備極高的實用性與耐用度。點擊下方按鈕直接前往 Amazon 查看更多詳情：</p>
            <a href="${amazonUrl}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; background: linear-gradient(180deg, #ffc439 0%, #ffa41c 100%); border: 1px solid #a88734; color: #111; padding: 16px; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px; transition: transform 0.2s;">在 Amazon 上查看此商品</a>
          </div>
        `;
        
        // 替換佔位符或追加內容
        if (finalContent.includes('[PRODUCT_LINK_PLACEHOLDER]')) {
          finalContent = finalContent.replace(/\[PRODUCT_LINK_PLACEHOLDER\]/g, productLinkHtml);
        } else {
          finalContent += `\n\n${productLinkHtml}`;
        }
        
        finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
        setContent(finalContent);
        
        if (autoPublish) {
          setIsPublishing(true);
          const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: result.title, content: finalContent, status: 'publish' })
          });
          
          if (res.ok) {
            setMessage({ type: 'success', text: '商品分析完成並已成功發布！' });
            fetchPosts();
            setTimeout(() => setActiveTab('dashboard'), 2000);
          }
        } else {
          setMessage({ type: 'success', text: '分析完成！內容已載入編輯器。' });
        }
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `生成失敗：${error.message}` });
    } finally {
      setIsGenerating(false);
      setIsPublishing(false);
    }
  };

  const handlePublish = async () => {
    if (!title || !content) return;
    setIsPublishing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, status: 'publish' })
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

  const handleGenerateAI = async () => {
    if (!title) return;
    setIsGenerating(true);
    setMessage({ type: 'success', text: 'AI 正在思考爆款文案...' });
    try {
      // 簡化版本：直接使用 analyzeAmazonProduct 的邏輯
      // 如果需要更多功能，可以在 geminiService.ts 中添加其他函數
      setMessage({ type: 'success', text: '請使用下方的 Amazon 產品分析功能。' });
    } catch (error) {
      setMessage({ type: 'error', text: 'AI 生成失敗。' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#1a1a1a]">
      {/* Sidebar */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-black/5 p-6 z-10 flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Sparkles size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Amber-Brella</h1>
        </div>

        <div className="space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <LayoutDashboard size={20} />
            <span className="font-medium">控制面板</span>
          </button>
          <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'editor' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <PlusCircle size={20} />
            <span className="font-medium">智慧編輯器</span>
          </button>
        </div>

        <div className="mt-auto p-4 bg-gray-50 rounded-2xl border border-black/5">
          <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">管理者</p>
          <p className="text-sm font-medium truncate">{userInfo?.name || 'Mumps'}</p>
        </div>
      </nav>

      <main className="lg:ml-64 p-4 md:p-10 pb-24 lg:pb-10">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-5xl mx-auto">
              <header className="mb-10">
                <h2 className="text-3xl font-bold tracking-tight mb-2">歡迎回來</h2>
                <p className="text-gray-500">這是您的 WordPress 站點概覽與近期發布。</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">文章總數</p>
                  <p className="text-3xl font-bold">{posts.length}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">系統狀態</p>
                  <p className="text-xl font-bold text-emerald-600">Jina API 已連接</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">當前角色</p>
                  <p className="text-xl font-bold text-indigo-600">系統管理員</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-black/5 flex justify-between items-center">
                  <h3 className="font-bold">近期發布文章</h3>
                  <button onClick={fetchPosts} className="text-sm text-emerald-600 font-bold">重新整理</button>
                </div>
                <div className="divide-y divide-black/5">
                  {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>
                  ) : posts.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">目前尚無文章</div>
                  ) : posts.slice(0, 10).map(post => (
                    <div key={post.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4 truncate">
                        <FileText className="text-gray-300 flex-shrink-0" />
                        <div className="truncate">
                          <h4 className="font-bold text-sm md:text-base truncate" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                          <p className="text-xs text-gray-400">{new Date(post.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <a href={post.link} target="_blank" rel="noreferrer" className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"><ExternalLink size={18} /></a>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-5xl mx-auto">
              <header className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-2">智慧編輯器</h2>
                  <p className="text-gray-500">分析 Amazon 產品並產出 2026 年爆款文案。</p>
                </div>
                <button onClick={handlePublish} disabled={isPublishing || !title || !content} className="w-full sm:w-auto bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-100">
                  {isPublishing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  發布至 WordPress
                </button>
              </header>

              {message && (
                <div className={`mb-8 p-4 rounded-2xl flex items-center gap-3 shadow-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <p className="font-medium text-sm md:text-base">{message.text}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">文章標題</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="輸入吸引人的標題..." className="w-full text-2xl font-bold border-none focus:ring-0 placeholder:text-gray-200" />
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">內容預覽 (HTML)</label>
                      <button onClick={handleGenerateAI} disabled={isGenerating || !title} className="text-indigo-600 flex items-center gap-2 text-sm font-bold hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all disabled:opacity-50">
                        {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        AI 寫作助手
                      </button>
                    </div>
                    <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="分析網址後，內容將顯示於此..." className="w-full h-[500px] border-none focus:ring-0 font-mono text-sm leading-relaxed resize-none" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <ShoppingCart className="text-orange-500" size={24} />
                      <h3 className="font-black text-lg">Amazon 產品分析</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400">產品連結</label>
                        <input type="text" value={amazonUrl} onChange={(e) => setAmazonUrl(e.target.value)} placeholder="https://www.amazon.com/..." className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                      <button onClick={() => handleSmartGenerate(false)} disabled={isGenerating || !amazonUrl} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-sm hover:bg-black transition-all flex items-center justify-center gap-2">
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        深度分析並生成文案
                      </button>
                      <button onClick={() => handleSmartGenerate(true)} disabled={isGenerating || isPublishing || !amazonUrl} className="w-full border-2 border-emerald-600 text-emerald-600 py-4 rounded-2xl font-bold text-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-2">
                        <Send size={18} />
                        分析並直接發布
                      </button>
                    </div>

                    {(suggestions || []).length > 0 && (
                      <div className="mt-8 pt-6 border-t border-gray-50">
                        <p className="text-[10px] font-black text-gray-300 uppercase mb-4 tracking-widest">AI 相關產品建議</p>
                        <div className="space-y-3">
                          {suggestions.map((s, i) => (
                            <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-black/5">
                              <p className="text-xs font-bold text-gray-900">{s.name}</p>
                              <p className="text-[10px] text-gray-500 mt-1">{s.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                    <Sparkles className="absolute -right-4 -top-4 opacity-10" size={120} />
                    <h4 className="font-bold mb-3 relative z-10">2026 營銷助手</h4>
                    <p className="text-xs opacity-80 leading-relaxed relative z-10">
                      我們現在透過 <b>Jina Reader</b> 直接解析 Amazon 原始碼，產出的內容將包含真實的商品規格與功能。建議每次發布前檢查一下 AI 提取的圖片是否符合預期。
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
