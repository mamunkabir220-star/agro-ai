'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const AUTH_VERIFY_URL = 'https://agro-com-bd.vercel.app/agro-assistant/api/auth/me';
const AGRO_MAIN_URL   = 'https://agro-com-bd.vercel.app';

// ── Weather code → icon + label ──
function weatherIcon(code) {
  if (code === 0) return { icon: '☀️', label: 'পরিষ্কার' };
  if (code <= 3)  return { icon: '⛅', label: 'আংশিক মেঘ' };
  if (code <= 48) return { icon: '🌫️', label: 'কুয়াশা' };
  if (code <= 67) return { icon: '🌧️', label: 'বৃষ্টি' };
  if (code <= 77) return { icon: '❄️', label: 'শিলা' };
  if (code <= 82) return { icon: '🌦️', label: 'বৃষ্টি' };
  return { icon: '⛈️', label: 'ঝড়' };
}

const DAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
const CAT_ICON = { crop:'🌾', soil:'🪱', pest:'🐛', disease:'🦠', fertilizer:'🧪', irrigation:'💧', livestock:'🐄', fishery:'🐟', weather:'⛅', equipment:'🚜', market:'💰', organic:'🌿', product:'🛒', other:'🌱' };

function inferServiceType(text) {
  const q = text.toLowerCase();
  if (/গরু|ছাগল|মুরগি|হাঁস|গবাদি|পশু|ভেটেরিনারি|cow|goat|chicken|livestock|vet/i.test(q)) return 'vet';
  if (/মাছ|চিংড়ি|পুকুর|fish|shrimp|pond|aqua/i.test(q)) return 'fishery';
  if (/ফল|বাগান|আম|কলা|পেঁপে|horticulture|fruit|garden/i.test(q)) return 'horticulture';
  if (/ধান|গম|সবজি|ফসল|rice|crop|vegetable/i.test(q)) return 'crop';
  return 'extension';
}

