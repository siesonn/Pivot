/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, Component } from 'react';
import { 
  MessageSquare, 
  Zap, 
  Heart, 
  ShieldAlert, 
  Wind, 
  Globe, 
  ArrowRight, 
  RefreshCw,
  Loader2,
  Volume2,
  Mic,
  MicOff,
  Star,
  LogOut,
  LogIn,
  Send,
  Copy,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  doc,
  getDocFromServer,
  getDoc,
  setDoc
} from 'firebase/firestore';

// Error Handling Types
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;
  props: ErrorBoundaryProps;
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) errorMessage = `Database Error: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9F5] dark:bg-[#1A1F1A] p-6 transition-colors duration-300">
          <div className="max-w-md w-full bg-white dark:bg-[#242B24] p-8 rounded-[32px] border border-[#DDE2D9] dark:border-[#2D342D] shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-serif italic text-[#3A4439] dark:text-[#EDF1EB]">Oops, something happened</h2>
            <p className="text-[#7A857C] dark:text-[#A0A9A2] text-sm leading-relaxed">
              {errorMessage}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#5A6B5D] text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:scale-[1.02] transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Types
type Mode = 'Coach' | 'Friend' | 'Tough Love' | 'Calm' | 'Big Picture';
type Need = 'A next step' | 'Reassurance' | 'A pep talk' | 'A clearer way to think about this' | 'Help making a decision';

interface AdviceResponse {
  insight: string;
  step: string;
  question: string;
}

const MODES: { id: Mode; icon: React.ReactNode; description: string }[] = [
  { id: 'Coach', icon: <Zap className="w-4 h-4" />, description: 'Direct, focused, practical' },
  { id: 'Friend', icon: <Heart className="w-4 h-4" />, description: 'Warm, reassuring, kind' },
  { id: 'Tough Love', icon: <ShieldAlert className="w-4 h-4" />, description: 'Honest, firm, no coddling' },
  { id: 'Calm', icon: <Wind className="w-4 h-4" />, description: 'Steady, soothing, grounding' },
  { id: 'Big Picture', icon: <Globe className="w-4 h-4" />, description: 'Reflective, thoughtful, perspective-based' },
];

const NEEDS: Need[] = [
  'A next step',
  'Reassurance',
  'A pep talk',
  'A clearer way to think about this',
  'Help making a decision',
];

const Waveform = () => (
  <div className="flex items-center gap-1 h-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <motion.div
        key={i}
        animate={{
          height: [8, 16, 8],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          delay: i * 0.1,
        }}
        className="w-1 bg-[#5A6B5D] dark:bg-[#90A993] rounded-full"
      />
    ))}
  </div>
);

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('Coach');
  const [need, setNeed] = useState<Need>('A next step');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [followUp, setFollowUp] = useState<{ finalThought: string; mantra: string } | null>(null);
  const [followUpInput, setFollowUpInput] = useState('');
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [activeInput, setActiveInput] = useState<'main' | 'followup' | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  
  // Auth & Feedback State
  const [user, setUser] = useState<User | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [adviceId, setAdviceId] = useState<string | null>(null);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  const audioRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeInputRef = useRef<'main' | 'followup' | null>(null);

  // Sync ref with state for use in recognition callbacks
  useEffect(() => {
    activeInputRef.current = activeInput;
  }, [activeInput]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);
  
  const responseRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Ensure user document exists
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              role: 'user',
              createdAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error("Error ensuring user document:", error);
        }
      }
    });

    // Connection Test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  const [loadingMessage, setLoadingMessage] = useState('Reflecting...');

  const loadingMessages = [
    "Reflecting on your situation...",
    "Finding a path forward...",
    "Gathering perspective...",
    "Considering the next move...",
    "Listening to the silence..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      let i = 0;
      interval = setInterval(() => {
        setLoadingMessage(loadingMessages[i % loadingMessages.length]);
        i++;
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => signOut(auth);

  const getAdvice = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setAdvice(null);
    setFollowUp(null);
    setFeedbackSubmitted(false);
    setRating(0);
    setComment('');
    const newAdviceId = Math.random().toString(36).substring(7);
    setAdviceId(newAdviceId);

    try {
      const prompt = `Mode: ${mode}\nNeed: ${need}\nSituation: ${input}`;
      const systemInstruction = `You are Pivot, a life advice assistant. Your job is to help users move forward with clarity through calm, grounded language and thoughtful perspective.
