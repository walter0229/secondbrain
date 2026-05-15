import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system';

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export const processAudioWithGemini = async (audioUri, prompt) => {
  try {
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'audio/mp4',
          data: base64Audio
        }
      }
    ]);
    
    return result.response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    return '오류가 발생했습니다.';
  }
};

export const processTextWithGemini = async (prompt) => {
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error('Gemini API Error:', error);
        return '오류가 발생했습니다.';
    }
};
