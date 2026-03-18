/**
 * 生成文章內容
 */
export const generatePostContent = async (topic: string): Promise<GeneratedPost> => {
  await initializeOpenAI();
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個專業的內容創作者。根據主題生成高質量的文章。"
        },
        {
          role: "user",
          content: `請根據以下主題生成一篇文章：${topic}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 回傳內容為空");
    
    return JSON.parse(resultText) as GeneratedPost;
  } catch (error: any) {
    console.error("生成文章失敗:", error.message);
    throw new Error(`生成文章中斷: ${error.message}`);
  }
};

/**
 * 建議 Amazon 產品
 */
export const suggestAmazonProducts = async (keyword: string): Promise<string[]> => {
  await initializeOpenAI();
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "你是一個 Amazon 產品專家。根據關鍵字建議相關的 Amazon 產品 URL。"
        },
        {
          role: "user",
          content: `請根據關鍵字 "${keyword}" 建議 3 個 Amazon 產品 URL。返回 JSON 格式的 URL 陣列。`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const resultText = response.choices[0].message.content;
    if (!resultText) throw new Error("AI 回傳內容為空");
    
    const result = JSON.parse(resultText);
    return result.urls || [];
  } catch (error: any) {
    console.error("建議產品失敗:", error.message);
    throw new Error(`建議產品中斷: ${error.message}`);
  }
};

/**
 * 生成圖片
 */
export const generateImage = async (prompt: string): Promise<string> => {
  await initializeOpenAI();
  
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024"
    });
    
    return response.data[0].url || "";
  } catch (error: any) {
    console.error("生成圖片失敗:", error.message);
    throw new Error(`生成圖片中斷: ${error.message}`);
  }
};