Avoid clichés or overly motivational language. Focus on practical guidance.

Adapt your response based on the selected mode:
- Coach Mode: direct, focused, practical
- Friend Mode: warm, reassuring, kind
- Tough Love Mode: honest, firm, no coddling
- Calm Mode: steady, soothing, grounding
- Big Picture Mode: reflective, thoughtful, perspective-based

For the first response, always use this EXACT format:
Quick Insight:
[2 to 4 sentences]

One Small Step:
[1 clear action]

Question to Think About:
[1 thoughtful follow-up question]`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get advice');
      }

      const data = await response.json();
      const text = data.text || '';
      const sections = text.split('\n\n');
      
      const insight = sections.find(s => s.startsWith('Quick Insight:'))?.replace('Quick Insight:', '').trim() || '';
      const step = sections.find(s => s.startsWith('One Small Step:'))?.replace('One Small Step:', '').trim() || '';
      const question = sections.find(s => s.startsWith('Question to Think About:'))?.replace('Question to Think About:', '').trim() || '';

      setAdvice({ insight, step, question });
    } catch (error: any) {
      console.error("Error fetching advice:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFollowUp = async () => {
    if (!followUpInput.trim() || !advice) return;
    setIsFollowUpLoading(true);

    try {
      const prompt = `Original Situation: ${input}\nYour Advice: ${advice.insight}\nStep: ${advice.step}\nQuestion: ${advice.question}\nUser Response to Question: ${followUpInput}`;
      const systemInstruction = `You are Pivot. The user has responded to your follow-up question.
Provide a response in JSON format with two fields:
1. "finalThought": A max 3-4 sentence reflection that ties the insight and action together.
2. "mantra": A very short, memorable one-sentence mantra (e.g., "Clarity comes through action.") that reinforces the mindset.

