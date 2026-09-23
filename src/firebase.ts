// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDduuV3-Z257xDEWv4W6Ya6UmbhPLZ7etk",
  authDomain: "attendance-web-app01.firebaseapp.com",
  projectId: "attendance-web-app01",
  storageBucket: "attendance-web-app01.firebasestorage.app",
  messagingSenderId: "63994119771",
  appId: "1:63994119771:web:c2e7776a62e5b00d19a17e",
  measurementId: "G-DJ3E49BBM1"
};

// Initialize Firebase
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics conditionally to support SSR and environments without indexedDB
let analyticsInstance: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics not supported in this environment
    });
}

export const analytics = analyticsInstance;
export default app;
