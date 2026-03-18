import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";

// 初始化 Google AI SDK
const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GOOGLE_API_KEY,
  "AIzaSyCxluy6t609JE8Oeo13RGFwEiqYPERO0Q4",
  "AIzaSyAzwK299nxY3iW0497qO7v4UzmT_d3KgQM"
].filter(Boolean);

const googleAi = new GoogleGenAI({ 
  apiKey: apiKeys[0] as string
});

// 優先使用 Groq API 進行極速文字生成 (可作為備援)
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "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",
  baseURL: "https://api.groq.com/openai/v1",
  dangerouslyAllowBrowser: true,
});

const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview"; // 用於深度分析的高階模型
const GROQ_MODEL = "llama-3.3-70b-specdec";

console.log("當前使用的核心引擎: Google Gemini 3.1 Pro (官方 SDK)");

export const generatePostContent = async (topic: string) => {
  try {
    const response = await googleAi.models.generateContent({
      model: GEMINI_PRO_MODEL,
      contents: `今日日期：2026年3月14日。請用繁體中文寫一篇關於「${topic}」的專業部落格文章。
      在適當的地方加入 Amazon 商品連結的佔位符。
      請在內容中適當的位置插入 [IMAGE_PLACEHOLDER_0] 佔位符。
      務必生成 1 個極具視覺衝擊力的 AI 繪圖提示詞 (英文)，描述與文章主題相關的商用攝影風格。
      輸出格式必須是 JSON。`,
      config: {
        systemInstruction: "你是一個專業的部落格作家，擅長撰寫 SEO 優化的文章。現在是 2026 年，你必須在文章中明確提到 2026 年（例如：2026 年推薦、2026 年最新）。嚴禁出現 2024 或 2025 等舊年份。你必須返回 JSON 格式，包含 'content' (HTML) 和 'imagePrompts' (英文提示詞陣列) 兩個欄位。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING },
            imagePrompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["content", "imagePrompts"]
        }
      }
    });
    const result = JSON.parse(response.text || "{}");
    if (!result.imagePrompts || result.imagePrompts.length === 0) {
      result.imagePrompts = [`Professional high-quality photography of ${topic}, studio lighting, 8k`];
    }
    return result;
  } catch (error: any) {
    console.error("Gemini 生成文章失敗，嘗試 Groq 備援:", error);
    try {
      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: "你是一個專業部落格作家。請返回 JSON 格式，包含 'content' 和 'imagePrompts'。" },
          { role: "user", content: `請用繁體中文寫一篇關於「${topic}」的專業部落格文章。` }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (fallbackError) {
      console.error("所有引擎均失敗:", fallbackError);
      throw new Error("無法生成內容，請檢查 API Key 狀態。");
    }
  }
};

export const generateSmartPostFromUrl = async (url: string) => {
  try {
    const response = await googleAi.models.generateContent({
      model: GEMINI_PRO_MODEL,
      contents: `今日日期：2026年3月14日。請深入分析並了解這個 Amazon 商品網頁的完整內容：${url}
      
      任務要求：
      1. **精準分析**：獲取商品的真實名稱、核心功能、獨特賣點 (USP)、規格參數。
      2. **爆款標題**：生成一個極具衝擊力的繁體中文標題，必須包含 2026 年。
      3. **內容撰寫**：撰寫專業且富有感染力的繁體中文文章。
         - 在文章中自然地提及該商品，並在適當位置插入 [IMAGE_PLACEHOLDER_0]、[IMAGE_PLACEHOLDER_1] 佔位符。
         - **關鍵**：在文章轉化率最高的地方插入 [PRODUCT_LINK_PLACEHOLDER] 佔位符。
         - 文章內容應圍繞該商品展開，確保讀者能感受到商品的價值。
      4. **提取真實圖片 (嚴禁 AI 生成)**：請從該網頁中提取 2-3 個最主要的商品圖片網址 (Direct Image URLs)。
      
      輸出格式必須是 JSON。`,
      config: {
        systemInstruction: "你是一個頂尖的電商行銷專家。你的任務是分析 Amazon 商品頁面並生成一篇高轉化率的部落格文章。你必須確保文章內容與商品高度相關。在 content 中，你必須巧妙地安排 [IMAGE_PLACEHOLDER_x] 和 [PRODUCT_LINK_PLACEHOLDER] 的位置。你必須從網頁中提取真實的商品圖片網址放入 imageUrls 陣列中，絕對不要生成 AI 繪圖提示詞。現在是 2026 年，請確保年份正確。",
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            imageUrls: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "從網頁中提取的真實商品圖片網址"
            }
          },
          required: ["title", "content", "imageUrls"]
        }
      }
    });
    
    const result = JSON.parse(response.text || "{}");
    console.log("Gemini 生成結果:", result.title, "提取圖片數量:", result.imageUrls?.length);
    
    if (!result.imageUrls || result.imageUrls.length === 0) {
      console.warn("未抓取到真實圖片網址，使用預設邏輯...");
      result.imageUrls = [
        `https://loremflickr.com/1024/1024/product?lock=1`,
        `https://loremflickr.com/1024/1024/product?lock=2`
      ];
    }
    return result;
  } catch (e: any) {
    console.error("Gemini 智能生成失敗，嘗試 Groq 備援:", e);
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個頂尖的電商爆款文案專家。你必須返回 JSON 格式，包含 'title', 'content' (HTML), 和 'imageUrls' (圖片網址陣列) 三個欄位。"
        },
        {
          role: "user",
          content: `分析網頁並生成 JSON: ${url}。請嘗試提供 2 個相關的圖片網址。`
        }
      ],
      response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content || "{}");
  }
};

export const generateImage = async (prompt: string) => {
  try {
    console.log("正在使用 Gemini 3.1 Flash Image 生成圖片:", prompt);
    const response = await googleAi.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [{ text: `${prompt}, professional product photography, studio lighting, high resolution, clean background` }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        },
        tools: [
          {
            googleSearch: {
              searchTypes: {
                webSearch: {},
                imageSearch: {},
              }
            },
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    
    console.warn("Gemini 圖片生成未返回數據，回退到 Pollinations");
    const cleanPrompt = prompt.replace(/[^\w\s,]/g, '').substring(0, 200);
    const encodedPrompt = encodeURIComponent(`${cleanPrompt}, professional product photography`);
    return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
  } catch (error) {
    console.error("Gemini 圖片生成失敗:", error);
    const cleanPrompt = prompt.replace(/[^\w\s,]/g, '').substring(0, 200);
    const encodedPrompt = encodeURIComponent(`${cleanPrompt}, professional product photography`);
    return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
  }
};

export const suggestAmazonProducts = async (topic: string) => {
  try {
    const response = await googleAi.models.generateContent({
      model: GEMINI_PRO_MODEL,
      contents: `根據主題「${topic}」，建議 3 個相關的 Amazon 商品類別或具體物品。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ["name", "reason"]
          }
        }
      }
    });
    
    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    return [];
  }
};
