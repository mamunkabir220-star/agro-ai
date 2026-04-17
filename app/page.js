'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const AGRO_QUICK   = ['ধান চাষে কোন সার দেব?', 'টমেটোতে পোকা দমন করব কিভাবে?', 'জৈব সার কিভাবে তৈরি করব?', 'মাছ চাষে পানির pH কত হওয়া উচিত?'];
const PRODUCT_QUICK = ['ধানের জন্য সেরা সার কোনটি?', 'কীটনাশক কিনতে চাই', 'সেচ পাম্প দরকার', 'বীজ কোথায় পাব?'];

const CAT_ICON = { crop:'🌾', soil:'🪱', pest:'🐛', disease:'🦠', fertilizer:'🧪', irrigation:'💧', livestock:'🐄', fishery:'🐟', weather:'⛅', equipment:'🚜', market:'💰', organic:'🌿', product:'🛒', other:'🌱' };

function getOrCreateUserId() {
  if (typeof window === 'undefined') return 'anon';
  let uid = localStorage.getItem('agro_uid');
  if (!uid) { uid = 'web_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('agro_uid', uid); }
  return uid;
}

const WELCOME = {
  agro: '🌾 আসসালামু আলাইকুম! আমি AgroBot।\n\nফসল, গাছপালা, পশু, মাছ, সার, রোগ, আবহাওয়া — যেকোনো কৃষি প্রশ্ন করুন।',
  product: '🛒 আমি AgroBot সেলস অ্যাসিস্ট্যান্ট!\n\nagro.com.bd থেকে সেরা কৃষি পণ্য খুঁজে পেতে সাহায্য করব। আপনার কী দরকার?',
};

export default function Home() {
  const [chatType,  setChatType]  = useState('agro');
  const [messages,  setMessages]  = useState([{ id: 1, role: 'bot', text: WELCOME.agro, tips: [], followUp: [], category: 'other' }]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [remaining, setRemaining] = useState(15);
  const [limitInfo, setLimitInfo] = useState({ bonusGranted: false, isBonus: false });
  const bottomRef   = useRef(null);
  const textRef     = useRef(null);

  // ── Fetch real quota from server on load & on tab switch ──
  useEffect(() => {
    const uid = getOrCreateUserId();
    fetch(`/api/status?userId=${uid}&chatType=${chatType}`)
      .then(r => r.json())
      .then(d => {
        setRemaining(d.remaining ?? 15);
        setLimitInfo({ bonusGranted: d.bonusGranted || false, isBonus: d.isBonus || false });
      })
      .catch(() => {}); // silently fail — state stays at default 15
  }, [chatType]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Switch chat type — reset messages
  function switchChat(type) {
    if (type === chatType) return;
    setChatType(type);
    setMessages([{ id: Date.now(), role: 'bot', text: WELCOME[type], tips: [], followUp: [], category: type === 'product' ? 'product' : 'other' }]);
    setInput('');
  }

  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    if (textRef.current) { textRef.current.style.height = 'auto'; }

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: q }]);
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, userId: getOrCreateUserId(), chatType }),
      });
      const data = await res.json();

      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (data.bonusGranted !== undefined) setLimitInfo({ bonusGranted: data.bonusGranted, isBonus: data.isBonus });

      // Build bot message
      const botMsg = {
        id:             Date.now() + 1,
        role:           'bot',
        text:           data.response || '🔧 কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        tips:           data.tips     || [],
        followUp:       data.followUp || [],
        category:       data.category || 'other',
        cached:         data.cached,
        bonusJustGiven: data.bonusJustGiven,
        nearLimit:      data.nearLimit,
        remainingMsg:   data.remainingMsg,
        isConverted:    data.isConverted,
        conversionCTA:  data.conversionCTA,
        limitHit:       data.limitHit,
      };

      setMessages(prev => [...prev, botMsg]);

    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', text: '🔧 নেটওয়ার্ক সমস্যা। ইন্টারনেট চেক করুন।', tips: [], followUp: [] }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, chatType]);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const quickQ = chatType === 'product' ? PRODUCT_QUICK : AGRO_QUICK;

  // Progress bar color
  const pct      = Math.round(((15 - Math.min(remaining, 15)) / 15) * 100);
  const barColor = remaining <= 3 ? 'bg-red-500' : remaining <= 7 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-green-700 to-emerald-600 text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-lg">🌾</div>
            <div>
              <h1 className="text-base font-bold leading-tight">AgroBot AI</h1>
              <p className="text-[10px] text-green-100">agro.com.bd</p>
            </div>
          </div>
          {/* Question counter */}
          <div className="text-right">
            <div className="text-[10px] text-green-200">{limitInfo.isBonus ? '⭐ বোনাস' : 'প্রশ্ন বাকি'}</div>
            <div className={`font-bold text-lg leading-none ${remaining <= 3 ? 'text-red-300' : 'text-white'}`}>{remaining}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pb-2">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} transition-all duration-500 rounded-full`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Chat type tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-2">
          <button onClick={() => switchChat('agro')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${chatType === 'agro' ? 'bg-white text-green-700' : 'bg-white/20 text-white hover:bg-white/30'}`}>
            🌱 কৃষি পরামর্শ
          </button>
          <button onClick={() => switchChat('product')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${chatType === 'product' ? 'bg-white text-green-700' : 'bg-white/20 text-white hover:bg-white/30'}`}>
            🛒 পণ্য কিনুন
          </button>
        </div>
      </header>

      {/* ── Messages ── */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 py-3 flex flex-col gap-3 pb-40">

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

            {msg.role === 'bot' ? (
              <div className="max-w-[92%] flex flex-col gap-2">

                {/* Bonus just given banner */}
                {msg.bonusJustGiven && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 text-xs text-yellow-800 font-medium text-center">
                    🎁 আপনার ১৫টি প্রশ্ন শেষ! আরও ৫টি বোনাস প্রশ্ন পেয়েছেন।
                  </div>
                )}

                {/* Near limit warning */}
                {msg.nearLimit && !msg.bonusJustGiven && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 text-center">
                    ⚠️ মাত্র {remaining}টি প্রশ্ন বাকি আজকের জন্য।
                  </div>
                )}

                {/* Main answer bubble */}
                <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${msg.limitHit ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                  {msg.category && msg.category !== 'other' && (
                    <div className="flex items-center gap-1 mb-2 text-xs text-green-700 font-medium">
                      <span>{CAT_ICON[msg.category] || '🌱'}</span>
                      <span className="capitalize">{msg.category}</span>
                      {msg.cached && <span className="ml-auto text-gray-400 text-[10px]">⚡ cached</span>}
                    </div>
                  )}
                  <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                </div>

                {/* Tips */}
                {msg.tips?.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-semibold text-green-700 mb-1">💡 টিপস:</p>
                    <ul className="space-y-1">
                      {msg.tips.map((t, i) => (
                        <li key={i} className="text-xs text-green-800 flex gap-1">
                          <span className="text-green-500 mt-0.5 flex-none">✓</span><span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Conversion CTA (product chat) */}
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
                      <a href="https://wa.me/8801XXXXXXXXX?text=AgroBot থেকে এসেছি, পণ্য কিনতে চাই" target="_blank" rel="noreferrer"
                        className="bg-white text-green-700 text-sm font-bold py-2 rounded-lg text-center">
                        💬 WhatsApp এ যোগাযোগ করুন
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
                    {msg.followUp.map((q, i) => (
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
                <span key={d} className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* ── Input area ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
        <div className="max-w-2xl mx-auto px-3 pt-2 pb-3">

          {/* Quick questions */}
          {messages.length <= 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {quickQ.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="flex-none text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-green-100 transition-colors">
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
              placeholder={chatType === 'product' ? 'কোন পণ্য দরকার জানান...' : 'আপনার কৃষি প্রশ্ন লিখুন...'}
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-h-28 overflow-y-auto"
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px'; }}
            />
            <button onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-none">
              {loading ? '⏳' : '➤'}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-1">
            {chatType === 'product' ? '🛒 পণ্য কিনুন — agro.com.bd' : '🌱 AgroBot — agro.com.bd'}
          </p>
        </div>
      </div>

    </div>
  );
}
