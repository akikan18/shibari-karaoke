// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// ↓↓↓↓ ここをご自身のコピーした内容に書き換えてください ↓↓↓↓
const firebaseConfig = {
  apiKey: "AIzaSyACIgVdoWChR-f4F73UZiCfinDpnzvtbEk",
  authDomain: "shibari-karaoke.firebaseapp.com",
  projectId: "shibari-karaoke",
  storageBucket: "shibari-karaoke.firebasestorage.app",
  messagingSenderId: "148570584650",
  appId: "1:148570584650:web:02ce43279a6d01331058b3"
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

// Firebaseアプリの初期化
const app = initializeApp(firebaseConfig);

// データベースと認証機能のエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);