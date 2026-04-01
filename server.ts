import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/generate', async (req, res) => {
    try {
      const { prompt, systemInstruction, responseMimeType, responseModalities, speechConfig } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.error('GEMINI_API_KEY is missing');
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      console.log('Generating content for prompt:', prompt.substring(0, 50) + '...');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: responseModalities?.includes('AUDIO') ? 'gemini-2.5-flash-preview-tts' : 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: responseMimeType || 'text/plain',
          responseModalities: responseModalities || undefined,
          speechConfig: speechConfig || undefined,
          temperature: 0.8,
          topP: 0.95,
          topK: 40,
        },
      });

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates returned from Gemini API');
      }

      if (responseModalities?.includes('AUDIO')) {
        const base64Audio = response.candidates[0].content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error('No audio data returned');
        return res.json({ audio: base64Audio });
      }

      const text = response.text || '';
      console.log('Generation successful, text length:', text.length);
      res.json({ text });
    } catch (error: any) {
      console.error('Generation error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate content' });
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
      console.log('Vite middleware enabled');
    } catch (e) {
      console.error('Failed to start Vite server:', e);
      // Fallback to static serving if Vite fails
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