const HISTORY_KEY = 'agro_history';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(q, answer) {
  try {
    const h = loadHistory();
    const entry = { q, answer: answer.slice(0,120), ts: Date.now() };
    const updated = [entry, ...h.filter(e => e.q !== q)].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}
function searchHistory(q) {
  try {
    const h = loadHistory();
    const words = q.toLowerCase().split(' ').filter(w => w.length > 2);
    return h.find(e => words.some(w => e.q.toLowerCase().includes(w)));
  } catch { return null; }
}

function getOrCreateUserId() {
  if (typeof window === 'undefined') return 'anon';
  let uid = localStorage.getItem('agro_uid');
  if (!uid) { uid = 'web_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('agro_uid', uid); }
  return uid;
}

const WELCOME = {
  agro:    '🌾 আসসালামু আলাইকুম! আমি Agro Assistant।\n\nফসল, গাছপালা, পশু, মাছ, সার, রোগ, আবহাওয়া — যেকোনো কৃষি প্রশ্ন করুন।',
  product: '🛒 আমি Agro Assistant সেলস অ্যাসিস্ট্যান্ট!\n\nagro.com.bd থেকে সেরা কৃষি পণ্য খুঁজে পেতে সাহায্য করব।',
};

const AGRO_QUICK    = ['ধান চাষে কোন সার দেব?', 'টমেটোতে পোকা দমন?', 'জৈব সার তৈরির উপায়?', 'মাছ চাষে pH কত হওয়া উচিত?'];
const PRODUCT_QUICK = ['ধানের জন্য সেরা সার?', 'কীটনাশক কিনতে চাই', 'সেচ পাম্প দরকার', 'বীজ কোথায় পাব?'];

// ── Animated chat demo for landing page ──
function AnimatedChatCard() {
  const CONVOS = [
    { q: 'মাছের পুকুরে pH কত রাখব?',       a: 'পুকুরের pH ৭.০–৮.৫ এর মধ্যে রাখা আদর্শ।',                   tips: ['নিয়মিত pH পরীক্ষা করুন', 'প্রয়োজনে চুন প্রয়োগ করুন'] },
    { q: 'ধান পাতায় হলুদ রং কেন?',         a: 'নাইট্রোজেনের অভাবে পাতা হলুদ হয়। ইউরিয়া সার দিন।',      tips: ['বিকেলে সার প্রয়োগ করুন', 'সেচের পর দিন'] },
    { q: 'টমেটোতে পোকা দমন করব কীভাবে?',  a: 'নিম তেল বা অনুমোদিত কীটনাশক স্প্রে করুন।',              tips: ['ভোরে স্প্রে করুন', 'ফুলের সময় এড়িয়ে চলুন'] },
  ];

  const [ci, setCi]           = useState(0);
  const [userText, setUserText] = useState('');
  const [botText, setBotText]   = useState('');
  const [showDots, setShowDots] = useState(false);
  const [showTip, setShowTip]   = useState(false);
  const [fade, setFade]         = useState(false);

  useEffect(() => {
    let cancelled = false;
    const convo = CONVOS[ci];
    setUserText(''); setBotText(''); setShowDots(false); setShowTip(false); setFade(false);

    const delay = ms => new Promise(r => setTimeout(r, ms));

    async function run() {
      await delay(1000); if (cancelled) return;
      for (let i = 1; i <= convo.q.length; i++) {
        if (cancelled) return;
        setUserText(convo.q.slice(0, i));
        await delay(55);
      }
      await delay(400); if (cancelled) return;
      setShowDots(true);
      await delay(1200); if (cancelled) return;
      setShowDots(false);
      for (let i = 1; i <= convo.a.length; i++) {
        if (cancelled) return;
        setBotText(convo.a.slice(0, i));
        await delay(30);
      }
      await delay(300); if (cancelled) return;
      setShowTip(true);
      await delay(2500); if (cancelled) return;
      setFade(true);
      await delay(600); if (cancelled) return;
      setCi(prev => (prev + 1) % CONVOS.length);
    }
    run();
    return () => { cancelled = true; };
  }, [ci]);

  const convo = CONVOS[ci];

  return (
    <div className={`mx-auto max-w-md rounded-2xl border border-green-200 bg-white shadow-xl overflow-hidden mb-8 text-left transition-opacity duration-500 ${fade ? 'opacity-0' : 'opacity-100'}`}>
      <div className="flex items-center gap-2 bg-green-700 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-yellow-400" />
        <span className="h-3 w-3 rounded-full bg-green-400" />
        <img src="/logo.png" alt="agro" className="ml-2 h-4 w-auto brightness-0 invert" />
      </div>
      <div className="p-4 space-y-3 min-h-[210px]">
        <div className="flex justify-start">
          <div className="bg-gray-100 text-gray-700 text-xs rounded-2xl rounded-bl-none px-3 py-2 max-w-[75%]">
            আমি Agro Assistant। আপনার কৃষি প্রশ্ন করুন।
          </div>
        </div>
        {userText && (
          <div className="flex justify-end">
            <div className="bg-green-600 text-white text-xs rounded-2xl rounded-br-none px-3 py-2 max-w-[75%]">
              {userText}{userText.length < convo.q.length && <span className="opacity-60">|</span>}
            </div>
          </div>
        )}
        {showDots && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-none px-3 py-2 flex gap-1 items-center">
              {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}} />)}
            </div>
          </div>
        )}
        {botText && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-700 text-xs rounded-2xl rounded-bl-none px-3 py-2 max-w-[85%]">
              {botText}{botText.length < convo.a.length && <span className="opacity-60">|</span>}
            </div>
          </div>
        )}
        {showTip && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-800">
            <p className="font-semibold mb-1">💡 টিপস:</p>
            {convo.tips.map((t, i) => <p key={i}>✓ {t}</p>)}
          </div>
        )}
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
          <span className="flex-1 text-xs text-gray-400">আপনার কৃষি প্রশ্ন লিখুন...</span>
          <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-green-600 text-white text-xs">➤</div>
        </div>
      </div>
    </div>
  );
}

