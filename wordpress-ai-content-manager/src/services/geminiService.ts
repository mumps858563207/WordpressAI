import OpenAI from "openai";

/**
 * 定義回傳資料格式，讓 TypeScript 提供更好的提示
 */
export interface GeneratedPost {
  title?: string;
  content: string;
  imageUrls?: string[];
  imagePrompts?: string[];
}

let openai: OpenAI;
let MODEL: string;

/**
 * 初始化函數 - 從後端獲取配置
 * 建議：在 2026 年，建議將此邏輯放在 Server Side (如 Next.js API Routes)
 */
async function initializeOpenAI() {
  if (openai) return; 
  
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error("無法獲取後端配置");
    
    const config = await response.json();
    
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
      dangerouslyAllowBrowser: true, // 注意：正式環境建議移至後端以隱藏 Key
    });
    
    MODEL = config.openai.model || "gpt-4o"; // 預設使用 2026 年主流模型
    
    console.log("✓ OpenAI 代理已初始化");
  } catch (error) {
    console.error("初始化失敗，切換至預設配置:", error);
    openai = new OpenAI({
      apiKey: "your-fallback-key",
      baseURL: "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
    MODEL = "gpt-4-turbo";
  }
}

/**
 * 核心功能：智能分析 Amazon 網址並生成文章
 * 使用 r.jina.ai 預讀取網頁內容，有效過濾廣告並精準抓取商品資訊
 */
export const generateSmartPostFromUrl = async (url: string): Promise<GeneratedPost> => {
  await initializeOpenAI();
  
  try {
    console.log(`正在透過 Jina Reader 分析網址: ${url}`);
    
    // 1. 使用 Jina Reader 獲取網頁 Markdown 內容
    const readerUrl = `https://r.jina.ai/${url}`;
    const fetchResponse = await fetch(readerUrl);
    if (!fetchResponse.ok) throw new Error("Jina Reader 抓取網頁失敗");
    
    const webContent = await fetchResponse.text();

    // 2. 呼叫 OpenAI 進行分析與撰寫
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個頂尖的電商行銷專家。
          任務：根據提供的 Amazon 商品 Markdown 內容撰寫推廣文章。
          要求：
          1. 現在是 2026 年，內容必須包含「2026」年份關鍵字。
          2. 文章語氣要專業、具說服力，並針對台灣市場使用繁體中文。
          3. 嚴禁虛構功能，只撰寫內容中提到的優點。
          4. 輸出必須是純 JSON 格式，包含 'title', 'content' (HTML格式), 'imageUrls' (從內容中提取的圖片網址)。`
        },
        {
          role: "user",
          content: `今日日期：2026年3月18日。
          商品網頁內容分析：
          ---
          ${webContent.substring(0, 8000)} 
          ---
          
          具體任務：
          1. 標題：需包含「2026」與「火爆」、「推薦」等誘人字眼。
          2. 內容：介紹產品優點，並在適當位置插入 [PRODUCT_LINK_PLACEHOLDER] 與 [IMAGE_PLACEHOLDER_0]。
          3. 圖片：從 Markdown 中提取 2 個最像商品主圖的 URL (通常是 .jpg 或 .png)。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 回傳內容為空");

    return JSON.parse(resultText) as GeneratedPost;
    
  } catch (error: any) {
    console.error("生成文章失敗:", error.message);
    throw new Error(`自動化生成中斷: ${error.message}`);
  }
};

/**
 * 生成文章內容
 * 根據標題或主題生成高質量的文章內容
 */
export const generatePostContent = async (topic: string): Promise<GeneratedPost> => {
  await initializeOpenAI();
  
  try {
    console.log(`正在為主題生成文章內容: ${topic}`);
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個專業的內容創作者和行銷文案專家。
          任務：根據給定的主題或標題生成高質量、吸引人的文章內容。
          要求：
          1. 現在是 2026 年，內容應該包含現代化的觀點和 2026 年的趨勢。
          2. 使用繁體中文，針對台灣市場。
          3. 內容應該是 HTML 格式，包含適當的段落標籤和格式。
          4. 輸出必須是純 JSON 格式，包含 'title' 和 'content' 欄位。`
        },
        {
          role: "user",
          content: `請根據以下主題生成一篇高質量的文章：
          主題：${topic}
          
          請生成一篇 800-1200 字的文章，包含引人入勝的開場、詳細的內容段落和有力的結論。
          返回 JSON 格式：{ "title": "文章標題", "content": "<p>HTML 格式的內容</p>" }`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 回傳內容為空");
    
    const result = JSON.parse(resultText);
    return {
      title: result.title || topic,
      content: result.content || ""
    } as GeneratedPost;
    
  } catch (error: any) {
    console.error("生成文章失敗:", error.message);
    throw new Error(`生成文章中斷: ${error.message}`);
  }
};

/**
 * 建議 Amazon 產品
 * 根據關鍵字或主題建議相關的 Amazon 產品
 */
export const suggestAmazonProducts = async (keyword: string): Promise<any[]> => {
  await initializeOpenAI();
  
  try {
    console.log(`正在為關鍵字建議 Amazon 產品: ${keyword}`);
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個 Amazon 產品專家和電商顧問。
          任務：根據給定的關鍵字或主題建議相關的 Amazon 產品。
          要求：
          1. 建議應該是實用的、高評分的產品。
          2. 返回 JSON 格式的產品陣列，每個產品包含 'name' 和 'reason' 欄位。
          3. 建議 3-5 個產品。
          4. 使用繁體中文。`
        },
        {
          role: "user",
          content: `請根據關鍵字 "${keyword}" 建議 3-5 個 Amazon 上的相關產品。
          
          返回 JSON 格式：
          {
            "suggestions": [
              { "name": "產品名稱", "reason": "為什麼推薦這個產品" },
              ...
            ]
          }`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 回傳內容為空");
    
    const result = JSON.parse(resultText);
    return result.suggestions || [];
    
  } catch (error: any) {
    console.error("建議產品失敗:", error.message);
    throw new Error(`建議產品中斷: ${error.message}`);
  }
};

/**
 * 生成圖片
 * 使用 DALL-E 3 根據提示詞生成圖片
 */
export const generateImage = async (prompt: string): Promise<string> => {
  await initializeOpenAI();
  
  try {
    console.log(`正在生成圖片，提示詞: ${prompt}`);
    
    // 檢查是否支持圖片生成
    // 如果使用的是兼容 OpenAI 的 API（如 Gemini），可能不支持圖片生成
    // 在這種情況下，返回一個佔位符或空字符串
    
    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024"
      });
      
      return response.data[0].url || "";
    } catch (imageError: any) {
      // 如果圖片生成不支持，記錄錯誤並返回空字符串
      console.warn("圖片生成不支持或失敗，返回空字符串:", imageError.message);
      return "";
    }
    
  } catch (error: any) {
    console.error("生成圖片失敗:", error.message);
    // 不拋出錯誤，因為圖片生成是可選的
    return "";
  }
};
