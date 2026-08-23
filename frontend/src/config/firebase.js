/**
 * Firebase client SDK singleton.
 *
 * Validates all required environment variables at module load time and logs
 * a descriptive console error for any that are missing before any sign-in
 * attempt is made.
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = required.filter((k) => !import.meta.env[k]);
if (missing.length > 0) {
  console.error(
    '[VaultKey] Firebase configuration incomplete. Missing environment variables:',
    missing,
    '\nCreate a frontend/.env file from frontend/.env.example and fill in your Firebase project values.'
  );
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
let auth;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (err) {
  console.error('[VaultKey] Firebase initialization failed:', err.message);
  console.error('Ensure all VITE_FIREBASE_* environment variables are set correctly in frontend/.env');
  // Export stub auth so the app doesn't crash on import — sign-in will fail gracefully
  app = null;
  auth = { currentUser: null };
}

export { auth };
export default app;
