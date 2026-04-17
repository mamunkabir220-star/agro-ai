'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── Weather code → icon + label ──
function weatherIcon(code) {
  if (code === 0) return { icon: '☀️', label: '맑음' };
  if (code <= 3)  return { icon: '⛅', label: 'আংশিক মেঘ' };
  if (code <= 48) return { icon: '🌫️', label: 'কুয়াশা' };
  if (code <= 67) return { icon: '🌧️', label: 'বৃষ্টি' };
  if (code <= 77) return { icon: '❄️', label: 'শিলা' };
  if (code <= 82) return { icon: '🌦️', label: 'বৃষ্টি' };
  return { icon: '⛈️', label: 'ঝড়' };
}

const DAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
const CAT_ICON = { crop:'🌾', soil:'🪱', pest:'🐛', disease:'🦠', fertilizer:'🧪', irrigation:'💧', livestock:'🐄', fishery:'🐟', weather:'⛅', equipment:'🚜', market:'💰', organic:'🌿', product:'🛒', other:'🌱' };

// ── Problem → service type mapping ──
function inferServiceType(text) {
  const q = text.toLowerCase();
  if (/গরু|ছাগল|মুরগি|হাঁস|গবাদি|পশু|ভেটেরিনারি|cow|goat|chicken|livestock|vet/i.test(q)) return 'vet';
  if (/মাছ|চিংড়ি|পুকুর|fish|shrimp|pond|aqua/i.test(q)) return 'fishery';
  if (/ফল|বাগান|আম|কলা|পেঁপে|horticulture|fruit|garden/i.test(q)) return 'horticulture';
  if (/ধান|গম|সবজি|ফসল|rice|crop|vegetable/i.test(q)) return 'crop';
  return 'extension';
}

// ── Local history helpers ──
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
  agro:    '🌾 আসসালামু আলাইকুম! আমি AgroBot।\n\nফসল, গাছপালা, পশু, মাছ, সার, রোগ, আবহাওয়া — যেকোনো কৃষি প্রশ্ন করুন।',
  product: '🛒 আমি AgroBot সেলস অ্যাসিস্ট্যান্ট!\n\nagro.com.bd থেকে সেরা কৃষি পণ্য খুঁজে পেতে সাহায্য করব।',
};

const AGRO_QUICK    = ['ধান চাষে কোন সার দেব?', 'টমেটোতে পোকা দমন?', 'জৈব সার তৈরির উপায়?', 'মাছ চাষে pH কত হওয়া উচিত?'];
const PRODUCT_QUICK = ['ধানের জন্য সেরা সার?', 'কীটনাশক কিনতে চাই', 'সেচ পাম্প দরকার', 'বীজ কোথায় পাব?'];

