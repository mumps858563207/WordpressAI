import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  try {
    const app = express();
    const PORT = parseInt(process.env.PORT || '3000', 10);

    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // WordPress API Proxy
    let wpUrl = process.env.WP_URL || 'https://mumpsaiweb.zeabur.app';
    wpUrl = wpUrl.replace(/\/$/, '');
    
    if (!wpUrl.startsWith('http')) {
      wpUrl = `https://${wpUrl}`;
    }
    
    const wpUsername = process.env.WP_USERNAME;
    const wpPassword = process.env.WP_APP_PASSWORD;

    if (!wpUsername || !wpPassword) {
      console.warn('WARNING: WP_USERNAME or WP_APP_PASSWORD is not set in environment variables.');
    }

    console.log('Connecting to WordPress at:', wpUrl, 'as user:', wpUsername);

    const wpAuth = Buffer.from(`${wpUsername}:${wpPassword}`).toString('base64');

    const wpClient = axios.create({
      baseURL: `${wpUrl}/wp-json/wp/v2`,
      headers: {
        'Authorization': `Basic ${wpAuth}`,
        'Content-Type': 'application/json'
      }
    });

    // Get Current User Info
    app.get('/api/me', async (req, res) => {
      try {
        console.log('Fetching user info from WP...');
        const response = await wpClient.get('/users/me');
        console.log('User info fetched successfully:', response.data.name, response.data.roles);
        res.json(response.data);
      } catch (error: any) {
        const errorData = error.response?.data;
        const errorMessage = error.message;
        console.error('WP User Info Error:', JSON.stringify(errorData, null, 2) || errorMessage);
        res.status(error.response?.status || 500).json({ 
          error: 'Failed to fetch user info',
          message: errorMessage,
          status: error.response?.status,
          details: errorData 
        });
      }
    });

    // Get Posts
    app.get('/api/posts', async (req, res) => {
      try {
        const response = await wpClient.get('/posts');
        res.json(response.data);
      } catch (error: any) {
        const errorData = error.response?.data;
        console.error('WP Fetch Error:', errorData || error.message);
        res.status(error.response?.status || 500).json({ 
          error: 'Failed to fetch posts',
          details: errorData 
        });
      }
    });

    // Create Post
    app.post('/api/posts', async (req, res) => {
      try {
        const { title, content, status = 'publish', featured_media } = req.body;
        
        const postData: any = {
          title,
          content,
          status
        };

        if (featured_media) {
          postData.featured_media = featured_media;
        }
        
        try {
          const response = await wpClient.post('/posts', postData);
          return res.json(response.data);
        } catch (innerError: any) {
          if (status === 'publish' && innerError.response?.data?.code === 'rest_cannot_publish') {
            console.log('Publish failed, trying to save as draft instead...');
            const draftResponse = await wpClient.post('/posts', {
              ...postData,
              status: 'draft'
            });
            return res.json({
              ...draftResponse.data,
              _warning: '由於權限限制，文章已儲存為草稿而非直接發布。'
            });
          }
          throw innerError;
        }
      } catch (error: any) {
        const errorData = error.response?.data;
        const errorCode = errorData?.code || 'unknown_error';
        console.error('WP Create Error:', errorData || error.message);
        
        let friendlyError = `WordPress 錯誤 (${errorCode})`;
        if (errorCode === 'rest_cannot_create') {
          friendlyError = '您的帳號權限不足，無法建立文章。請聯繫管理員將您的角色提升為「作者」或「編輯」。';
        } else if (errorCode === 'rest_cannot_publish') {
          friendlyError = '您的帳號權限不足，無法直接發布文章（已嘗試轉為草稿但失敗）。';
        }

        res.status(error.response?.status || 500).json({ 
          error: friendlyError,
          details: errorData
        });
      }
    });

    // Upload Media
    app.post('/api/media', async (req, res) => {
      try {
        const { image, filename } = req.body;
        if (!image) return res.status(400).json({ error: 'No image provided' });

        let buffer: Buffer;

        if (image.startsWith('http')) {
          console.log('Fetching image from URL:', image);
          try {
            const imageRes = await axios.get(image, { 
              responseType: 'arraybuffer',
              timeout: 15000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
              }
            });
            buffer = Buffer.from(imageRes.data);
            console.log('Successfully fetched image from URL, size:', buffer.length);
          } catch (fetchError: any) {
            console.error('Failed to fetch image from URL:', fetchError.message);
            return res.status(500).json({ 
              error: 'Failed to fetch image from source', 
              details: fetchError.message 
            });
          }
        } else {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
        }

        console.log('Uploading to WordPress media library...', filename);
        const response = await axios.post(`${wpUrl}/wp-json/wp/v2/media`, buffer, {
          headers: {
            'Authorization': `Basic ${wpAuth}`,
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="${filename || 'ai-image.png'}"`
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });

        console.log('WordPress media upload success, ID:', response.data.id);
        res.json(response.data);
      } catch (error: any) {
        const errorData = error.response?.data;
        console.error('WP Media Upload Error:', JSON.stringify(errorData, null, 2) || error.message);
        res.status(error.response?.status || 500).json({ 
          error: 'Failed to upload media to WordPress',
          details: errorData || error.message
        });
      }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
      try {
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (viteError) {
        console.error('Failed to initialize Vite:', viteError);
        // Continue without Vite in case of error
      }
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();
