import { createClient } from '@supabase/supabase-js';

// Validate environment variables are present
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Custom storage wrapper to handle edge cases (private browsing, quota exceeded)
const customStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors (e.g., quota exceeded, private browsing)
      console.warn('Unable to save session to localStorage');
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
};

// Create Supabase client with secure defaults
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: customStorage,
    storageKey: 'admintracker-auth',
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': 'adminTracker-web',
    },
  },
});

/**
 * Helper to check if session is valid and not about to expire
 * Returns true if session exists and has more than 60 seconds until expiry
 */
export const isSessionValid = (session) => {
  if (!session?.access_token || !session?.expires_at) {
    return false;
  }
  // Check if token expires in more than 60 seconds
  const expiresAt = session.expires_at * 1000; // Convert to milliseconds
  const now = Date.now();
  const bufferMs = 60 * 1000; // 60 second buffer
  return expiresAt > (now + bufferMs);
};

/**
 * Force refresh the session token
 * Useful before making critical API calls
 */
export const refreshSessionIfNeeded = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { session: null, error: new Error('No session') };
    }
    
    // If session is about to expire (within 5 minutes), refresh it
    if (!isSessionValid(session) || (session.expires_at * 1000) - Date.now() < 5 * 60 * 1000) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        return { session: null, error };
      }
      return { session: data.session, error: null };
    }
    
    return { session, error: null };
  } catch (error) {
    return { session: null, error };
  }
};