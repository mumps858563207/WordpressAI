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
import { generatePostContent, suggestAmazonProducts, generateSmartPostFromUrl, generateImage } from './services/geminiService';

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
  const [userLoading, setUserLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'editor'>('dashboard');

  useEffect(() => {
    fetchPosts();
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      setUserLoading(true);
      const res = await fetch('/api/me');
      const data = await res.json();
      if (res.ok) {
        setUserInfo({ name: data.name, roles: data.roles });
      } else {
        const errorType = data.status === 401 ? '認證失敗' : 'api_error';
        setUserInfo({ name: '錯誤', roles: [errorType] });
      }
    } catch (error) {
      setUserInfo({ name: '離線', roles: ['fetch_error'] });
    } finally {
      setUserLoading(false);
    }
  };
  
  // Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [suggestions, setSuggestions] = useState<AmazonSuggestion[]>([]);
  const [amazonUrl, setAmazonUrl] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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

  // 處理 AI 生成圖片 (保留此功能用於一般文章生成)
  const processImages = async (imagePrompts: string[], currentContent: string, currentTitle: string) => {
    if (!imagePrompts || imagePrompts.length === 0) return { finalContent: currentContent, featuredImageId: null };
    
    setIsGeneratingImages(true);
    setMessage({ type: 'success', text: `文案已就緒，正在繪製 ${imagePrompts.length} 張 AI 情境配圖...` });
    
    const imageTagMap: { [key: number]: string } = {};
    let featuredImageId: number | null = null;
    let finalContent = currentContent;
    
    for (let i = 0; i < imagePrompts.length; i++) {
      try {
        const imageUrl = await generateImage(imagePrompts[i]);
        if (imageUrl) {
          const fallbackUrl = `https://loremflickr.com/1024/1024/product?lock=${i}`;
          
          try {
            const uploadRes = await fetch('/api/media', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                image: imageUrl, 
                filename: `ai-gen-${Date.now()}-${i}.png` 
              })
            });
            const uploadData = await uploadRes.json();

            if (uploadRes.ok && uploadData.source_url) {
              if (!featuredImageId && uploadData.id) featuredImageId = uploadData.id;
              imageTagMap[i] = `<figure class="wp-block-image size-large is-style-rounded shadow-lg my-8"><img src="${uploadData.source_url}" alt="${currentTitle}" class="wp-image-ai rounded-2xl w-full object-cover"/><figcaption class="text-center text-sm text-gray-500 mt-2">AI 模擬商品情境圖</figcaption></figure>`;
            }
          } catch (uploadErr) {
            console.error(`Upload ${i+1} error`, uploadErr);
          }
        }
      } catch (imgErr) {
        console.error(`Image ${i+1} generation failed`, imgErr);
      }
    }
    
    imagePrompts.forEach((_, index) => {
      const placeholder = `[IMAGE_PLACEHOLDER_${index}]`;
      const tag = imageTagMap[index] || ""; 
      if (finalContent.includes(placeholder)) {
        finalContent = finalContent.replace(new RegExp(`\\[IMAGE_PLACEHOLDER_${index}\\]`, 'g'), tag);
      }
    });
    
    finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
    setIsGeneratingImages(false);
    return { finalContent, featuredImageId };
  };

  // 一般 AI 生成邏輯
  const handleGenerateAI = async () => {
    if (!title) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const [result, productSuggestions] = await Promise.all([
        generatePostContent(title),
        suggestAmazonProducts(title)
      ]);
      
      let finalContent = result.content || '';
      setSuggestions(productSuggestions);
      
      if (result.imagePrompts && result.imagePrompts.length > 0) {
        const imageResult = await processImages(result.imagePrompts, finalContent, title);
        finalContent = imageResult.finalContent;
      }
      
      setContent(finalContent);
    } catch (error) {
      setMessage({ type: 'error', text: 'AI 生成失敗，請稍後再試。' });
    } finally {
      setIsGenerating(false);
    }
  };

  // 智慧生成邏輯 (已移除原廠圖片導入功能)
  const handleSmartGenerate = async (autoPublish = false) => {
    if (!amazonUrl) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const result = await generateSmartPostFromUrl(amazonUrl);
      if (result.title && result.content) {
        setTitle(result.title);
        let finalContent = result.content;

        // 構建精美的 Amazon 導購卡片
        const productLinkHtml = `
          <div class="amazon-product-box" style="border: 2px solid #FF9900; padding: 25px; border-radius: 16px; margin: 40px 0; background: #ffffff; box-shadow: 0 10px 25px rgba(0,0,0,0.05); font-family: sans-serif;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
              <span style="background: #FF9900; color: white; padding: 4px 12px; border-radius: 50px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;">AMAZON CHOICE</span>
              <h4 style="margin: 0; font-size: 1.25rem; color: #232f3e; line-height: 1.4;">${result.title}</h4>
            </div>
            <p style="font-size: 15px; color: #565959; margin-bottom: 20px; line-height: 1.6;">我們為您推薦這款在 Amazon 上深受好評的商品。點擊下方按鈕即可查看即時價格、用戶評價與配送資訊：</p>
            <a href="${amazonUrl}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; background: linear-gradient(180deg, #ffc439 0%, #ffa41c 100%); border: 1px solid #a88734; color: #111; padding: 14px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(213,217,217,.5);">在 Amazon 上查看商品</a>
            <div style="text-align: center; margin-top: 12px;">
              <span style="font-size: 12px; color: #888;">* 價格與供應情況可能隨時間變動</span>
            </div>
          </div>
        `;
        
        // 替換佔位符或追加到末尾
        if (finalContent.includes('[PRODUCT_LINK_PLACEHOLDER]')) {
          finalContent = finalContent.replace(/\[PRODUCT_LINK_PLACEHOLDER\]/g, productLinkHtml);
        } else {
          finalContent += `\n\n${productLinkHtml}`;
        }
        
        // 清理任何遺留的圖片佔位符
        finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
        
        setContent(finalContent);
        
        if (autoPublish) {
          setIsPublishing(true);
          const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              title: result.title, 
              content: finalContent, 
              status: 'publish'
            })
          });
          
          if (res.ok) {
            setMessage({ type: 'success', text: 'AI 已分析網址並成功發布文章！' });
            setTitle(''); setContent(''); setAmazonUrl('');
            fetchPosts();
            setTimeout(() => setActiveTab('dashboard'), 2000);
          } else {
            throw new Error('WordPress 發布失敗');
          }
        } else {
          setMessage({ type: 'success', text: '網址內容分析與文案生成完成！' });
        }
      } else {
        throw new Error('AI 無法從該網址提取資訊');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `操作失敗：${error.message}` });
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
        setTitle(''); setContent(''); setSuggestions([]);
        fetchPosts();
        setTimeout(() => setActiveTab('dashboard'), 2000);
      } else {
        throw new Error('發布失敗');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `錯誤：${error.message}` });
    } finally {
      setIsPublishing(false);
    }
  };

  const addAmazonLink = () => {
    if (!amazonUrl) return;
    const linkHtml = `<p><a href="${amazonUrl}" target="_blank" style="color: #FF9900; font-weight: bold; text-decoration: underline;">在 Amazon 上查看此商品</a></p>`;
    setContent(prev => prev + linkHtml);
    setAmazonUrl('');
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-[#1a1a1a]">
      {/* Sidebar - Desktop */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-black/5 p-6 z-10 flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
            <Sparkles size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">WP AI 管理器</h1>
        </div>

        <div className="space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <LayoutDashboard size={20} />
            <span className="font-medium">控制面板</span>
          </button>
          <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'editor' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}>
            <PlusCircle size={20} />
            <span className="font-medium">新建文章</span>
          </button>
        </div>

        <div className="mt-auto">
          <div className="p-4 bg-gray-50 rounded-2xl border border-black/5">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">已連接網站</p>
            <p className="text-sm font-medium truncate">mumpsaiweb.zeabur.app</p>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 md:p-10 pb-24 lg:pb-10">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-5xl mx-auto">
              <header className="mb-6 md:mb-10">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">控制面板</h2>
                <p className="text-sm md:text-base text-gray-500">管理您的 WordPress 內容與 Amazon 整合。</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10">
                <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs md:text-sm text-gray-500 mb-1">文章總數</p>
                  <p className="text-2xl md:text-3xl font-bold">{(posts || []).length}</p>
                </div>
                <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs md:text-sm text-gray-500 mb-1">當前角色</p>
                  <p className={`text-lg md:text-xl font-bold ${userInfo?.roles?.includes('administrator') ? 'text-emerald-600' : 'text-indigo-600'}`}>
                    {userInfo ? (userInfo.roles?.[0] === 'administrator' ? '管理者' : '編輯者') : '載入中...'}
                  </p>
                </div>
                <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs md:text-sm text-gray-500 mb-1">AI 狀態</p>
                  <p className="text-lg md:text-xl font-bold text-indigo-600">系統就緒</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="p-5 md:p-6 border-b border-black/5 flex justify-between items-center">
                  <h3 className="font-bold">近期文章</h3>
                  <button onClick={fetchPosts} className="text-sm text-emerald-600 hover:underline">重新整理</button>
                </div>
                <div className="divide-y divide-black/5">
                  {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>
                  ) : posts.map(post => (
                    <div key={post.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4 truncate">
                        <FileText className="text-gray-400 flex-shrink-0" />
                        <div className="truncate">
                          <h4 className="font-bold text-sm md:text-base truncate" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                          <p className="text-xs text-gray-500">{new Date(post.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <a href={post.link} target="_blank" className="p-2 hover:bg-gray-200 rounded-lg"><ExternalLink size={18} /></a>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="editor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-5xl mx-auto">
              <header className="mb-6 md:mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">撰寫文章</h2>
                  <p className="text-sm md:text-base text-gray-500">使用智慧分析將 Amazon 產品轉化為高品質文章。</p>
                </div>
                <button onClick={handlePublish} disabled={isPublishing || !title || !content} className="w-full sm:w-auto bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50">
                  {isPublishing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  發布文章
                </button>
              </header>

              {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <p className="font-medium">{message.text}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">文章標題</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文章標題..." className="w-full text-2xl font-bold border-none focus:ring-0" />
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">文章內容 (HTML)</label>
                      <button onClick={handleGenerateAI} disabled={isGenerating || !title} className="text-indigo-600 flex items-center gap-2 text-sm font-bold hover:bg-indigo-50 px-3 py-1 rounded-lg transition-all disabled:opacity-50">
                        {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                        AI 寫作
                      </button>
                    </div>
                    <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="內容..." className="w-full h-[450px] border-none focus:ring-0 font-mono text-sm leading-relaxed resize-none" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <ShoppingCart className="text-orange-500" size={20} />
                      <h3 className="font-bold">Amazon 助手</h3>
                    </div>
                    <div className="space-y-4">
                      <input type="text" value={amazonUrl} onChange={(e) => setAmazonUrl(e.target.value)} placeholder="貼上 Amazon 連結..." className="w-full bg-gray-50 border border-black/5 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
                      <button onClick={() => handleSmartGenerate(false)} disabled={isGenerating || !amazonUrl} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                        {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        分析網址並生成
                      </button>
                      <button onClick={() => handleSmartGenerate(true)} disabled={isGenerating || isPublishing || !amazonUrl} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                        <Send size={16} />
                        分析並一鍵發布
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg">
                    <h4 className="font-bold mb-2">操作提示</h4>
                    <p className="text-sm opacity-90 leading-relaxed">
                      現在「智能分析」會專注於產品深度文案。圖片功能已調整為僅在一般 AI 生成時觸發，確保您的 Amazon 導購文章更輕量且符合規範。
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
