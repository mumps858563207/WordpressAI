import OpenAI from "openai";

// 從環境變數讀取配置，不再硬編碼 API Key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default-key",
  baseURL: process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
  dangerouslyAllowBrowser: true,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4";

console.log("✓ OpenAI 代理已初始化");
console.log("✓ API 基礎 URL:", process.env.OPENAI_API_BASE ? "已配置" : "使用預設值");
console.log("✓ 模型:", MODEL);

export const generatePostContent = async (topic: string) => {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個專業的部落格作家，擅長撰寫 SEO 優化的文章。現在是 2026 年，你必須在文章中明確提到 2026 年（例如：2026 年推薦、2026 年最新）。嚴禁出現 2024 或 2025 等舊年份。你必須返回 JSON 格式，包含 'content' (HTML) 和 'imagePrompts' (英文提示詞陣列) 兩個欄位。"
        },
        {
          role: "user",
          content: `今日日期：2026年3月14日。請用繁體中文寫一篇關於「${topic}」的專業部落格文章。在適當的地方加入 Amazon 商品連結的佔位符。請在內容中適當的位置插入 [IMAGE_PLACEHOLDER_0] 佔位符。務必生成 1 個極具視覺衝擊力的 AI 繪圖提示詞 (英文)，描述與文章主題相關的商用攝影風格。輸出格式必須是 JSON。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    if (!result.imagePrompts || result.imagePrompts.length === 0) {
      result.imagePrompts = [`Professional high-quality photography of ${topic}, studio lighting, 8k`];
    }
    return result;
  } catch (error: any) {
    console.error("生成文章失敗:", error.message);
    throw new Error("無法生成內容，請檢查 API Key 狀態。");
  }
};

export const generateSmartPostFromUrl = async (url: string) => {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個頂尖的電商行銷專家。你的任務是分析 Amazon 商品頁面並生成一篇高轉化率的部落格文章。你必須確保文章內容與商品高度相關。在 content 中，你必須巧妙地安排 [IMAGE_PLACEHOLDER_x] 和 [PRODUCT_LINK_PLACEHOLDER] 的位置。你必須從網頁中提取真實的商品圖片網址放入 imageUrls 陣列中，絕對不要生成 AI 繪圖提示詞。現在是 2026 年，請確保年份正確。"
        },
        {
          role: "user",
          content: `今日日期：2026年3月14日。請深入分析並了解這個 Amazon 商品網頁的完整內容：${url}
      
任務要求：
1. **精準分析**：獲取商品的真實名稱、核心功能、獨特賣點 (USP)、規格參數。
2. **爆款標題**：生成一個極具衝擊力的繁體中文標題，必須包含 2026 年。
3. **內容撰寫**：撰寫專業且富有感染力的繁體中文文章。
   - 在文章中自然地提及該商品，並在適當位置插入 [IMAGE_PLACEHOLDER_0]、[IMAGE_PLACEHOLDER_1] 佔位符。
   - **關鍵**：在文章轉化率最高的地方插入 [PRODUCT_LINK_PLACEHOLDER] 佔位符。
   - 文章內容應圍繞該商品展開，確保讀者能感受到商品的價值。
4. **提取真實圖片 (嚴禁 AI 生成)**：請從該網頁中提取 2-3 個最主要的商品圖片網址 (Direct Image URLs)。

輸出格式必須是 JSON。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    if (!result.imageUrls || result.imageUrls.length === 0) {
      result.imageUrls = [
        `https://loremflickr.com/1024/1024/product?lock=1`,
        `https://loremflickr.com/1024/1024/product?lock=2`
      ];
    }
    return result;
  } catch (e: any) {
    console.error("智能生成失敗:", e.message);
    throw new Error("無法分析網址，請檢查 API 狀態。");
  }
};

export const generateImage = async (prompt: string) => {
  try {
    console.log("正在使用 OpenAI 代理生成圖片:", prompt.substring(0, 50) + "...");
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `${prompt}, professional product photography, studio lighting, high resolution, clean background`
        }
      ]
    });

    const cleanPrompt = prompt.replace(/[^\w\s,]/g, '').substring(0, 200);
    const encodedPrompt = encodeURIComponent(`${cleanPrompt}, professional product photography`);
    return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
  } catch (error) {
    console.error("圖片生成失敗:", error);
    const cleanPrompt = prompt.replace(/[^\w\s,]/g, '').substring(0, 200);
    const encodedPrompt = encodeURIComponent(`${cleanPrompt}, professional product photography`);
    return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
  }
};

export const suggestAmazonProducts = async (topic: string) => {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `根據主題「${topic}」，建議 3 個相關的 Amazon 商品類別或具體物品。請返回 JSON 格式的陣列，每個項目包含 'name' 和 'reason' 欄位。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "[]");
    return Array.isArray(result) ? result : result.products || [];
  } catch (e: any) {
    console.error("建議生成失敗:", e.message);
    return [];
  }
};
