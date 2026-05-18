import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { processAudioWithGemini, processTextWithGemini } from '../utils/gemini';
import { encryptText, decryptText } from '../utils/crypto';
import { db, storage } from '../config/firebase';


export default function MainScreen() {
  const [mode, setMode] = useState('IDLE');
  const [recording, setRecording] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('가운데 버튼을 눌러 시작하세요.');

  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
    })();
  }, []);

  const speak = (text, onDone = () => {}) => {
    Speech.speak(text, {
      language: 'ko-KR',
      onDone: onDone,
    });
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return null;
    setRecording(null);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    return recording.getURI();
  };

  const handleMainButtonPress = async () => {
    if (isProcessing) return;

    if (mode === 'IDLE') {
      setMode('SELECTING_MODE');
      setStatusText('듣고 있습니다... 정지하려면 다시 누르세요.');
      speak('1번 저장, 2번 질문, 3번 번외질문 선택해주세요.', () => {
        startRecording();
      });
    } else if (mode === 'SELECTING_MODE' && recording) {
      setIsProcessing(true);
      const uri = await stopRecording();
      setStatusText('분석 중입니다...');
      const text = await processAudioWithGemini(uri, "이 음성에서 '1번', '저장', '2번', '질문', '3번', '번외' 중 어떤 의미가 담겨있는지 파악해줘. '1번'이나 '저장'의 의미면 딱 '저장'이라고만 답하고, '2번'이나 '질문'의 의미면 딱 '질문'이라고만, '3번'이나 '번외'면 딱 '번외'라고 단 하나만 답변해줘. 도저히 모르겠으면 '모름'이라고 답변해줘.");
      
      console.log('Gemini text:', text); // For PC terminal
      
      if (text.includes('오류')) {
        Alert.alert('Gemini 에러', text);
        setMode('IDLE');
        setStatusText('에러 발생: ' + text);
      } else if (text.includes('저장')) {
        setMode('RECORDING_SAVE');
        setStatusText('저장할 내용을 말씀하시고 다시 누르세요.');
        speak('저장할 내용을 말씀해주세요.', () => startRecording());
      } else if (text.includes('질문')) {
        setMode('RECORDING_QUESTION');
        setStatusText('질문할 내용을 말씀하시고 다시 누르세요.');
        speak('질문할 내용을 말씀해주세요.', () => startRecording());
      } else if (text.includes('번외')) {
        setMode('RECORDING_OFFTOPIC');
        setStatusText('번외질문을 말씀하시고 다시 누르세요.');
        speak('번외 질문을 말씀해주세요.', () => startRecording());
      } else {
        setMode('IDLE');
        setStatusText('인식된 단어: ' + text);
        speak('잘 알아듣지 못했습니다. 다시 시도해주세요.');
      }
      setIsProcessing(false);
    } else if (mode === 'RECORDING_SAVE' && recording) {
      setIsProcessing(true);
      const uri = await stopRecording();
      setStatusText('저장 중입니다...');
      const transcript = await processAudioWithGemini(uri, "이 음성을 정확하게 한국어 텍스트로 변환해줘.");
      
      if (transcript && !transcript.includes('오류')) {
        try {
          const encrypted = encryptText(transcript);
          const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
          const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
          const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/memories?key=${apiKey}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                text: { stringValue: encrypted },
                timestamp: { stringValue: new Date().toISOString() }
              }
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`저장 실패 (${response.status})`);
          }
          speak('안전하게 암호화되어 저장되었습니다.');
        } catch (error) {
          Alert.alert('DB/암호화 에러', error.message);
          speak('저장 중 심각한 오류가 발생했습니다.');
        }
      } else {
        speak('변환에 실패했습니다.');
      }
      setMode('IDLE');
      setStatusText('가운데 버튼을 눌러 시작하세요.');
      setIsProcessing(false);
    } else if (mode === 'RECORDING_QUESTION' && recording) {
      setIsProcessing(true);
      const uri = await stopRecording();
      setStatusText('기억을 검색 중입니다...');
      
      let allMemories = '저장된 메모가 없습니다.';
      try {
        const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
        const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/memories?key=${apiKey}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.documents && data.documents.length > 0) {
            allMemories = '';
            data.documents.forEach((doc) => {
              if (doc.fields && doc.fields.text) {
                allMemories += decryptText(doc.fields.text.stringValue) + '\n';
              }
            });
          }
        }
      } catch (error) {
        console.error('Fetch memories error:', error);
      }

      const prompt = `나의 과거 메모 내용들입니다:\n${allMemories}\n\n위 메모를 바탕으로, 지금 들려주는 음성 질문에 대해 한국어로 짧고 명확하게 대답해줘.`;
      const answer = await processAudioWithGemini(uri, prompt);
      
      speak(answer);
      setMode('IDLE');
      setStatusText('가운데 버튼을 눌러 시작하세요.');
      setIsProcessing(false);
    } else if (mode === 'RECORDING_OFFTOPIC' && recording) {
      setIsProcessing(true);
      const uri = await stopRecording();
      setStatusText('답변을 생성 중입니다...');
      
      const answer = await processAudioWithGemini(uri, "이 음성의 질문에 대해 한국어로 짧고 친절하게 답변해줘.");
      
      speak(answer);
      setMode('IDLE');
      setStatusText('가운데 버튼을 눌러 시작하세요.');
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>제 2의 뇌 🧠</Text>
      <Text style={styles.status}>{statusText}</Text>
      
      <TouchableOpacity 
        style={[styles.button, recording ? styles.recordingButton : null]} 
        onPress={handleMainButtonPress}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Text style={styles.buttonText}>
            {recording ? '녹음 정지' : '호출 버튼'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  status: {
    fontSize: 16,
    color: '#666',
    marginBottom: 50,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    width: 150,
    height: 150,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  recordingButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