Keep the tone calm, grounded, and consistent with the selected mode: ${mode}.
Avoid clichés. Focus on helping the user move forward with clarity.`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, responseMimeType: 'application/json' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get follow-up');
      }

      const data = await response.json();
      const parsedData = JSON.parse(data.text || '{}');
      setFollowUp(parsedData);
    } catch (error: any) {
      console.error("Error fetching follow-up:", error);
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  const copyMantra = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const shareMantra = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Pivot Mantra',
          text: `"${text}" — Found my clarity on Pivot.`,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      copyMantra(text);
    }
  };

  const reset = () => {
    setInput('');
    setAdvice(null);
    setFollowUp(null);
    setFollowUpInput('');
    setFeedbackSubmitted(false);
    setRating(0);
    setComment('');
    setAdviceId(null);
    if (audioRef.current) {
      try {
        audioRef.current.stop();
      } catch (e) {
        audioRef.current.pause?.();
      }
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const playPCM = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = audioContextRef.current;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const arrayBuffer = bytes.buffer;
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      
      audioRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (error) {
      console.error("Error playing PCM:", error);
      setIsPlaying(false);
    }
  };

  const generateSpeech = async (text: string, section: string) => {
    if (isAudioLoading) return;
    
    // If already playing, stop it
    if (isPlaying && audioRef.current) {
      try {
        audioRef.current.stop();
      } catch (e) {
        audioRef.current.pause?.();
      }
      setIsPlaying(false);
      audioRef.current = null;
      return;
    }

    setIsAudioLoading(true);
    setLoadingSection(section);
    try {
      const voiceMap: Record<Mode, string> = {
        'Coach': 'Fenrir',
        'Friend': 'Puck',
        'Tough Love': 'Charon',
        'Calm': 'Zephyr',
        'Big Picture': 'Kore'
      };

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceMap[mode] || 'Kore' },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const data = await response.json();
      const base64Audio = data.audio;
      if (base64Audio) {
        await playPCM(base64Audio);
      }
    } catch (error) {
      console.error("Error generating speech:", error);
    } finally {
      setIsAudioLoading(false);
      setLoadingSection(null);
    }
  };

  useEffect(() => {
    if (advice && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [advice]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');

        const currentInput = activeInputRef.current;
        if (currentInput === 'main') {
          setInput(transcript);
        } else if (currentInput === 'followup') {
          setFollowUpInput(transcript);
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onend = () => {
        setIsListening(false);
        setActiveInput(null);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setActiveInput(null);
        
        if (event.error === 'not-allowed') {
          setSpeechError('Microphone access denied. Please check your browser settings.');
        } else if (event.error === 'network') {
          setSpeechError('Network error. Speech recognition requires an internet connection.');
        } else {
          setSpeechError(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionRef.current = recognition;
    } else if (!SpeechRecognition) {
      setSpeechError('Speech recognition is not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = (type: 'main' | 'followup') => {
    if (!recognitionRef.current) {
      setSpeechError('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setActiveInput(type);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Failed to start recognition:', e);
        // If already started, just update the active input
        setActiveInput(type);
      }
    }
  };

  const submitFeedback = async () => {
    if (!user || !adviceId || rating === 0) return;
    setIsSubmittingFeedback(true);
    const path = 'feedback';
    try {
      await addDoc(collection(db, path), {
        uid: user.uid,
        adviceId,
        rating,
        comment,
        mode,
        need,
        createdAt: serverTimestamp()
      });
      setFeedbackSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9F5] dark:bg-[#1A1F1A] text-[#3A4439] dark:text-[#EDF1EB] font-sans selection:bg-[#E0E4DE] dark:selection:bg-[#3A4439] transition-colors duration-300">
      {/* Header */}
      <header className="max-w-3xl mx-auto px-5 pt-8 pb-8 md:pt-12 md:pb-10 border-b border-[#DDE2D9] dark:border-[#2D342D]">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif italic tracking-tight text-[#3A4439] dark:text-[#EDF1EB]">Pivot</h1>
            <p className="text-base md:text-lg text-[#5A6B5D] dark:text-[#90A993] font-serif italic mt-1 md:mt-2">Because sometimes in life, you just need to pivot.</p>
          </div>
          <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto justify-between md:justify-end">
            {user ? (
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-[#DDE2D9] dark:border-[#2D342D]" />
                <button 
                  onClick={logout}
                  className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2] hover:text-[#3A4439] dark:hover:text-[#EDF1EB] transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2] hover:text-[#3A4439] dark:hover:text-[#EDF1EB] transition-colors"
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
            )}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 hover:bg-[#EDF1EB] dark:hover:bg-[#3A4439] rounded-full transition-colors text-[#7A857C] dark:text-[#A0A9A2]"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button 
              onClick={reset}
              className="p-2 hover:bg-[#EDF1EB] dark:hover:bg-[#3A4439] rounded-full transition-colors text-[#7A857C] dark:text-[#A0A9A2]"
              title="Start Over"
              aria-label="Start a new session"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-xs md:text-sm text-[#7A857C] dark:text-[#A0A9A2] leading-relaxed max-w-2xl">
          Share what is on your mind and Pivot will offer a perspective, a practical next step, and a question to help you think more clearly.
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 md:py-12 space-y-10 md:space-y-12">
        {/* Error Toast */}
        <AnimatePresence>
          {speechError && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm flex justify-between items-center"
            >
              <span>{speechError}</span>
              <button onClick={() => setSpeechError(null)} className="font-bold ml-4">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading && !advice && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 space-y-6"
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#5A6B5D]/20 border-t-[#5A6B5D] rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-[#5A6B5D]/10 dark:bg-[#90A993]/10 rounded-full animate-pulse" />
              </div>
            </div>
            <p className="text-lg font-serif italic text-[#5A6B5D] dark:text-[#90A993] animate-pulse">
              {loadingMessage}
            </p>
          </motion.div>
        )}

        {/* Mode & Need Selection */}
        {!advice && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            <section className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2]">Choose a perspective</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                      mode === m.id 
                        ? 'bg-[#5A6B5D] text-white border-[#5A6B5D] shadow-lg' 
                        : 'bg-white dark:bg-[#242B24] border-[#DDE2D9] dark:border-[#2D342D] hover:border-[#5A6B5D] text-[#3A4439] dark:text-[#EDF1EB]'
                    }`}
                  >
                    <div className={mode === m.id ? 'text-white' : 'text-[#7A857C] dark:text-[#A0A9A2]'}>
                      {m.icon}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{m.id}</div>
                      <div className={`text-[10px] opacity-70 ${mode === m.id ? 'text-white' : 'text-[#7A857C] dark:text-[#A0A9A2]'}`}>
                        {m.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2]">What would help most right now?</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {NEEDS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setNeed(n)}
                    className={`px-3 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all text-center flex items-center justify-center leading-tight ${
                      need === n 
                        ? 'bg-[#5A6B5D] text-white border-[#5A6B5D] shadow-md' 
                        : 'bg-white dark:bg-[#242B24] border-[#DDE2D9] dark:border-[#2D342D] hover:border-[#5A6B5D] text-[#7A857C] dark:text-[#A0A9A2]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-1">
                <label className="text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2]">What's on your mind?</label>
                <p className="text-[9px] md:text-[10px] text-[#7A857C] dark:text-[#A0A9A2] italic opacity-70">
                  Tap the microphone to record. Press the arrow to send.
                </p>
              </div>
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe your situation..."
                  className="w-full h-48 md:h-40 p-5 md:p-6 rounded-3xl border border-[#DDE2D9] dark:border-[#2D342D] bg-white dark:bg-[#242B24] focus:ring-2 focus:ring-[#5A6B5D] focus:border-transparent outline-none transition-all resize-none text-base md:text-lg font-serif italic text-[#3A4439] dark:text-[#EDF1EB]"
                />
                <p className="mt-2 text-[10px] text-[#7A857C] dark:text-[#A0A9A2] italic opacity-60 text-center">
                  Your questions are not stored to ensure your privacy.
                </p>
                <div className="absolute bottom-4 left-4 md:left-6 flex items-center gap-3">
                  <AnimatePresence>
                    {isListening && activeInput === 'main' && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="flex items-center gap-2 md:gap-3 bg-[#EDF1EB] dark:bg-[#2D342D] px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-[#DDE2D9] dark:border-[#3A4439]"
                      >
                        <Waveform />
                        <span className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-[#5A6B5D] dark:text-[#90A993] animate-pulse">Recording...</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button
                    onClick={() => toggleListening('main')}
                    className={`p-3 md:p-4 rounded-2xl transition-all shadow-xl ${
                      isListening && activeInput === 'main'
                        ? 'bg-[#5A6B5D] text-white ring-4 ring-[#5A6B5D]/20'
                        : 'bg-white dark:bg-[#242B24] text-[#3A4439] dark:text-[#EDF1EB] border border-[#DDE2D9] dark:border-[#2D342D] hover:border-[#5A6B5D]'
                    }`}
                    title={isListening ? "Stop Listening" : "Voice Input"}
                    aria-label={isListening ? "Stop voice recording" : "Start voice recording"}
                  >
                    <Mic className={`w-5 h-5 md:w-6 md:h-6 ${isListening && activeInput === 'main' ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={getAdvice}
                    disabled={isLoading || !input.trim()}
                    className="bg-[#5A6B5D] text-white p-3 md:p-4 rounded-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-xl"
                    aria-label="Get advice"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />}
                  </button>
                </div>
              </div>
            </section>
          </motion.div>
        )}

        {/* Advice Display */}
        <AnimatePresence>
          {advice && (
            <motion.div 
              ref={responseRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12 pb-24"
            >
              {/* Context Summary */}
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2] opacity-50">
                <span>{mode} Mode</span>
                <span>•</span>
                <span>{need}</span>
              </div>

              {/* Insight */}
              <section className="space-y-4 md:space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-serif italic text-xl md:text-2xl text-[#7A857C] dark:text-[#A0A9A2]">Quick Insight</h2>
                  <div className="flex items-center gap-3">
                    <AnimatePresence>
                      {isAudioLoading && loadingSection === 'insight' && (
                        <motion.span 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-[#5A6B5D] dark:text-[#90A993] animate-pulse"
                        >
                          Preparing audio...
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <button 
                      onClick={() => generateSpeech(advice.insight, 'insight')}
                      disabled={isAudioLoading && loadingSection !== 'insight'}
                      className={`p-2 rounded-full transition-all ${isPlaying && loadingSection === 'insight' ? 'bg-[#5A6B5D] text-white' : 'hover:bg-[#EDF1EB] dark:hover:bg-[#2D342D] text-[#7A857C] dark:text-[#A0A9A2]'}`}
                      title="Listen"
                      aria-label="Listen to insight"
                    >
                      {isAudioLoading && loadingSection === 'insight' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-xl md:text-2xl leading-relaxed font-serif text-[#3A4439] dark:text-[#EDF1EB]">
                  {advice.insight}
                </p>
              </section>

              {/* Small Step */}
              <section className="bg-[#EDF1EB] dark:bg-[#242B24] p-6 md:p-10 rounded-[32px] md:rounded-[40px] space-y-4 md:space-y-6 border border-[#DDE2D9] dark:border-[#2D342D]">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7A857C] dark:text-[#A0A9A2]">One Small Step</h2>
                <div className="flex items-start gap-4 md:gap-6">
                  <div className="bg-[#5A6B5D] text-white p-2.5 md:p-3 rounded-xl md:rounded-2xl mt-1 shadow-sm shrink-0">
                    <Zap className="w-4 h-4 md:w-5 md:h-5" />
                  </div>
                  <p className="text-xl md:text-2xl font-medium leading-tight text-[#3A4439] dark:text-[#EDF1EB]">
                    {advice.step}
                  </p>
                </div>
              </section>

              {/* Question */}
              <section className="space-y-6 md:space-y-8 pt-10 md:pt-16 border-t border-[#DDE2D9] dark:border-[#2D342D]">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-1">
                  <h2 className="font-serif italic text-xl md:text-2xl text-[#7A857C] dark:text-[#A0A9A2]">Question to Think About</h2>
                  <p className="text-[9px] md:text-[10px] text-[#7A857C] dark:text-[#A0A9A2] italic opacity-70">
                    Tap the microphone to record. Press the arrow to send.
                  </p>
                </div>
                <p className="text-2xl md:text-3xl leading-relaxed font-serif italic text-[#3A4439] dark:text-[#EDF1EB]">
                  "{advice.question}"
                </p>

                {!followUp && (
                  <div className="relative mt-8 md:mt-10">
                    <textarea
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      placeholder="Your thoughts..."
                      className="w-full p-5 md:p-6 rounded-3xl border border-[#DDE2D9] dark:border-[#2D342D] bg-white dark:bg-[#242B24] focus:ring-2 focus:ring-[#5A6B5D] focus:border-transparent outline-none transition-all resize-none text-base md:text-lg font-serif italic text-[#3A4439] dark:text-[#EDF1EB] h-32 md:h-auto"
                    />
                    <p className="mt-2 text-[10px] text-[#7A857C] dark:text-[#A0A9A2] italic opacity-60 text-center">
                      Your thoughts are not stored to ensure your privacy.
                    </p>
                    <div className="absolute bottom-4 left-4 md:left-6 flex items-center gap-3">
                      <AnimatePresence>
                        {isListening && activeInput === 'followup' && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex items-center gap-2 md:gap-3 bg-[#EDF1EB] dark:bg-[#2D342D] px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-[#DDE2D9] dark:border-[#3A4439]"
                          >
                            <Waveform />
                            <span className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-[#5A6B5D] dark:text-[#90A993] animate-pulse">Recording...</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <button
                        onClick={() => toggleListening('followup')}
                        className={`p-3 md:p-4 rounded-2xl transition-all shadow-xl ${
                          isListening && activeInput === 'followup'
                            ? 'bg-[#5A6B5D] text-white ring-4 ring-[#5A6B5D]/20'
                            : 'bg-white dark:bg-[#242B24] text-[#3A4439] dark:text-[#EDF1EB] border border-[#DDE2D9] dark:border-[#2D342D] hover:border-[#5A6B5D]'
                        }`}
                        title={isListening ? "Stop Listening" : "Voice Input"}
                        aria-label={isListening ? "Stop voice recording" : "Start voice recording"}
                      >
                        <Mic className={`w-5 h-5 md:w-6 md:h-6 ${isListening && activeInput === 'followup' ? 'animate-pulse' : ''}`} />
                      </button>
                      <button
                        onClick={getFollowUp}
                        disabled={isFollowUpLoading || !followUpInput.trim()}
                        className="bg-[#5A6B5D] text-white p-3 md:p-4 rounded-2xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-xl"
                        aria-label="Send response"
                      >
                        {isFollowUpLoading ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Follow Up Response */}
              {followUp && (
                <motion.section 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#3A4439] text-[#F8F9F5] p-6 md:p-10 rounded-[32px] md:rounded-[40px] space-y-6 shadow-2xl border border-white/5 dark:border-white/10"
                >
                  <div className="flex justify-between items-center">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Final Thought</h2>
                    <div className="flex items-center gap-3">
                      <AnimatePresence>
                        {isAudioLoading && loadingSection === 'final' && (
                          <motion.span 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-white/70 animate-pulse"
                          >
                            Preparing audio...
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <button 
                        onClick={() => generateSpeech(`${followUp.finalThought}. Your mantra: ${followUp.mantra}`, 'final')}
                        disabled={isAudioLoading && loadingSection !== 'final'}
                        className={`p-2 rounded-full transition-all ${isPlaying && loadingSection === 'final' ? 'bg-[#F8F9F5] text-[#3A4439]' : 'hover:bg-white/10 text-white'}`}
                        title="Listen"
                        aria-label="Listen to final thought and mantra"
                      >
                        {isAudioLoading && loadingSection === 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-lg md:text-xl leading-relaxed font-serif italic">
                    {followUp.finalThought}
                  </p>
                  
                  <div className="pt-6 border-t border-white/10 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Mantra</h3>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => copyMantra(followUp.mantra)}
                          className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-2"
                          aria-label="Copy mantra to clipboard"
                        >
                          Copy <Copy className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => shareMantra(followUp.mantra)}
                          className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-2"
                          aria-label="Share mantra"
                        >
                          Share <Globe className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xl md:text-2xl font-serif italic text-white">
                      "{followUp.mantra}"
                    </p>
                  </div>

                  <div className="pt-8">
                    <button 
                      onClick={reset}
                      className="w-full bg-[#F8F9F5] text-[#3A4439] py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-white transition-all shadow-xl flex items-center justify-center gap-3 group"
                      aria-label="Start a new session"
                    >
                      New Session 
                      <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                  </div>
                </motion.section>
              )}

              {/* Feedback Section */}
              <motion.section 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-12 border-t border-[#DDE2D9] dark:border-[#2D342D] space-y-6"
              >
                <div className="text-center space-y-2">
                  <h3 className="font-serif italic text-xl text-[#7A857C] dark:text-[#A0A9A2]">How was this advice?</h3>
                  <p className="text-xs text-[#7A857C] dark:text-[#A0A9A2] uppercase tracking-widest">Your feedback helps Pivot improve</p>
                </div>

                {!feedbackSubmitted ? (
                  <div className="max-w-md mx-auto space-y-6">
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          className="p-1 transition-transform hover:scale-110 active:scale-95"
                        >
                          <Star 
                            className={`w-8 h-8 ${
                              (hoverRating || rating) >= star 
                                ? 'fill-[#5A6B5D] dark:fill-[#90A993] text-[#5A6B5D] dark:text-[#90A993]' 
                                : 'text-[#DDE2D9] dark:text-[#2D342D]'
                            }`} 
                          />
                        </button>
                      ))}
                    </div>

                    {rating > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {!user ? (
                          <div className="text-center p-6 bg-white dark:bg-[#242B24] border border-[#DDE2D9] dark:border-[#2D342D] rounded-3xl space-y-3">
                            <p className="text-sm text-[#7A857C] dark:text-[#A0A9A2]">Please login to submit feedback</p>
                            <button 
                              onClick={login}
                              className="bg-[#5A6B5D] text-white px-6 py-2 rounded-full text-sm font-bold uppercase tracking-widest hover:scale-105 transition-all"
                            >
                              Login with Google
                            </button>
                          </div>
                        ) : (
                          <>
                            <textarea
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Any additional thoughts? (Optional)"
                              className="w-full p-4 rounded-2xl border border-[#DDE2D9] dark:border-[#2D342D] bg-white dark:bg-[#242B24] focus:ring-2 focus:ring-[#5A6B5D] focus:border-transparent outline-none transition-all resize-none text-sm font-serif italic text-[#3A4439] dark:text-[#EDF1EB]"
                              rows={3}
                            />
                            <button
                              onClick={submitFeedback}
                              disabled={isSubmittingFeedback}
                              className="w-full bg-[#5A6B5D] text-white py-4 rounded-2xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                            >
                              {isSubmittingFeedback ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Feedback</>}
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center p-8 bg-[#EDF1EB] dark:bg-[#242B24] rounded-[40px] border border-[#DDE2D9] dark:border-[#2D342D]"
                  >
                    <p className="font-serif italic text-[#5A6B5D] dark:text-[#90A993] text-lg">Thank you for your feedback. It means a lot.</p>
                  </motion.div>
                )}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <div className="flex justify-center gap-8">
          <button 
            onClick={() => setIsPrivacyModalOpen(true)}
            className="text-[10px] text-[#7A857C] dark:text-[#A0A9A2] uppercase tracking-[0.2em] hover:text-[#3A4439] dark:hover:text-[#EDF1EB] transition-colors"
          >
            Privacy & Security
          </button>
        </div>
        <div className="text-center text-[10px] text-[#7A857C] dark:text-[#A0A9A2] uppercase tracking-[0.2em] opacity-50">
          Pivot Assistant • Grounded Advice for Human Beings
        </div>
      </footer>

      {/* Privacy Modal */}
      <AnimatePresence>
        {isPrivacyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPrivacyModalOpen(false)}
              className="absolute inset-0 bg-[#3A4439]/40 dark:bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-[#1A1F1A] max-w-lg w-full p-8 md:p-12 rounded-[40px] shadow-2xl border border-[#DDE2D9] dark:border-[#2D342D] space-y-8"
            >
              <div className="space-y-4">
                <h2 className="text-3xl font-serif italic text-[#3A4439] dark:text-[#EDF1EB]">Privacy First</h2>
                <div className="space-y-4 text-[#5A6B5D] dark:text-[#90A993] text-sm leading-relaxed">
                  <p>
                    Pivot was built with a simple philosophy: your personal reflections should remain yours.
                  </p>
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest text-[10px] text-[#7A857C] dark:text-[#A0A9A2]">No Storage</h3>
                    <p>We do not store the situations you describe or the thoughts you share in follow-up conversations. They exist only for the duration of your session.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest text-[10px] text-[#7A857C]">Feedback & Improvement</h3>
                    <p>If you choose to submit feedback, we store your rating and optional comment to help improve the assistant. This is the only data we persist.</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold uppercase tracking-widest text-[10px] text-[#7A857C]">Secure Processing</h3>
                    <p>Your inputs are processed securely via Google's Gemini API to provide grounded, thoughtful advice.</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsPrivacyModalOpen(false)}
                className="w-full bg-[#5A6B5D] text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:scale-[1.02] transition-all"
              >
                I Understand
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
