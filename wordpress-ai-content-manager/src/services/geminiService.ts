import OpenAI from "openai";

/**
 * 定義回傳資料格式
 */
export interface AmazonAnalysisResult {
  title: string;        // 火爆的主題名稱
  content: string;      // 頂級銷售員撰寫的成交文案 (HTML)
  imageUrls: string[];  // 抓取到的 2-3 個產品圖片網址
  productFeatures: string[]; // 產品核心優點
}

let openai: OpenAI;
let MODEL: string;

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
    MODEL = config.openai.model || "gpt-4o";
  } catch (error) {
    console.error("初始化失敗:", error);
    // 預設備用方案
    openai = new OpenAI({
      apiKey: "YOUR_API_KEY", 
      dangerouslyAllowBrowser: true,
    });
    MODEL = "gpt-4o";
  }
}

/**
 * 核心功能：Amazon 網址深度分析與頂級銷售成交文案生成
 */
export const analyzeAmazonProduct = async (url: string): Promise<AmazonAnalysisResult> => {
  await initializeOpenAI();
  
  try {
    console.log(`正在分析產品網址: ${url}`);
    
    // 1. 使用 Jina Reader 獲取網頁資訊
    const readerUrl = `https://r.jina.ai/${url}`;
    const fetchResponse = await fetch(readerUrl);
    if (!fetchResponse.ok) throw new Error("無法讀取 Amazon 網頁內容");
    const webContent = await fetchResponse.text();

    // 2. 呼叫 AI 進行「頂級銷售員」模式分析
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `你現在是全球頂尖的「成交之神」銷售員。你的字典裡沒有「賣不出去」這四個字。
          任務要求：
          1. 找出網頁內容中 2-3 個最像商品主圖的 URL (通常以 .jpg 或 .png 結尾)。
          2. 根據產品特性，生成一個 2026 年最火爆、讓人一看就想點進去的標題。
          3. 條列式整理產品的致命吸引力 (優點)。
          4. 以頂級銷售員的口吻撰寫成交文案：包含痛點擊碎、心理暗示、急迫感營造，讓客戶現在就想下單。
          5. 語系：繁體中文 (台灣習慣用語)。
          6. 格式：純 JSON。`
        },
        {
          role: "user",
          content: `今日日期：2026年3月18日。
          請分析以下產品內容並啟動成交模式：
          ---
          ${webContent.substring(0, 8000)} 
          ---
          
          輸出 JSON 格式必須如下：
          {
            "title": "火爆標題 (含2026關鍵字)",
            "productFeatures": ["優點1", "優點2", "優點3"],
            "content": "<h1>成交文案...</h1><p>運用心理學與急迫感...</p>",
            "imageUrls": ["圖片網址1", "圖片網址2"]
          }`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 銷售員沒說話，請重試。");

    const result = JSON.parse(resultText);
    
    // 確保 imageUrls 只有 2-3 個
    const images = (result.imageUrls || []).slice(0, 3);

    return {
      title: result.title,
      content: result.content,
      imageUrls: images,
      productFeatures: result.productFeatures
    };
    
  } catch (error: any) {
    console.error("分析失敗:", error.message);
    throw new Error(`分析失敗: ${error.message}`);
  }
};
