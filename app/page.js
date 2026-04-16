'use client';
import { useState, useRef, useEffect } from 'react';

const QUICK_QUESTIONS = [
  'ধান চাষে কোন সার ব্যবহার করব?',
  'টমেটোতে পোকা দমন করব কিভাবে?',
  'জৈব সার কিভাবে তৈরি করব?',
  'মাছ চাষে পানির pH কত হওয়া উচিত?',
];

const CATEGORY_ICONS = {
  crop:       '🌾', soil:       '🪱', pest:       '🐛',
  disease:    '🦠', fertilizer: '🧪', irrigation: '💧',
  livestock:  '🐄', fishery:    '🐟', weather:    '⛅',
  equipment:  '🚜', market:     '💰', organic:    '🌿',
  other:      '🌱', 'non-agro': '❌',
};

export default function Home() {
  const [messages, setMessages]   = useState([{
    id: 1, role: 'bot',
    text: '🌾 আসসালামু আলাইকুম! আমি AgroBot, আপনার কৃষি পরামর্শক।\n\nযেকোনো কৃষি প্রশ্ন করুন — ফসল, গাছ, পশু, মাছ, সার, রোগ, আবহাওয়া — সব বিষয়ে সাহায্য করব।\n\nHow can I help you today?',
    tips: [], followUp: [], category: 'other',
  }]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [remaining, setRemaining] = useState({ hourly: 10, daily: 100 });
  const bottomRef                 = useRef(null);
  const textareaRef               = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, userId: getOrCreateUserId() }),
      });
      const data = await res.json();

      if (data.remaining) setRemaining(data.remaining);

      setMessages(prev => [...prev, {
        id:       Date.now() + 1,
        role:     'bot',
        text:     data.response || '🔧 কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        tips:     data.tips     || [],
        followUp: data.followUp || [],
        category: data.category || 'other',
        cached:   data.cached,
        isAgro:   data.isAgro,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'bot',
        text: '🔧 নেটওয়ার্ক সমস্যা। ইন্টারনেট চেক করে আবার চেষ্টা করুন।',
        tips: [], followUp: [], category: 'other',
      }]);
    } finally {
      setLoading(false);
    }
  }

  function getOrCreateUserId() {
    if (typeof window === 'undefined') return 'anon';
    let uid = localStorage.getItem('agro_uid');
    if (!uid) { uid = 'web_' + Math.random().toString(36).slice(2); localStorage.setItem('agro_uid', uid); }
    return uid;
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col">

      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-emerald-600 text-white py-3 px-4 shadow-lg sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">🌾</div>
            <div>
              <h1 className="text-lg font-bold leading-tight">AgroBot AI</h1>
              <p className="text-xs text-green-100">আপনার কৃষি পরামর্শক</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-green-200">আজকের প্রশ্ন বাকি</div>
            <div className="font-bold text-base">{remaining.daily} টি</div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 py-4 flex flex-col gap-3 pb-36">

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'bot' ? (
              <div className="max-w-[92%] flex flex-col gap-2">
                {/* Main bubble */}
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
                  {msg.category && msg.category !== 'other' && msg.isAgro !== false && (
                    <div className="flex items-center gap-1 mb-2 text-xs text-green-700 font-medium">
                      <span>{CATEGORY_ICONS[msg.category] || '🌱'}</span>
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
                      {msg.tips.map((tip, i) => (
                        <li key={i} className="text-xs text-green-800 flex gap-1">
                          <span className="text-green-500 mt-0.5">✓</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Follow-up questions */}
                {msg.followUp?.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-gray-500 px-1">আরও জানতে চান?</p>
                    {msg.followUp.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        className="text-left text-xs bg-white border border-green-200 text-green-700 px-3 py-2 rounded-xl hover:bg-green-50 active:bg-green-100 transition-colors shadow-sm"
                      >
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
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-3 py-2">

          {/* Quick questions (only at start) */}
          {messages.length <= 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="flex-none text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-green-100 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="আপনার যেকোনো কৃষি প্রশ্ন লিখুন..."
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent max-h-28 overflow-y-auto"
              style={{lineHeight:'1.4'}}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-none"
            >
              {loading ? '...' : '➤'}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1">
            AgroBot — Powered by agro.com.bd 🌱
          </p>
        </div>
      </div>

    </div>
  );
}
