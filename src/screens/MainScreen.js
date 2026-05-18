import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { processAudioWithGemini, processTextWithGemini } from '../utils/gemini';
import { encryptText, decryptText } from '../utils/crypto';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { db, storage } from '../config/firebase';


export default function MainScreen() {
  const [mode, setMode] = useState('IDLE');
  const [recording, setRecording] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('가운데 버튼을 눌러 시작하세요.');

  useEffect(() => {
    (async () => {
      await Audio.requestPermissionsAsync();
      await Notifications.requestPermissionsAsync();
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
      
      const now = new Date().toISOString();
      const prompt = `이 음성을 정확하게 한국어 텍스트로 변환해줘. 
단, 만약 사용자가 미래의 특정 시점에 알림을 요청하는 내용이라면 분석해서 다음 규칙에 따라 응답의 제일 마지막 줄에 덧붙여줘. 현재 시간은 ${now} 기준이야.
1. "N분 뒤", "N시간 뒤" 처럼 상대적인 시간인 경우 (타이머): 'TIMER: 초단위길이|알람내용' (예: 10분 뒤 약 먹어 -> TIMER: 600|약 먹을 시간)
2. "내일 아침 7시", "목요일 3시" 처럼 절대적인 시간인 경우 (알람): 'ALARM: YYYY-MM-DDTHH:mm:00|알람내용'
알람이나 타이머 요청이 아니라면 그냥 변환된 텍스트만 반환해.`;
      
      const transcript = await processAudioWithGemini(uri, prompt);
      
      if (transcript && !transcript.includes('오류')) {
        try {
          let finalText = transcript;
          let timerSeconds = null;
          let alarmTime = null;
          let alarmBody = null;

          if (transcript.includes('TIMER:')) {
            const lines = transcript.split('\n');
            const timerLine = lines.find(line => line.startsWith('TIMER:'));
            if (timerLine) {
              const parts = timerLine.replace('TIMER:', '').trim().split('|');
              if (parts.length >= 2) {
                timerSeconds = parseInt(parts[0], 10);
                alarmBody = parts[1];
              }
              finalText = lines.filter(line => !line.startsWith('TIMER:')).join('\n').trim();
            }
          } else if (transcript.includes('ALARM:')) {
            const lines = transcript.split('\n');
            const alarmLine = lines.find(line => line.startsWith('ALARM:'));
            if (alarmLine) {
              const parts = alarmLine.replace('ALARM:', '').trim().split('|');
              if (parts.length >= 2) {
                alarmTime = new Date(parts[0]);
                alarmBody = parts[1];
              }
              finalText = lines.filter(line => !line.startsWith('ALARM:')).join('\n').trim();
            }
          }

          const encrypted = encryptText(finalText);
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
                timestamp: { stringValue: new Date().toISOString() },
                hasAlarm: { booleanValue: !!alarmTime || !!timerSeconds }
              }
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`저장 실패 (${response.status})`);
          }

          if (Platform.OS === 'android') {
            try {
              if (timerSeconds && timerSeconds > 0) {
                await IntentLauncher.startActivityAsync('android.intent.action.SET_TIMER', {
                  extra: {
                    'android.intent.extra.alarm.LENGTH': timerSeconds,
                    'android.intent.extra.alarm.MESSAGE': alarmBody,
                    'android.intent.extra.alarm.SKIP_UI': true,
                  },
                });
                speak('기억을 저장하고 타이머를 설정했습니다.');
              } else if (alarmTime && alarmTime > new Date()) {
                const hours = alarmTime.getHours();
                const minutes = alarmTime.getMinutes();
                await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
                  extra: {
                    'android.intent.extra.alarm.HOUR': hours,
                    'android.intent.extra.alarm.MINUTES': minutes,
                    'android.intent.extra.alarm.MESSAGE': alarmBody,
                    'android.intent.extra.alarm.SKIP_UI': true,
                  },
                });
                speak('기억을 저장하고 시계 알람을 설정했습니다.');
              } else {
                speak('안전하게 암호화되어 저장되었습니다.');
              }
            } catch (intentError) {
              console.log("Intent Error (Expo Go restriction):", intentError);
              if (timerSeconds && timerSeconds > 0) {
                await Notifications.scheduleNotificationAsync({
                  content: { title: "제 2의 뇌 🧠", body: alarmBody, sound: true },
                  trigger: { seconds: timerSeconds },
                });
                speak('앱 테스트 환경 제한으로 푸시 타이머로 대체되었습니다.');
              } else if (alarmTime && alarmTime > new Date()) {
                await Notifications.scheduleNotificationAsync({
                  content: { title: "제 2의 뇌 🧠", body: alarmBody, sound: true },
                  trigger: alarmTime,
                });
                speak('앱 테스트 환경 제한으로 푸시 알람으로 대체되었습니다.');
              } else {
                speak('안전하게 암호화되어 저장되었습니다.');
              }
            }
          } else {
            // iOS Fallback (Push notification)
            if (alarmTime && alarmTime > new Date()) {
              await Notifications.scheduleNotificationAsync({
                content: { title: "제 2의 뇌 🧠", body: alarmBody, sound: true },
                trigger: alarmTime,
              });
              speak('기억을 저장하고 알람을 설정했습니다.');
            } else {
              speak('안전하게 암호화되어 저장되었습니다.');
            }
          }
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
