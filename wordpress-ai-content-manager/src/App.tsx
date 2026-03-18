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
      console.log('Fetching user info...');
      const res = await fetch('/api/me');
      const data = await res.json();
      console.log('User info response:', data);
      if (res.ok) {
        setUserInfo({ name: data.name, roles: data.roles });
      } else {
        const errorType = data.status === 401 ? '認證失敗' : 'api_error';
        setUserInfo({ name: '錯誤', roles: [errorType] });
      }
    } catch (error) {
      console.error('Fetch user info failed:', error);
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

  const processImages = async (imagePrompts: string[], currentContent: string, currentTitle: string) => {
    console.log("Processing images with prompts:", imagePrompts);
    if (!imagePrompts || imagePrompts.length === 0) return { finalContent: currentContent, featuredImageId: null };
    
    setIsGeneratingImages(true);
    setMessage({ type: 'success', text: `已生成文案，正在繪製 ${imagePrompts.length} 張商品配圖...` });
    // Maintain a mapping of index to tag to ensure correct placement
    const imageTagMap: { [key: number]: string } = {};
    let featuredImageId: number | null = null;
    let finalContent = currentContent;
    
    for (let i = 0; i < imagePrompts.length; i++) {
      try {
        console.log(`Generating image ${i+1}/${imagePrompts.length}...`);
        const imageUrl = await generateImage(imagePrompts[i]);
        if (imageUrl) {
          // Default to direct URL first as a safe fallback
          const fallbackUrl = `https://loremflickr.com/1024/1024/product?lock=${i}`;
          imageTagMap[i] = `<figure class="wp-block-image size-large is-style-rounded shadow-lg my-8"><img src="${imageUrl}" alt="${currentTitle}" referrerPolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackUrl}';" class="wp-image-ai rounded-2xl w-full object-cover"/><figcaption class="text-center text-sm text-gray-500 mt-2">AI 模擬商品情境圖</figcaption></figure>`;

          console.log(`Uploading image ${i+1} to WordPress...`);
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
              console.log(`Image ${i+1} uploaded successfully:`, uploadData.source_url);
              if (!featuredImageId && uploadData.id) {
                featuredImageId = uploadData.id;
              }
              // Update with WordPress URL if successful
              imageTagMap[i] = `<figure class="wp-block-image size-large is-style-rounded shadow-lg my-8"><img src="${uploadData.source_url}" alt="${currentTitle}" referrerPolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackUrl}';" class="wp-image-ai rounded-2xl w-full object-cover"/><figcaption class="text-center text-sm text-gray-500 mt-2">AI 模擬商品情境圖</figcaption></figure>`;
            } else {
              console.warn(`Upload ${i+1} failed, using direct URL fallback:`, uploadData);
            }
          } catch (uploadErr) {
            console.error(`Upload ${i+1} error, using direct URL fallback`, uploadErr);
          }
        }
      } catch (imgErr) {
        console.error(`Image ${i+1} generation failed`, imgErr);
      }
    }
    
    // Replace placeholders with actual image tags or clean them up
    let placeholdersFound = false;
    imagePrompts.forEach((_, index) => {
      const placeholder = `[IMAGE_PLACEHOLDER_${index}]`;
      const tag = imageTagMap[index] || ""; 
      
      if (finalContent.includes(placeholder)) {
        placeholdersFound = true;
        const regex = new RegExp(`\\[IMAGE_PLACEHOLDER_${index}\\]`, 'g');
        finalContent = finalContent.replace(regex, tag);
      }
    });
    
    // If no placeholders were found but we have images, append them to the content
    if (!placeholdersFound) {
      console.log("No placeholders found in content, appending images to the end.");
      Object.keys(imageTagMap).sort().forEach((key) => {
        const index = parseInt(key);
        finalContent += `\n\n${imageTagMap[index]}`;
      });
    }
    
    // Final cleanup for any unexpected placeholders
    finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
    
    const successCount = Object.keys(imageTagMap).length;
    if (successCount > 0) {
      setMessage({ type: 'success', text: `AI 已成功生成內容與 ${successCount} 張配圖！` });
    } else if (imagePrompts.length > 0) {
      setMessage({ type: 'error', text: 'AI 已生成內容，但配圖生成或上傳失敗，請檢查 WordPress 設定。' });
    }
    
    setIsGeneratingImages(false);
    return { finalContent, featuredImageId };
  };

  const processRealImages = async (imageUrls: string[], currentContent: string, currentTitle: string) => {
    console.log("Processing real images from URLs:", imageUrls);
    if (!imageUrls || imageUrls.length === 0) return { finalContent: currentContent, featuredImageId: null };
    
    setIsGeneratingImages(true);
    setMessage({ type: 'success', text: `已生成文案，正在導入 ${imageUrls.length} 張商品原圖...` });
    
    const imageTagMap: { [key: number]: string } = {};
    let featuredImageId: number | null = null;
    let finalContent = currentContent;
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const imageUrl = imageUrls[i];
        if (imageUrl) {
          const fallbackUrl = `https://loremflickr.com/1024/1024/product?lock=${i}`;
          imageTagMap[i] = `<figure class="wp-block-image size-large is-style-rounded shadow-lg my-8"><img src="${imageUrl}" alt="${currentTitle}" referrerPolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackUrl}';" class="wp-image-real rounded-2xl w-full object-cover"/><figcaption class="text-center text-sm text-gray-500 mt-2">商品原廠圖片</figcaption></figure>`;

          console.log(`Uploading real image ${i+1} to WordPress...`);
          try {
            const uploadRes = await fetch('/api/media', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                image: imageUrl, 
                filename: `amazon-prod-${Date.now()}-${i}.png` 
              })
            });
            
            const uploadData = await uploadRes.json();

            if (uploadRes.ok && uploadData.source_url) {
              if (!featuredImageId && uploadData.id) {
                featuredImageId = uploadData.id;
              }
              imageTagMap[i] = `<figure class="wp-block-image size-large is-style-rounded shadow-lg my-8"><img src="${uploadData.source_url}" alt="${currentTitle}" referrerPolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackUrl}';" class="wp-image-real rounded-2xl w-full object-cover"/><figcaption class="text-center text-sm text-gray-500 mt-2">商品原廠圖片</figcaption></figure>`;
            }
          } catch (uploadErr) {
            console.error(`Upload real image ${i+1} error`, uploadErr);
          }
        }
      } catch (imgErr) {
        console.error(`Real image ${i+1} processing failed`, imgErr);
      }
    }
    
    imageUrls.forEach((_, index) => {
      const placeholder = `[IMAGE_PLACEHOLDER_${index}]`;
      const tag = imageTagMap[index] || ""; 
      if (finalContent.includes(placeholder)) {
        const regex = new RegExp(`\\[IMAGE_PLACEHOLDER_${index}\\]`, 'g');
        finalContent = finalContent.replace(regex, tag);
      }
    });
    
    finalContent = finalContent.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, '');
    setIsGeneratingImages(false);
    return { finalContent, featuredImageId };
  };

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
      console.error('AI Generation failed');
      setMessage({ type: 'error', text: 'AI 生成失敗，請稍後再試。' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSmartGenerate = async (autoPublish = false) => {
    if (!amazonUrl) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const result = await generateSmartPostFromUrl(amazonUrl);
      if (result.title && result.content) {
        setTitle(result.title);
        let finalContent = result.content;
        let featuredImageId: number | null = null;
        
        // Use real images from Amazon
        if (result.imageUrls && result.imageUrls.length > 0) {
          const imageResult = await processRealImages(result.imageUrls, finalContent, result.title);
          finalContent = imageResult.finalContent;
          featuredImageId = imageResult.featuredImageId;
        }

        // Replace product link placeholder
        const productLinkHtml = `
          <div class="amazon-product-box" style="border: 2px solid #FF9900; padding: 20px; border-radius: 12px; margin: 30px 0; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
              <div style="background: #FF9900; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">AMAZON 推薦</div>
              <h4 style="margin: 0; font-size: 18px; color: #111;">${result.title}</h4>
            </div>
            <p style="font-size: 14px; color: #555; margin-bottom: 15px;">點擊下方連結前往 Amazon 查看此商品的最新價格與詳細資訊：</p>
            <a href="${amazonUrl}" target="_blank" style="display: block; text-align: center; background: #FF9900; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; transition: background 0.2s;">立即前往 Amazon 查看</a>
          </div>
        `;
        
        if (finalContent.includes('[PRODUCT_LINK_PLACEHOLDER]')) {
          finalContent = finalContent.replace(/\[PRODUCT_LINK_PLACEHOLDER\]/g, productLinkHtml);
        } else {
          // Fallback: append to the end if placeholder missing
          finalContent += `\n\n${productLinkHtml}`;
        }
        
        setContent(finalContent);
        
        if (autoPublish) {
          // Immediate publish
          setIsPublishing(true);
          const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              title: result.title, 
              content: finalContent, 
              status: 'publish',
              featured_media: featuredImageId 
            })
          });
          const data = await res.json();
          if (res.ok) {
            setMessage({ type: 'success', text: 'AI 已生成爆款內容並成功發布至 WordPress！' });
            setTitle('');
            setContent('');
            setAmazonUrl('');
            fetchPosts();
            setTimeout(() => setActiveTab('dashboard'), 2000);
          } else {
            throw new Error(data.error || '發布失敗');
          }
        } else {
          setMessage({ type: 'success', text: 'AI 已生成爆款內容與配圖！' });
        }
      } else {
        throw new Error('AI 無法從該網址提取有效資訊');
      }
    } catch (error: any) {
      console.error('Smart Generation failed', error);
      setMessage({ type: 'error', text: `智能操作失敗：${error.message}` });
    } finally {
      setIsGenerating(false);
      setIsGeneratingImages(false);
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
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '文章發布成功！' });
        setTitle('');
        setContent('');
        setSuggestions([]);
        fetchPosts();
        setTimeout(() => setActiveTab('dashboard'), 2000);
      } else {
        const errorCode = data.error ? ` [${data.error}]` : '';
        const errorMsg = (data.details?.message || data.error || '發布失敗') + errorCode;
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `發布失敗：${error.message}` });
    } finally {
      setIsPublishing(false);
    }
  };

  const addAmazonLink = () => {
    if (!amazonUrl) return;
    const linkHtml = `
      <div class="amazon-product-box" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin: 20px 0; background: #f9f9f9;">
        <h4 style="margin-top: 0;">推薦商品</h4>
        <p>在 Amazon 上查看此商品：</p>
        <a href="${amazonUrl}" target="_blank" style="display: inline-block; background: #FF9900; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">前往 Amazon 查看</a>
      </div>
    `;
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
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">控制面板</span>
          </button>
          <button 
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'editor' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-500'}`}
          >
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

      {/* Bottom Navigation - Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 px-6 py-3 z-50 flex justify-around items-center">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-gray-400'}`}
        >
          <LayoutDashboard size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">控制面板</span>
        </button>
        <button 
          onClick={() => setActiveTab('editor')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'editor' ? 'text-emerald-600' : 'text-gray-400'}`}
        >
          <PlusCircle size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">新建文章</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 md:p-10 pb-24 lg:pb-10">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto"
            >
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
                  <p className={`text-lg md:text-xl font-bold ${userInfo?.roles?.includes('administrator') || userInfo?.roles?.includes('editor') || userInfo?.roles?.includes('author') || (!userInfo?.roles?.length && userInfo) ? 'text-emerald-600' : 'text-red-500'}`}>
                    {userInfo ? (userInfo.roles && userInfo.roles.length > 0 ? userInfo.roles.map(r => r === 'administrator' ? '管理者' : r).join(', ') : '管理者') : (userLoading ? '載入中...' : '連線失敗')}
                  </p>
                  {userInfo?.roles?.includes('api_error') && (
                    <p className="text-[10px] text-red-400 mt-1">無法從 WordPress 取得權限資料</p>
                  )}
                  {userInfo?.roles?.includes('認證失敗') && (
                    <p className="text-[10px] text-red-400 mt-1">WordPress 帳號或密碼錯誤</p>
                  )}
                </div>
                <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                  <p className="text-xs md:text-sm text-gray-500 mb-1">AI 狀態</p>
                  <p className="text-lg md:text-xl font-bold text-indigo-600">就緒</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="p-5 md:p-6 border-b border-black/5 flex justify-between items-center">
                  <h3 className="font-bold">近期文章</h3>
                  <button onClick={fetchPosts} className="text-sm text-emerald-600 hover:underline">重新整理</button>
                </div>
                <div className="divide-y divide-black/5">
                  {loading ? (
                    <div className="p-10 flex justify-center">
                      <Loader2 className="animate-spin text-emerald-500" />
                    </div>
                  ) : (posts || []).length === 0 ? (
                    <div className="p-10 text-center text-gray-400">未找到文章。</div>
                  ) : (
                    posts.map(post => (
                      <div key={post.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                          <div className="hidden sm:flex w-10 h-10 bg-gray-100 rounded-lg items-center justify-center text-gray-400 flex-shrink-0">
                            <FileText size={20} />
                          </div>
                          <div className="truncate">
                            <h4 className="font-bold truncate text-sm md:text-base" dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                            <p className="text-xs text-gray-500">{new Date(post.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                          <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider ${post.status === 'publish' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {post.status}
                          </span>
                          <a href={post.link} target="_blank" className="p-1.5 md:p-2 hover:bg-gray-200 rounded-lg transition-colors">
                            <ExternalLink size={16} md:size={18} />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto"
            >
              <header className="mb-6 md:mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">撰寫文章</h2>
                  <p className="text-sm md:text-base text-gray-500">利用 AI 協助撰寫文章並加入 Amazon 連結。</p>
                </div>
                <button 
                  onClick={handlePublish}
                  disabled={isPublishing || !title || !content}
                  className="w-full sm:w-auto bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isPublishing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                  發布至 WordPress
                </button>
              </header>

              {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <p className="font-medium text-sm md:text-base">{message.text}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-2 space-y-4 md:space-y-6">
                  <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">文章標題</label>
                    <input 
                      type="text" 
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="輸入一個吸引人的標題..."
                      className="w-full text-xl md:text-2xl font-bold border-none focus:ring-0 placeholder:text-gray-200"
                    />
                  </div>

                  <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm min-h-[300px] md:min-h-[400px]">
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">內容 (HTML)</label>
                      <button 
                        onClick={handleGenerateAI}
                        disabled={isGenerating || !title}
                        className="text-indigo-600 flex items-center gap-2 text-xs md:text-sm font-bold hover:bg-indigo-50 px-2 md:px-3 py-1 rounded-lg transition-all disabled:opacity-50"
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                        AI 生成
                      </button>
                    </div>
                    <textarea 
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="開始寫作或使用 AI 生成內容..."
                      className="w-full h-[250px] md:h-[350px] border-none focus:ring-0 font-mono text-xs md:text-sm leading-relaxed placeholder:text-gray-200 resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 md:space-y-6">
                  {/* Amazon Integration */}
                  <div className="bg-white p-5 md:p-6 rounded-2xl border border-black/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <ShoppingCart className="text-orange-500" size={20} />
                      <h3 className="font-bold">Amazon 助手</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">商品網址</label>
                        <input 
                          type="text" 
                          value={amazonUrl}
                          onChange={(e) => setAmazonUrl(e.target.value)}
                          placeholder="在此貼上 Amazon 連結..."
                          className="w-full bg-gray-50 border border-black/5 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                        />
                      </div>
                      <button 
                        onClick={() => handleSmartGenerate(false)}
                        disabled={isGenerating || isGeneratingImages || isPublishing || !amazonUrl}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isGenerating || isGeneratingImages ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        {isGeneratingImages ? '正在導入商品原圖...' : '智能分析網址並生成'}
                      </button>
                      <button 
                        onClick={() => handleSmartGenerate(true)}
                        disabled={isGenerating || isGeneratingImages || isPublishing || !amazonUrl}
                        className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isPublishing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                        {isPublishing ? '正在發布中...' : '智能生成並一鍵發布'}
                      </button>
                      <button 
                        onClick={addAmazonLink}
                        className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 transition-all"
                      >
                        僅插入商品卡片
                      </button>
                    </div>

                    {(suggestions || []).length > 0 && (
                      <div className="mt-6 pt-6 border-t border-black/5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">AI 建議</p>
                        <div className="space-y-3">
                          {suggestions.map((s, i) => (
                            <div key={i} className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                              <p className="text-xs font-bold text-indigo-900">{s.name}</p>
                              <p className="text-[10px] text-indigo-700 mt-1">{s.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-600 p-5 md:p-6 rounded-2xl text-white shadow-lg shadow-emerald-200">
                    <h4 className="font-bold mb-2 text-sm md:text-base">專業提示</h4>
                    <p className="text-xs md:text-sm text-emerald-50 opacity-90 leading-relaxed">
                      使用 AI 生成按鈕來建立完整的部落格文章大綱。然後，使用 Amazon 助手在合適的地方插入聯盟行銷連結。
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
