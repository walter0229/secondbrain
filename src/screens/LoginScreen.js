import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';

export default function LoginScreen({ navigation }) {
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    if (password === 'msjhjy1162') {
      navigation.replace('MainScreen');
    } else {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('비밀번호가 틀렸습니다. 다시 시도해주세요.');
      } else {
        Alert.alert('인증 실패', '비밀번호가 틀렸습니다. 다시 시도해주세요.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>제 2의 뇌 🧠</Text>
      <Text style={styles.subtitle}>나만의 완벽한 기억 보조 장치</Text>
      
      <TextInput
        style={styles.input}
        placeholder="비밀번호를 입력하세요"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>인증하고 시작하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  input: {
    width: '80%',
    maxWidth: 300,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
