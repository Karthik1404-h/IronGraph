import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// AsyncStorage uses `window` internally, which doesn't exist in Expo's Node.js
// SSR context during `eas update` static rendering. Only load it on native.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const storage = Platform.OS !== 'web'
  ? require('@react-native-async-storage/async-storage').default
  : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

