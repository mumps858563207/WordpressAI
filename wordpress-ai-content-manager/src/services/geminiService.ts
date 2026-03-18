import OpenAI from "openai";

let openai: OpenAI;
let MODEL: string;

// 初始化函數 - 從後端獲取配置
async function initializeOpenAI() {
  if (openai) return; 
  
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
      dangerouslyAllowBrowser: true,
    });
    
    MODEL = config.openai.model;
    
    console.log("✓ OpenAI 代理已初始化");
    console.log("✓ 模型:", MODEL);
  } catch (error) {
    console.error("Failed to initialize OpenAI:", error);
    openai = new OpenAI({
      apiKey: "default-key",
      baseURL: "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
    MODEL = "gpt-4";
  }
}

// 基礎文章生成 (基於主題)
export const generatePostContent = async (topic: string) => {
  await initializeOpenAI();
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個專業的部落格作家，擅長撰寫 SEO 優化的文章。現在是 2026 年，你必須在文章中明確提到 2026 年。嚴禁出現 2024 或 2025 等舊年份。你必須返回 JSON 格式，包含 'content' (HTML) 和 'imagePrompts' (英文提示詞陣列)。"
        },
        {
          role: "user",
          content: `今日日期：2026年3月18日。請用繁體中文寫一篇關於「${topic}」的專業部落格文章。請在內容中插入 [IMAGE_PLACEHOLDER_0] 佔位符。輸出格式必須是 JSON。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (error: any) {
    console.error("生成文章失敗:", error.message);
    throw new Error("無法生成內容，請檢查 API Key 狀態。");
  }
};

/**
 * 核心修正：智能分析 Amazon 網址並生成文章
 * 使用 r.jina.ai 預讀取網頁內容，避免 AI 產生幻覺
 */
export const generateSmartPostFromUrl = async (url: string) => {
  await initializeOpenAI();
  
  try {
    console.log("正在分析網址內容...");
    
    // 使用 Jina Reader 獲取網頁 Markdown 內容
    const readerUrl = `https://r.jina.ai/${url}`;
    const fetchResponse = await fetch(readerUrl);
    const webContent = await fetchResponse.text();

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個頂尖的電商行銷專家，專精於推廣高品質
          你將收到一段 Amazon 商品頁面的 Markdown 內容。
          你的任務：
          1. 嚴格基於提供的網頁內容撰寫，嚴禁虛構不相關的商品功能。
          2. 現在是 2026 年，文章語氣要專業且具說服力。
          3. 輸出 JSON 格式，包含 'title' (繁體中文), 'content' (HTML), 'imageUrls' (陣列)。`
        },
        {
          role: "user",
          content: `今日日期：2026年3月18日。
          請根據以下網頁內容分析產品的內容：
          ---
          ${webContent.substring(0, 10000)} 
          ---
          
          任務要求：
          1. **標題**：生成一個吸睛標題，必須包含「2026」與「火爆」、「寵物超愛\耐用」等關鍵字。
          2. **內容**：介紹這款產品的優點
          3. **佔位符**：在文章具備購買衝動的位置插入 [PRODUCT_LINK_PLACEHOLDER]，並在適當位置放上 [IMAGE_PLACEHOLDER_0]。
          4. **圖片提取**：從 Markdown 中提取 2 個最像商品主圖的 URL (通常以 .jpg 或 .png 結尾)。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // 如果 AI 沒抓到圖片，提供備用圖
    if (!result.imageUrls || result.imageUrls.length === 0) {
      result.imageUrls = ["https://loremflickr.com/1024/1024/umbrella?lock=1"];
    }
    
    return result;
  } catch (e: any) {
    console.error("智能生成失敗:", e.message);
    throw new Error("無法分析網址。請確認 API 狀態，或嘗試手動輸入標題。");
  }
};

// 生成 AI 圖片 (作為備用或補充)
export const generateImage = async (prompt: string) => {
  const cleanPrompt = prompt.replace(/[^\w\s,]/g, '').substring(0, 200);
  const encodedPrompt = encodeURIComponent(`${cleanPrompt}, professional product photography`);
  return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
};

// 建議相關商品
export const suggestAmazonProducts = async (topic: string) => {
  await initializeOpenAI();
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `根據主題「${topic}」，建議 3 個相關的 Amazon 商品類別。返回 JSON 格式的陣列，包含 'name' 和 'reason'。`
        }
      ],
      response_format: { type: "json_object" }
    });
    const result = JSON.parse(response.choices[0].message.content || "[]");
    return Array.isArray(result) ? result : result.products || [];
  } catch (e: any) {
    return [];
  }
};