// ── Landing Page ──
function LandingPage() {
  const features = [
    { icon: '🌱', title: 'বিনামূল্যে কৃষি পরামর্শ', desc: 'ফসল, সার, রোগ সব বিষয়ে বিশেষজ্ঞ পরামর্শ পান।' },
    { icon: '📍', title: 'আপনার এলাকার তথ্য', desc: 'স্থানীয় আবহাওয়া, মাটি ও বাজার দর জানুন।' },
    { icon: '🛒', title: 'সঠিক পণ্য সুপারিশ', desc: 'আপনার সমস্যার জন্য সেরা কৃষি পণ্য খুঁজে পান।' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="agro" className="h-9 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            <a href={AGRO_MAIN_URL + '/login'}
              className="text-sm font-semibold text-green-700 hover:text-green-900 px-3 py-1.5 rounded-full hover:bg-green-50 transition">
              লগইন
            </a>
            <a href={AGRO_MAIN_URL + '/signup'}
              className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-full hover:bg-green-700 transition shadow">
              সাইনআপ
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-5 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          বাংলাদেশের কৃষকদের জন্য
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-green-900 leading-tight mb-5">
          আপনার সমস্যা বলুন,<br/>সমাধান পান মুহূতেই
        </h1>

        {/* Animated chat demo */}
        <AnimatedChatCard />

        <p className="text-sm text-gray-500 mb-8">
          ফসল, পশু, মাছ, সার, রোগ — যেকোনো কৃষি সমস্যায় তাৎক্ষণিক বিশেষজ্ঞ পরামর্শ পান। বাংলা ও ইংরেজিতে।
        </p>

        <a href={AGRO_MAIN_URL + '/login'}
          className="inline-block bg-green-600 text-white font-bold px-8 py-3.5 rounded-full text-base hover:bg-green-700 transition shadow-lg hover:shadow-green-200">
          এখনই শুরু করুন →
        </a>
      </main>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-5 py-12">
        <p className="text-center text-sm font-bold text-slate-500 uppercase tracking-widest mb-8">কেন লগইন বা সাইনআপ করবেন?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border border-green-100 shadow-sm p-5 text-center hover:shadow-md transition">
              <div className="text-4xl mb-3">{f.icon}</div>
              <p className="font-bold text-green-800 text-sm mb-1">{f.title}</p>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center py-6 text-xs text-gray-400">
        © agro.com.bd — সকল অধিকার সংরক্ষিত
      </footer>
    </div>
  );
}

// ── Loading Screen ──
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4" style={{ animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>🌾</div>
        <p className="text-green-700 font-medium">লোড হচ্ছে...</p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const T = {
  bn: {
    newChat: 'নতুন চ্যাট',
    weatherLoading: 'আবহাওয়া লোড হচ্ছে...',
    weatherAdvice: '🌱 আবহাওয়া পরামর্শ:',
    recentQ: 'সাম্প্রতিক প্রশ্ন',
    noHistory: 'কোনো ইতিহাস নেই',
    homeLink: 'হোম — agro.com.bd',
    logout: 'লগআউট',
    todayQ: 'আজকের প্রশ্ন',
    bonusMode: (n) => `⭐ বোনাস মোড: ${n} প্রশ্ন বাকি`,
    qLeft: 'প্রশ্ন বাকি',
    bonusLabel: '⭐ বোনাস',
    farmingTab: '🌱 কৃষি পরামর্শ',
    loadingExtras: 'পণ্য ও সেবা খুঁজছি...',
    tips: '💡 টিপস:',
    foundAt: '🛒 agro.com.bd এ পাওয়া যায়:',
    viewBtn: 'দেখুন →',
    nearbyServices: '📍 কাছের সরকারি সেবা',
    readyToOrder: '🎉 অর্ডার করতে প্রস্তুত?',
    visitSite: '🌐 agro.com.bd এ যান',
    whatsapp: '💬 WhatsApp এ যোগাযোগ',
    callNow: '📞 এখনই কল করুন',
    learnMore: 'আরও জানতে:',
    bonusGiven: '🎁 ১৫টি প্রশ্ন শেষ! আরও ৫টি বোনাস পেয়েছেন।',
    nearLimit: (n) => `⚠️ মাত্র ${n}টি প্রশ্ন বাকি।`,
    placeholder: 'আপনার কৃষি প্রশ্ন লিখুন...',
    cacheLabel: '⚡ ক্যাশ',
    deviceCache: '📱 ডিভাইস',
    langSwitch: 'EN',
    quickQ: ['ধান চাষে কোন সার দেব?', 'টমেটোতে পোকা দমন?', 'জৈব সার তৈরির উপায়?', 'মাছ চাষে pH কত?'],
    welcome: '🌾 আসসালামু আলাইকুম! আমি Agro Assistant।\n\nফসল, গাছপালা, পশু, মাছ, সার, রোগ, আবহাওয়া — যেকোনো কৃষি প্রশ্ন করুন।',
  },
  en: {
    newChat: 'New Chat',
    weatherLoading: 'Loading weather...',
    weatherAdvice: '🌱 Weather advice:',
    recentQ: 'Recent Questions',
    noHistory: 'No history yet',
    homeLink: 'Home — agro.com.bd',
    logout: 'Logout',
    todayQ: "Today's Questions",
    bonusMode: (n) => `⭐ Bonus mode: ${n} left`,
    qLeft: 'left',
    bonusLabel: '⭐ Bonus',
    farmingTab: '🌱 Farming Advice',
    loadingExtras: 'Finding products & services...',
    tips: '💡 Tips:',
    foundAt: '🛒 Available on agro.com.bd:',
    viewBtn: 'View →',
    nearbyServices: '📍 Nearby government services',
    readyToOrder: '🎉 Ready to order?',
    visitSite: '🌐 Visit agro.com.bd',
    whatsapp: '💬 Contact via WhatsApp',
    callNow: '📞 Call Now',
    learnMore: 'Learn more:',
    bonusGiven: '🎁 15 questions done! You got 5 bonus questions.',
    nearLimit: (n) => `⚠️ Only ${n} questions left.`,
    placeholder: 'Write your farming question...',
    cacheLabel: '⚡ Cache',
    deviceCache: '📱 Device',
    langSwitch: 'বাং',
    quickQ: ['Best fertilizer for rice?', 'How to control pests in tomato?', 'How to make organic compost?', 'Ideal pH for fish farming?'],
    welcome: '🌾 Hello! I am Agro Assistant.\n\nAsk me anything about crops, plants, livestock, fish, fertilizers, diseases, or weather.',
  },
};

// ── Chat App (full chat UI) ──
function ChatApp() {
  const [chatType,    setChatType]    = useState('agro');
  const [messages,    setMessages]    = useState([{ id: 1, role: 'bot', text: WELCOME.agro, tips: [], followUp: [], category: 'other' }]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [remaining,   setRemaining]   = useState(15);
  const [limitInfo,   setLimitInfo]   = useState({ bonusGranted: false, isBonus: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history,     setHistory]     = useState([]);
  const [location,    setLocation]    = useState(null);
  const [weather,     setWeather]     = useState(null);
  const [weatherLoad, setWeatherLoad] = useState(false);
  const [lang,        setLang]        = useState('bn');
  const t = T[lang];

  const bottomRef = useRef(null);
  const textRef   = useRef(null);

  useEffect(() => {
    setHistory(loadHistory());
    const uid = getOrCreateUserId();
    fetch(`/api/status?userId=${uid}&chatType=${chatType}`)
      .then(r => r.json())
      .then(d => { setRemaining(d.remaining ?? 15); setLimitInfo({ bonusGranted: d.bonusGranted, isBonus: d.isBonus }); })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        let locInfo = { lat, lon, name: 'আপনার এলাকা', district: 'Dhaka', division: 'Dhaka' };
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'User-Agent': 'AgroBot/1.0' } });
          const geo    = await geoRes.json();
          const addr   = geo.address || {};
          locInfo = { lat, lon, name: addr.county || addr.state_district || addr.city || addr.town || 'আপনার এলাকা', district: addr.county || addr.state_district || 'Dhaka', division: addr.state || 'Dhaka' };
        } catch (_) {}
        setLocation(locInfo);
        setWeatherLoad(true);
        fetch(`/api/weather?lat=${lat}&lon=${lon}`).then(r => r.json()).then(d => { setWeather(d); setWeatherLoad(false); }).catch(() => setWeatherLoad(false));
      }, () => {
        setLocation({ lat: 23.8, lon: 90.4, name: 'ঢাকা', district: 'Dhaka', division: 'Dhaka' });
        fetch('/api/weather?lat=23.8&lon=90.4').then(r=>r.json()).then(setWeather).catch(()=>{});
      });
    }
  }, []);

  useEffect(() => {
    const uid = getOrCreateUserId();
    fetch(`/api/status?userId=${uid}&chatType=${chatType}`).then(r => r.json()).then(d => { setRemaining(d.remaining ?? 15); setLimitInfo({ bonusGranted: d.bonusGranted, isBonus: d.isBonus }); }).catch(() => {});
  }, [chatType]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    if (textRef.current) textRef.current.style.height = 'auto';

    const histMatch = searchHistory(q);
    if (histMatch) {
      setMessages(prev => [...prev,
        { id: Date.now(), role: 'user', text: q },
        { id: Date.now()+1, role: 'bot', text: histMatch.answer + '\n\n_(ডিভাইস ক্যাশ থেকে)_', tips: [], followUp: [], category: 'other', fromDeviceCache: true }
      ]);
    } else {
      setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: q }]);
      setLoading(true);
    }

    try {
      const uid = getOrCreateUserId();
      const chatPromise = fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, userId: uid, chatType }) }).then(r => r.json());
      const productPromise = chatType === 'agro' ? fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problem: q }) }).then(r => r.json()).catch(() => ({ products: [] })) : Promise.resolve({ products: [] });
      const serviceType = inferServiceType(q);
      const servicePromise = location ? fetch(`/api/services?district=${encodeURIComponent(location.district)}&division=${encodeURIComponent(location.division)}&type=${serviceType}`).then(r => r.json()).catch(() => ({ services: [] })) : Promise.resolve({ services: [] });

      const data = await chatPromise;
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (data.bonusGranted !== undefined) setLimitInfo({ bonusGranted: data.bonusGranted, isBonus: data.isBonus });
      if (data.success && data.response) saveHistory(q, data.response);
      setHistory(loadHistory());

      setMessages(prev => [...prev, { id: Date.now() + 3, role: 'bot', text: data.response || '🔧 কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।', tips: data.tips || [], followUp: data.followUp || [], category: data.category || 'other', cached: data.cached, bonusJustGiven: data.bonusJustGiven, nearLimit: data.nearLimit, isConverted: data.isConverted, conversionCTA: data.conversionCTA, limitHit: data.limitHit, loadingExtras: true }]);
      setLoading(false);

      const [productData, serviceData] = await Promise.all([productPromise, servicePromise]);
      setMessages(prev => {
        const last = [...prev].reverse().find(m => m.role === 'bot' && m.loadingExtras !== undefined);
        if (!last) return prev;
        return prev.map(m => m.id === last.id ? { ...m, loadingExtras: false, products: productData.products || [], services: serviceData.services || [], serviceType } : m);
      });
    } catch {
      setMessages(prev => [...prev, { id: Date.now()+4, role: 'bot', text: '🔧 নেটওয়ার্ক সমস্যা। ইন্টারনেট চেক করুন।', tips: [], followUp: [] }]);
      setLoading(false);
    }
  }, [input, loading, chatType, location]);

  function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
  function switchChat(type) {
    if (type === chatType) return;
    setChatType(type);
    setMessages([{ id: Date.now(), role: 'bot', text: T[lang].welcome, tips: [], followUp: [], category: 'other' }]);
    setInput('');
  }

  const pct      = Math.round(((15 - Math.min(remaining, 15)) / 15) * 100);
  const barColor = remaining <= 3 ? 'bg-red-500' : remaining <= 7 ? 'bg-yellow-400' : 'bg-green-400';
  const quickQ   = chatType === 'product' ? PRODUCT_QUICK : AGRO_QUICK;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-gradient-to-b from-green-800 to-green-900 text-white flex flex-col shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-green-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="agro" className="h-8 w-auto brightness-0 invert" />
              <p className="text-xs text-green-300">agro.com.bd</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-green-300 hover:text-white text-xl">✕</button>
          </div>
        </div>

        <div className="p-3 border-b border-green-700">
          {location && <div className="flex items-center gap-1 text-xs text-green-300 mb-2"><span>📍</span><span>{location.name}</span></div>}
          {weatherLoad && <div className="text-xs text-green-400 animate-pulse">{t.weatherLoading}</div>}
          {weather && !weatherLoad && (
            <div className="bg-green-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div><div className="text-2xl font-bold">{weather.current?.temp}°C</div><div className="text-xs text-green-300">{weatherIcon(weather.current?.code).icon} {weatherIcon(weather.current?.code).label}</div></div>
                <div className="text-right text-xs text-green-300"><div>💧 {weather.current?.humidity}%</div><div>🌬️ {weather.current?.wind} km/h</div>{weather.current?.rain > 0 && <div>🌧️ {weather.current?.rain}mm</div>}</div>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {weather.daily?.slice(0,7).map((d,i) => (
                  <div key={i} className="flex-none text-center text-[10px] text-green-200">
                    <div>{DAYS_BN[new Date(d.date).getDay()]}</div><div>{weatherIcon(d.code).icon}</div><div className="text-white font-medium">{d.maxTemp}°</div>
                    {d.rainChance > 30 && <div className="text-blue-300">{d.rainChance}%</div>}
                  </div>
                ))}
              </div>
              {weather.farmingAdvice?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-green-600">
                  <p className="text-[10px] text-green-400 font-medium mb-1">{t.weatherAdvice}</p>
                  <p className="text-[10px] text-green-200 leading-relaxed">{weather.farmingAdvice[0]}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3">
          <button onClick={() => { setMessages([{ id:Date.now(), role:'bot', text: t.welcome, tips:[], followUp:[], category:'other' }]); setSidebarOpen(false); }}
            className="w-full bg-green-600 hover:bg-green-500 text-white text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
            <span>✏️</span> {t.newChat}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-green-400 font-medium mb-2 uppercase tracking-wide">{t.recentQ}</p>
          {history.length === 0 && <p className="text-xs text-green-500 italic">{t.noHistory}</p>}
          {history.slice(0,20).map((h, i) => (
            <button key={i} onClick={() => { sendMessage(h.q); setSidebarOpen(false); }}
              className="w-full text-left text-xs text-green-200 hover:text-white hover:bg-green-700 rounded-lg px-3 py-2 mb-1 truncate transition-colors">
              💬 {h.q}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-green-700">
          <a href={AGRO_MAIN_URL}
            className="flex items-center gap-2 w-full text-xs text-green-300 hover:text-white hover:bg-green-700/60 rounded-lg px-3 py-2 mb-1 transition-colors">
            <svg className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
            {t.homeLink}
          </a>
          <button
            onClick={() => { localStorage.removeItem('agro_ai_token'); window.location.reload(); }}
            className="flex items-center gap-2 w-full text-left text-xs text-green-300 hover:text-white hover:bg-red-900/40 rounded-lg px-3 py-2 mb-2 transition-colors">
            <svg className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            {t.logout}
          </button>
          <div className="bg-green-700/50 rounded-lg p-3">
            <div className="flex justify-between text-xs text-green-300 mb-1">
              <span>{t.todayQ}</span>
              <span className={remaining <= 3 ? 'text-red-300 font-bold' : 'text-white font-bold'}>{15 - Math.min(remaining,15)}/15</span>
            </div>
            <div className="h-1.5 bg-green-900 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            {limitInfo.isBonus && <p className="text-[10px] text-yellow-300 mt-1">{t.bonusMode(remaining)}</p>}
          </div>
          <p className="text-[10px] text-green-500 text-center mt-2">© agro.com.bd</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-gradient-to-r from-green-700 to-emerald-600 text-white shadow-md z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden w-9 h-9 flex flex-col justify-center items-center gap-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <span className="w-5 h-0.5 bg-white rounded" /><span className="w-5 h-0.5 bg-white rounded" /><span className="w-5 h-0.5 bg-white rounded" />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <img src="/logo.png" alt="agro" className="h-7 w-auto brightness-0 invert hidden lg:block" />
              <div>{location && <p className="text-[10px] text-green-200">📍 {location.name}</p>}</div>
            </div>
            <div className="flex items-center gap-1">
              <a href={AGRO_MAIN_URL} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors" title="Home">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </a>
              <button onClick={() => setLang(l => l === 'bn' ? 'en' : 'bn')}
                className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2.5 h-8 text-xs font-bold text-white hover:bg-white/20 hover:border-white/50 transition-colors"
                title={lang === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>{t.langSwitch}</span>
              </button>
              <button onClick={() => { localStorage.removeItem('agro_ai_token'); window.location.reload(); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors" title="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
            <div className="text-right text-xs">
              <div className="text-green-200">{limitInfo.isBonus ? t.bonusLabel : t.qLeft}</div>
              <div className={`font-bold text-lg leading-none ${remaining <= 3 ? 'text-red-300' : ''}`}>{remaining}</div>
            </div>
          </div>
          <div className="px-4 pb-1"><div className="h-0.5 bg-white/20 rounded-full overflow-hidden"><div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} /></div></div>
          <div className="flex gap-2 px-4 pb-2">
            <button onClick={() => switchChat('agro')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${chatType==='agro' ? 'bg-white text-green-700 shadow' : 'bg-white/20 hover:bg-white/30'}`}>{t.farmingTab}</button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4 pb-36">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role==='user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'bot' ? (
                <div className="max-w-[95%] w-full flex flex-col gap-2">
                  {msg.bonusJustGiven && <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 text-xs text-yellow-800 font-medium text-center">{t.bonusGiven}</div>}
                  {msg.nearLimit && !msg.bonusJustGiven && <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 text-center">{t.nearLimit(remaining)}</div>}
                  <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${msg.limitHit ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                    {msg.category && msg.category !== 'other' && (
                      <div className="flex items-center gap-1 mb-2 text-xs text-green-700 font-medium">
                        <span>{CAT_ICON[msg.category]||'🌱'}</span><span className="capitalize">{msg.category}</span>
                        {msg.cached && <span className="ml-auto text-gray-400 text-[10px]">{t.cacheLabel}</span>}
                        {msg.fromDeviceCache && <span className="ml-auto text-blue-400 text-[10px]">{t.deviceCache}</span>}
                      </div>
                    )}
                    <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                  {msg.tips?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-green-700 mb-1">{t.tips}</p>
                      <ul className="space-y-1">{msg.tips.map((t,i) => <li key={i} className="text-xs text-green-800 flex gap-1"><span className="text-green-500 mt-0.5 flex-none">✓</span><span>{t}</span></li>)}</ul>
                    </div>
                  )}
                  {msg.loadingExtras && <div className="animate-pulse bg-gray-100 rounded-xl h-16 flex items-center justify-center"><span className="text-xs text-gray-400">{t.loadingExtras}</span></div>}
                  {!msg.loadingExtras && msg.products?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">{t.foundAt}</p>
                      <div className="flex flex-col gap-2">
                        {msg.products.map((p, i) => {
                          const db = p.dbProduct;
                          const href = db?.id ? `${AGRO_MAIN_URL}/shop/${db.id}` : `${AGRO_MAIN_URL}/shop?q=${encodeURIComponent(p.searchQuery)}`;
                          const displayName = db ? (lang === 'bn' ? (db.name_bn || db.name_en) : (db.name_en || db.name_bn)) : p.name;
                          const displayPrice = db ? (db.sale_price ?? db.price) : null;
                          const hasDiscount = db?.sale_price && db.sale_price < db.price;
                          const discountPct = hasDiscount ? Math.round((1 - db.sale_price / db.price) * 100) : 0;
                          const isNew = db?.created_at && (Date.now() - new Date(db.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000;
                          const img = db?.images?.[0];
                          return (
                            <a key={i} href={href}
                              className="flex gap-3 bg-white border border-amber-200 rounded-xl p-2 hover:bg-amber-50 transition-colors">
                              {/* Image card */}
                              <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                                {img ? (
                                  <img src={img} alt={displayName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-3xl">🌱</div>
                                )}
                                {/* Top-left badges */}
                                <div className="absolute top-1 left-1 flex flex-col gap-0.5">
                                  {isNew && <span className="bg-blue-500 text-white text-[7px] font-bold px-1 py-0.5 rounded leading-none">🆕</span>}
                                  {db?.is_featured && <span className="bg-amber-500 text-white text-[7px] font-bold px-1 py-0.5 rounded leading-none">★</span>}
                                  {db?.is_flash_sale && <span className="bg-red-500 text-white text-[7px] font-bold px-1 py-0.5 rounded leading-none">⚡</span>}
                                </div>
                                {/* Top-right trend */}
                                <div className="absolute top-1 right-1">
                                  {hasDiscount ? (
                                    <span className="bg-green-600 text-white text-[7px] font-bold px-1 py-0.5 rounded leading-none">-{discountPct}%</span>
                                  ) : db?.is_flash_sale ? (
                                    <span className="text-[10px] leading-none">🔥</span>
                                  ) : db?.is_featured ? (
                                    <span className="text-[10px] leading-none">⭐</span>
                                  ) : null}
                                </div>
                                {/* Bottom overlay */}
                                {db && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-3">
                                    <div className="flex items-center gap-0.5 text-[8px] text-yellow-300">⭐ 4.5</div>
                                    {displayPrice && <div className="text-[9px] text-white font-bold leading-tight">৳{displayPrice}</div>}
                                    <div className="text-[8px] text-white text-center font-medium truncate mt-0.5">{displayName}</div>
                                  </div>
                                )}
                              </div>
                              {/* Right: AI text */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-gray-800 leading-snug">{p.name}</div>
                                  <div className="text-xs text-gray-500 mt-1 leading-relaxed">{p.usage}</div>
                                </div>
                                <span className="text-amber-600 text-xs font-semibold mt-1">{t.viewBtn}</span>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!msg.loadingExtras && msg.services?.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-blue-700 mb-2">{t.nearbyServices} {location ? `(${location.name})` : ''}:</p>
                      <div className="flex flex-col gap-2">
                        {msg.services.slice(0,3).map((s,i) => (
                          <div key={i} className="bg-white border border-blue-100 rounded-lg px-3 py-2">
                            <div className="text-sm font-medium text-gray-800">{s.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{s.address}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <a href={`tel:${s.phone}`} className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">📞 {s.phone}</a>
                              {s.hours && <span className="text-xs text-gray-400">{s.hours}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {msg.conversionCTA && (
                    <div className="bg-green-600 rounded-xl px-4 py-3 flex flex-col gap-2">
                      <p className="text-white text-sm font-semibold">{t.readyToOrder}</p>
                      {msg.conversionCTA === 'visit_site' && <a href="https://agro.com.bd" target="_blank" rel="noreferrer" className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">{t.visitSite}</a>}
                      {msg.conversionCTA === 'whatsapp' && <a href="https://wa.me/8801XXXXXXXXX" target="_blank" rel="noreferrer" className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">{t.whatsapp}</a>}
                      {msg.conversionCTA === 'call_now' && <a href="tel:+8801XXXXXXXXX" className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">{t.callNow}</a>}
                    </div>
                  )}
                  {msg.followUp?.length > 0 && !msg.limitHit && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] text-gray-500 px-1">{t.learnMore}</p>
                      {msg.followUp.map((q,i) => (
                        <button key={i} onClick={() => { setInput(q); setTimeout(() => textRef.current?.focus(), 0); }}
                          className="text-left text-xs bg-white border border-green-200 text-green-700 px-3 py-2 rounded-xl hover:bg-green-50 transition-colors shadow-sm">↳ {q}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-[80%] bg-green-600 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 flex gap-1 items-center">
                {[0,150,300].map(d => <span key={d} className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        <div className="fixed bottom-0 right-0 left-0 lg:left-72 bg-white border-t border-gray-200 shadow-lg z-10">
          <div className="max-w-3xl mx-auto px-3 pt-2 pb-3">
            {messages.length <= 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth:'none' }}>
                {t.quickQ.map((q,i) => <button key={i} onClick={() => sendMessage(q)} className="flex-none text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-green-100">{q}</button>)}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea ref={textRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={t.placeholder}
                rows={1} className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-h-28"
                onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,112)+'px'; }} />
              <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
                className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-none">
                {loading ? '⏳' : '➤'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1">{chatType==='product' ? '🛒 পণ্য কিনুন — agro.com.bd' : '🌱 Agro Assistant — agro.com.bd'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root: Auth Gate ──
export default function Home() {
  const [view, setView] = useState(null); // null=checking | 'landing' | 'chat'

  useEffect(() => {
    async function checkAuth() {
      // 1. Grab token from URL or localStorage
      const params = new URLSearchParams(window.location.search);
      let token = params.get('token');
      if (token) {
        localStorage.setItem('agro_ai_token', token);
        // Clean the token from the URL bar
        const clean = window.location.pathname + (params.toString().replace(/token=[^&]*&?/, '').replace(/^&/, '') ? '?' + params.toString().replace(/token=[^&]*&?/, '').replace(/^&/, '') : '');
        window.history.replaceState({}, '', clean);
      } else {
        token = localStorage.getItem('agro_ai_token');
      }

      if (!token) { setView('landing'); return; }

      // 2. Verify the token with agro.com.bd
      try {
        const res = await fetch(AUTH_VERIFY_URL, {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (res.ok) {
          setView('chat');
        } else {
          localStorage.removeItem('agro_ai_token');
          setView('landing');
        }
      } catch {
        // Network/CORS error — show chat anyway so users aren't blocked
        setView('chat');
      }
    }
    checkAuth();
  }, []);

  if (view === null)        return <LoadingScreen />;
  if (view === 'landing')   return <LandingPage />;
  return <ChatApp />;
}
