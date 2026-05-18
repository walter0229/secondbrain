import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'SecondBrain_SuperSecretKey_2026';

export const encryptText = (text) => {
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

export const decryptText = (cipherText) => {
  const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};