export default function Home() {
  // Core state
  const [chatType,    setChatType]    = useState('agro');
  const [messages,    setMessages]    = useState([{ id: 1, role: 'bot', text: WELCOME.agro, tips: [], followUp: [], category: 'other' }]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [remaining,   setRemaining]   = useState(15);
  const [limitInfo,   setLimitInfo]   = useState({ bonusGranted: false, isBonus: false });

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history,     setHistory]     = useState([]);

  // Location & weather
  const [location,    setLocation]    = useState(null); // {lat, lon, name, district, division}
  const [weather,     setWeather]     = useState(null);
  const [weatherLoad, setWeatherLoad] = useState(false);

  const bottomRef = useRef(null);
  const textRef   = useRef(null);

  // ── On mount: load history, quota, request location ──
  useEffect(() => {
    setHistory(loadHistory());
    const uid = getOrCreateUserId();
    fetch(`/api/status?userId=${uid}&chatType=${chatType}`)
      .then(r => r.json())
      .then(d => { setRemaining(d.remaining ?? 15); setLimitInfo({ bonusGranted: d.bonusGranted, isBonus: d.isBonus }); })
      .catch(() => {});

    // Request GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;

        // Reverse geocode via Nominatim (client-side — works from browser)
        let locInfo = { lat, lon, name: 'আপনার এলাকা', district: 'Dhaka', division: 'Dhaka' };
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'User-Agent': 'AgroBot/1.0' } });
          const geo    = await geoRes.json();
          const addr   = geo.address || {};
          locInfo = {
            lat, lon,
            name:     addr.county || addr.state_district || addr.city || addr.town || 'আপনার এলাকা',
            district: addr.county || addr.state_district || 'Dhaka',
            division: addr.state || 'Dhaka',
          };
        } catch (_) {}

        setLocation(locInfo);

        // Fetch weather
        setWeatherLoad(true);
        fetch(`/api/weather?lat=${lat}&lon=${lon}`)
          .then(r => r.json())
          .then(d => { setWeather(d); setWeatherLoad(false); })
          .catch(() => setWeatherLoad(false));
      }, () => {
        // GPS denied — use Dhaka as default
        setLocation({ lat: 23.8, lon: 90.4, name: 'ঢাকা', district: 'Dhaka', division: 'Dhaka' });
        fetch('/api/weather?lat=23.8&lon=90.4').then(r=>r.json()).then(setWeather).catch(()=>{});
      });
    }
  }, []);

  // Re-fetch quota on tab switch
  useEffect(() => {
    const uid = getOrCreateUserId();
    fetch(`/api/status?userId=${uid}&chatType=${chatType}`)
      .then(r => r.json())
      .then(d => { setRemaining(d.remaining ?? 15); setLimitInfo({ bonusGranted: d.bonusGranted, isBonus: d.isBonus }); })
      .catch(() => {});
  }, [chatType]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Send message ──
  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    if (textRef.current) textRef.current.style.height = 'auto';

    // Check device history first
    const histMatch = searchHistory(q);
    if (histMatch) {
      setMessages(prev => [...prev,
        { id: Date.now(), role: 'user', text: q },
        { id: Date.now()+1, role: 'bot', text: histMatch.answer + '\n\n_(ডিভাইস ক্যাশ থেকে)_', tips: [], followUp: [], category: 'other', fromDeviceCache: true }
      ]);
      // Still fetch fresh answer in background silently
    }

    setMessages(prev => [...prev, { id: Date.now() + (histMatch ? 2 : 0), role: 'user', text: q }]);
    if (!histMatch) setLoading(true);

    try {
      // Parallel: chat + products + services
      const uid = getOrCreateUserId();
      const chatPromise = fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, userId: uid, chatType }),
      }).then(r => r.json());

      // Products (fire-and-forget, show after answer)
      const productPromise = chatType === 'agro' ? fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: q }),
      }).then(r => r.json()).catch(() => ({ products: [] })) : Promise.resolve({ products: [] });

      // Services (fire-and-forget)
      const serviceType = inferServiceType(q);
      const servicePromise = location ? fetch(
        `/api/services?district=${encodeURIComponent(location.district)}&division=${encodeURIComponent(location.division)}&type=${serviceType}`
      ).then(r => r.json()).catch(() => ({ services: [] })) : Promise.resolve({ services: [] });

      // Wait for main chat first
      const data = await chatPromise;
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (data.bonusGranted !== undefined) setLimitInfo({ bonusGranted: data.bonusGranted, isBonus: data.isBonus });

      // Save to device history
      if (data.success && data.response) saveHistory(q, data.response);
      setHistory(loadHistory());

      // Add main answer
      setMessages(prev => [...prev, {
        id:             Date.now() + 3,
        role:           'bot',
        text:           data.response || '🔧 কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        tips:           data.tips     || [],
        followUp:       data.followUp || [],
        category:       data.category || 'other',
        cached:         data.cached,
        bonusJustGiven: data.bonusJustGiven,
        nearLimit:      data.nearLimit,
        isConverted:    data.isConverted,
        conversionCTA:  data.conversionCTA,
        limitHit:       data.limitHit,
        loadingExtras:  true, // show skeleton for products/services
      }]);
      setLoading(false);

      // Now wait for products & services
      const [productData, serviceData] = await Promise.all([productPromise, servicePromise]);

      setMessages(prev => prev.map(m =>
        m.id === Date.now() + 3
          ? { ...m, loadingExtras: false, products: productData.products || [], services: serviceData.services || [], serviceType }
          : m
      ));

      // Fallback: update last bot message with extras
      setMessages(prev => {
        const last = [...prev].reverse().find(m => m.role === 'bot' && m.loadingExtras !== undefined);
        if (!last) return prev;
        return prev.map(m => m.id === last.id
          ? { ...m, loadingExtras: false, products: productData.products || [], services: serviceData.services || [], serviceType }
          : m
        );
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
    setMessages([{ id: Date.now(), role: 'bot', text: WELCOME[type], tips: [], followUp: [], category: type === 'product' ? 'product' : 'other' }]);
    setInput('');
  }

  const pct      = Math.round(((15 - Math.min(remaining, 15)) / 15) * 100);
  const barColor = remaining <= 3 ? 'bg-red-500' : remaining <= 7 ? 'bg-yellow-400' : 'bg-green-400';
  const quickQ   = chatType === 'product' ? PRODUCT_QUICK : AGRO_QUICK;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ══════════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════════ */}
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-72 bg-gradient-to-b from-green-800 to-green-900 text-white
        flex flex-col shadow-2xl transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar header */}
        <div className="p-4 border-b border-green-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌾</span>
              <div>
                <h1 className="font-bold text-base">AgroBot AI</h1>
                <p className="text-xs text-green-300">agro.com.bd</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-green-300 hover:text-white text-xl">✕</button>
          </div>
        </div>

        {/* Location & Weather summary */}
        <div className="p-3 border-b border-green-700">
          {location && (
            <div className="flex items-center gap-1 text-xs text-green-300 mb-2">
              <span>📍</span><span>{location.name}</span>
            </div>
          )}
          {weatherLoad && <div className="text-xs text-green-400 animate-pulse">আবহাওয়া লোড হচ্ছে...</div>}
          {weather && !weatherLoad && (
            <div className="bg-green-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-2xl font-bold">{weather.current?.temp}°C</div>
                  <div className="text-xs text-green-300">{weatherIcon(weather.current?.code).icon} {weatherIcon(weather.current?.code).label}</div>
                </div>
                <div className="text-right text-xs text-green-300">
                  <div>💧 {weather.current?.humidity}%</div>
                  <div>🌬️ {weather.current?.wind} km/h</div>
                  {weather.current?.rain > 0 && <div>🌧️ {weather.current?.rain}mm</div>}
                </div>
              </div>
              {/* 7-day mini forecast */}
              <div className="flex gap-1 overflow-x-auto">
                {weather.daily?.slice(0,7).map((d,i) => (
                  <div key={i} className="flex-none text-center text-[10px] text-green-200">
                    <div>{DAYS_BN[new Date(d.date).getDay()]}</div>
                    <div>{weatherIcon(d.code).icon}</div>
                    <div className="text-white font-medium">{d.maxTemp}°</div>
                    {d.rainChance > 30 && <div className="text-blue-300">{d.rainChance}%</div>}
                  </div>
                ))}
              </div>
              {/* Farming tips */}
              {weather.farmingAdvice?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-green-600">
                  <p className="text-[10px] text-green-400 font-medium mb-1">🌱 আবহাওয়া পরামর্শ:</p>
                  <p className="text-[10px] text-green-200 leading-relaxed">{weather.farmingAdvice[0]}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* New chat button */}
        <div className="p-3">
          <button
            onClick={() => { setMessages([{ id:Date.now(), role:'bot', text: WELCOME[chatType], tips:[], followUp:[], category:'other' }]); setSidebarOpen(false); }}
            className="w-full bg-green-600 hover:bg-green-500 text-white text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span>✏️</span> নতুন চ্যাট
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-green-400 font-medium mb-2 uppercase tracking-wide">সাম্প্রতিক প্রশ্ন</p>
          {history.length === 0 && (
            <p className="text-xs text-green-500 italic">কোনো ইতিহাস নেই</p>
          )}
          {history.slice(0,20).map((h, i) => (
            <button key={i} onClick={() => { sendMessage(h.q); setSidebarOpen(false); }}
              className="w-full text-left text-xs text-green-200 hover:text-white hover:bg-green-700 rounded-lg px-3 py-2 mb-1 truncate transition-colors">
              💬 {h.q}
            </button>
          ))}
        </div>

        {/* Bottom stats */}
        <div className="p-3 border-t border-green-700">
          <div className="bg-green-700/50 rounded-lg p-3">
            <div className="flex justify-between text-xs text-green-300 mb-1">
              <span>আজকের প্রশ্ন</span>
              <span className={remaining <= 3 ? 'text-red-300 font-bold' : 'text-white font-bold'}>
                {15 - Math.min(remaining,15)}/15
              </span>
            </div>
            <div className="h-1.5 bg-green-900 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            {limitInfo.isBonus && <p className="text-[10px] text-yellow-300 mt-1">⭐ বোনাস মোড: {remaining} প্রশ্ন বাকি</p>}
          </div>
          <p className="text-[10px] text-green-500 text-center mt-2">© agro.com.bd</p>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CHAT AREA
      ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-gradient-to-r from-green-700 to-emerald-600 text-white shadow-md z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 flex flex-col justify-center items-center gap-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <span className="w-5 h-0.5 bg-white rounded" />
              <span className="w-5 h-0.5 bg-white rounded" />
              <span className="w-5 h-0.5 bg-white rounded" />
            </button>

            <div className="flex items-center gap-2 flex-1">
              <span className="text-xl hidden lg:block">🌾</span>
              <div>
                <h1 className="text-sm font-bold leading-tight">AgroBot AI</h1>
                {location && <p className="text-[10px] text-green-200">📍 {location.name}</p>}
              </div>
            </div>

            {/* Question counter */}
            <div className="text-right text-xs">
              <div className="text-green-200">{limitInfo.isBonus ? '⭐ বোনাস' : 'প্রশ্ন বাকি'}</div>
              <div className={`font-bold text-lg leading-none ${remaining <= 3 ? 'text-red-300' : ''}`}>{remaining}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-1">
            <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Chat tabs */}
          <div className="flex gap-2 px-4 pb-2">
            <button onClick={() => switchChat('agro')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${chatType==='agro' ? 'bg-white text-green-700 shadow' : 'bg-white/20 hover:bg-white/30'}`}>
              🌱 কৃষি পরামর্শ
            </button>
            <button onClick={() => switchChat('product')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${chatType==='product' ? 'bg-white text-green-700 shadow' : 'bg-white/20 hover:bg-white/30'}`}>
              🛒 পণ্য কিনুন
            </button>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4 pb-36">

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role==='user' ? 'justify-end' : 'justify-start'}`}>

              {msg.role === 'bot' ? (
                <div className="max-w-[95%] w-full flex flex-col gap-2">

                  {/* Bonus banner */}
                  {msg.bonusJustGiven && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 text-xs text-yellow-800 font-medium text-center">
                      🎁 ১৫টি প্রশ্ন শেষ! আরও ৫টি বোনাস পেয়েছেন।
                    </div>
                  )}
                  {msg.nearLimit && !msg.bonusJustGiven && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 text-center">
                      ⚠️ মাত্র {remaining}টি প্রশ্ন বাকি।
                    </div>
                  )}

                  {/* Main answer */}
                  <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${msg.limitHit ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                    {msg.category && msg.category !== 'other' && (
                      <div className="flex items-center gap-1 mb-2 text-xs text-green-700 font-medium">
                        <span>{CAT_ICON[msg.category]||'🌱'}</span>
                        <span className="capitalize">{msg.category}</span>
                        {msg.cached && <span className="ml-auto text-gray-400 text-[10px]">⚡ ক্যাশ</span>}
                        {msg.fromDeviceCache && <span className="ml-auto text-blue-400 text-[10px]">📱 ডিভাইস</span>}
                      </div>
                    )}
                    <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>

                  {/* Tips */}
                  {msg.tips?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-green-700 mb-1">💡 টিপস:</p>
                      <ul className="space-y-1">
                        {msg.tips.map((t,i) => (
                          <li key={i} className="text-xs text-green-800 flex gap-1">
                            <span className="text-green-500 mt-0.5 flex-none">✓</span><span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Products from agro.com.bd */}
                  {msg.loadingExtras && (
                    <div className="animate-pulse bg-gray-100 rounded-xl h-16 flex items-center justify-center">
                      <span className="text-xs text-gray-400">পণ্য ও সেবা খুঁজছি...</span>
                    </div>
                  )}
                  {!msg.loadingExtras && msg.products?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">🛒 agro.com.bd এ পাওয়া যায়:</p>
                      <div className="flex flex-col gap-2">
                        {msg.products.map((p,i) => (
                          <a key={i}
                            href={`https://agro.com.bd/search?q=${encodeURIComponent(p.searchQuery)}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-50 transition-colors">
                            <div>
                              <div className="text-sm font-medium text-gray-800">{p.name}</div>
                              <div className="text-xs text-gray-500">{p.usage}</div>
                            </div>
                            <span className="text-amber-600 text-xs font-medium ml-2 flex-none">দেখুন →</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nearest govt services */}
                  {!msg.loadingExtras && msg.services?.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-blue-700 mb-2">
                        📍 কাছের সরকারি সেবা {location ? `(${location.name})` : ''}:
                      </p>
                      <div className="flex flex-col gap-2">
                        {msg.services.slice(0,3).map((s,i) => (
                          <div key={i} className="bg-white border border-blue-100 rounded-lg px-3 py-2">
                            <div className="text-sm font-medium text-gray-800">{s.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{s.address}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <a href={`tel:${s.phone}`} className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">
                                📞 {s.phone}
                              </a>
                              {s.hours && <span className="text-xs text-gray-400">{s.hours}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conversion CTA */}
                  {msg.conversionCTA && (
                    <div className="bg-green-600 rounded-xl px-4 py-3 flex flex-col gap-2">
                      <p className="text-white text-sm font-semibold">🎉 অর্ডার করতে প্রস্তুত?</p>
                      {msg.conversionCTA === 'visit_site' && (
                        <a href="https://agro.com.bd" target="_blank" rel="noreferrer"
                          className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">
                          🌐 agro.com.bd এ যান
                        </a>
                      )}
                      {msg.conversionCTA === 'whatsapp' && (
                        <a href="https://wa.me/8801XXXXXXXXX" target="_blank" rel="noreferrer"
                          className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">
                          💬 WhatsApp এ যোগাযোগ
                        </a>
                      )}
                      {msg.conversionCTA === 'call_now' && (
                        <a href="tel:+8801XXXXXXXXX"
                          className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">
                          📞 এখনই কল করুন
                        </a>
                      )}
                    </div>
                  )}

                  {/* Follow-up suggestions */}
                  {msg.followUp?.length > 0 && !msg.limitHit && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] text-gray-500 px-1">আরও জানতে:</p>
                      {msg.followUp.map((q,i) => (
                        <button key={i} onClick={() => sendMessage(q)}
                          className="text-left text-xs bg-white border border-green-200 text-green-700 px-3 py-2 rounded-xl hover:bg-green-50 transition-colors shadow-sm">
                          ↩ {q}
                        </button>
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

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 flex gap-1 items-center">
                {[0,150,300].map(d => (
                  <span key={d} className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {/* Input area */}
        <div className="fixed bottom-0 right-0 left-0 lg:left-72 bg-white border-t border-gray-200 shadow-lg z-10">
          <div className="max-w-3xl mx-auto px-3 pt-2 pb-3">
            {messages.length <= 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth:'none' }}>
                {quickQ.map((q,i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="flex-none text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-green-100">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={chatType==='product' ? 'কোন পণ্য দরকার?' : 'আপনার কৃষি প্রশ্ন লিখুন...'}
                rows={1}
                className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-h-28"
                onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,112)+'px'; }}
              />
              <button onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-none">
                {loading ? '⏳' : '➤'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-1">
              {chatType==='product' ? '🛒 পণ্য কিনুন — agro.com.bd' : '🌱 AgroBot — agro.com.bd'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
