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
