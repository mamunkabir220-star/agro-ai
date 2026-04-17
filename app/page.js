'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── Constants ──
const AGRO_QUICK    = ['ধান চাষে কোন সার দেব?','টমেটোতে পোকা দমন করব কিভাবে?','জৈব সার কিভাবে তৈরি করব?','মাছ চাষে পানির pH কত হওয়া উচিত?'];
const PRODUCT_QUICK = ['হাইব্রিড বীজ কোথায় পাব?','ভালো কীটনাশক কোনটি?','সেচ পাম্প কিনতে চাই','মুরগির ভালো খাবার কোনটি?'];

const CATEGORY_ICON = { crop:'🌾',soil:'🪱',pest:'🐛',disease:'🦠',fertilizer:'🧪',irrigation:'💧',livestock:'🐄',fishery:'🐟',weather:'⛅',equipment:'🚜',market:'💰',organic:'🌿',product:'🛒',other:'🌱' };

function getOrCreateUserId() {
  if (typeof window === 'undefined') return 'anon';
  let uid = localStorage.getItem('agro_uid');
  if (!uid) { uid = 'web_' + Math.random().toString(36).slice(2,11); localStorage.setItem('agro_uid', uid); }
  return uid;
}

// ── Limit bar ──
function LimitBar({ used, limit, isBonus, bonusGranted, chatType }) {
  const total   = bonusGranted ? limit + 5 : limit;
  const pct     = Math.min(100, (used / total) * 100);
  const left    = total - used;
  const danger  = left <= 3;
  const warning = left <= 7 && left > 3;

  return (
    <div className="px-4 py-1.5 bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between text-[10px] mb-1">
          <span className={`font-medium ${danger?'text-red-600':warning?'text-amber-600':'text-gray-500'}`}>
            {chatType==='product'?'পণ্য জিজ্ঞাসা':'কৃষি প্রশ্ন'}: {used}/{total} ব্যবহৃত
          </span>
          <span className={`font-semibold ${danger?'text-red-600':warning?'text-amber-600':'text-green-700'}`}>
            {left} টি বাকি {isBonus?'(বোনাস)':''}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${danger?'bg-red-500':warning?'bg-amber-500':'bg-green-500'}`}
            style={{width:`${pct}%`}}
          />
        </div>
      </div>
    </div>
  );
}

// ── Single message bubble ──
function Message({ msg, onFollowUp }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-green-600 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] flex flex-col gap-2">

        {/* Main bubble */}
        <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${msg.isSystem?'bg-amber-50 border-amber-200':'bg-white border-gray-100'}`}>
          {msg.category && msg.category !== 'other' && (
            <div className="flex items-center gap-1 mb-1.5 text-xs font-medium text-green-700">
              <span>{CATEGORY_ICON[msg.category]||'🌱'}</span>
              <span className="capitalize">{msg.category}</span>
              {msg.cached && <span className="ml-auto text-gray-400 text-[10px]">⚡ cached</span>}
            </div>
          )}
          <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
        </div>

        {/* Suggested products (product chat) */}
        {msg.suggestedProducts?.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-green-700 mb-1">🛒 প্রস্তাবিত পণ্য:</p>
            <div className="flex flex-wrap gap-1">
              {msg.suggestedProducts.map((p,i) => (
                <span key={i} className="text-xs bg-white border border-green-300 text-green-800 px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Tips */}
        {msg.tips?.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-blue-700 mb-1">💡 টিপস:</p>
            <ul className="space-y-0.5">
              {msg.tips.map((t,i) => (
                <li key={i} className="text-xs text-blue-800 flex gap-1"><span className="text-blue-400 mt-0.5">✓</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA button (product chat) */}
        {msg.cta && (
          <a href="https://agro.com.bd" target="_blank" rel="noreferrer"
            className="block text-center text-sm font-semibold bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl shadow transition-colors">
            {msg.cta}
          </a>
        )}

        {/* Conversion success */}
        {msg.isConverted && (
          <div className="bg-green-100 border border-green-300 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <p className="text-xs text-green-800 font-medium">ধন্যবাদ! আমাদের এজেন্ট শীঘ্রই আপনার সাথে যোগাযোগ করবে।</p>
          </div>
        )}

        {/* Follow-up questions */}
        {msg.followUp?.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-gray-400 px-1">আরও জানতে:</p>
            {msg.followUp.map((q,i) => (
              <button key={i} onClick={() => onFollowUp(q)}
                className="text-left text-xs bg-white border border-green-200 text-green-700 px-3 py-2 rounded-xl hover:bg-green-50 transition-colors shadow-sm">
                ↩ {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──
export default function Home() {
  const [chatType, setChatType]     = useState('agro');
  const [messages, setMessages]     = useState({ agro: [], product: [] });
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [limitInfo, setLimitInfo]   = useState({ agro: { used:0,limit:15,remaining:15 }, product: { used:0,limit:15,remaining:15 } });
  const bottomRef                   = useRef(null);
  const textareaRef                 = useRef(null);

  const currentMessages = messages[chatType];
  const currentLimit    = limitInfo[chatType];

  // Welcome messages
  useEffect(() => {
    setMessages({
      agro: [{
        id: 'welcome-agro', role: 'bot', category: 'other',
        text: '🌾 আসসালামু আলাইকুম! আমি AgroBot।\n\nযেকোনো কৃষি প্রশ্ন করুন — ফসল, গাছপালা, পশু, মাছ, সার, রোগ, আবহাওয়া। আপনার কাছে ২৪ ঘণ্টায় ১৫টি প্রশ্ন আছে।',
        tips: [], followUp: [],
      }],
      product: [{
        id: 'welcome-product', role: 'bot', category: 'product',
        text: '🛒 স্বাগতম! আমি AgriSales।\n\nagro.com.bd এর যেকোনো পণ্য সম্পর্কে জিজ্ঞাসা করুন — বীজ, সার, কীটনাশক, যন্ত্রপাতি, পশু খাদ্য। আপনার ১৫টি প্রশ্নের মধ্যে সেরা পণ্যটি খুঁজে পেতে সাহায্য করব।',
        tips: [], followUp: [],
      }],
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, loading]);

  const sendMessage = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    const userMsg = { id: Date.now(), role: 'user', text: q };
    setMessages(prev => ({ ...prev, [chatType]: [...prev[chatType], userMsg] }));
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, userId: getOrCreateUserId(), chatType }),
      });
      const data = await res.json();

      // Update limit info
      const used = (currentLimit.used || 0) + 1;
      setLimitInfo(prev => ({
        ...prev,
        [chatType]: {
          used,
          limit:        data.limit        || 15,
          remaining:    data.remaining    ?? Math.max(0, 15 - used),
          bonusGranted: data.bonusGranted || false,
          isBonus:      data.isBonus      || false,
        },
      }));

      // Bonus just granted — show system message
      if (data.bonusJustGiven) {
        const bonusMsg = {
          id: Date.now() + 0.5, role: 'bot', isSystem: true, category: 'other',
          text: '🎁 আপনার প্রশ্নের সীমা শেষ হয়েছে, কিন্তু আপনার সমস্যা সমাধান হয়নি মনে হচ্ছে। তাই আমরা আপনাকে বোনাস হিসেবে আরও ৫টি প্রশ্ন দিচ্ছি!\n\n🎁 Your limit is reached but your query seems unresolved — here are 5 bonus questions!',
          tips: [], followUp: [],
        };
        setMessages(prev => ({ ...prev, [chatType]: [...prev[chatType], bonusMsg] }));
      }

      const botMsg = {
        id:                Date.now() + 1,
        role:              'bot',
        text:              data.response || '🔧 কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        tips:              data.tips              || [],
        followUp:          data.followUp          || [],
        suggestedProducts: data.suggestedProducts || [],
        cta:               data.cta               || '',
        category:          data.category          || 'other',
        cached:            data.cached,
        isConverted:       data.isConverted       || false,
      };
      setMessages(prev => ({ ...prev, [chatType]: [...prev[chatType], botMsg] }));

    } catch {
      setMessages(prev => ({
        ...prev,
        [chatType]: [...prev[chatType], {
          id: Date.now()+1, role:'bot', category:'other',
          text:'🔧 নেটওয়ার্ক সমস্যা। ইন্টারনেট চেক করে আবার চেষ্টা করুন।',
          tips:[], followUp:[],
        }],
      }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, chatType, currentLimit]);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const quickQuestions = chatType === 'product' ? PRODUCT_QUICK : AGRO_QUICK;
  const showQuickQ     = currentMessages.length <= 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col">

      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-emerald-600 text-white py-3 px-4 shadow-lg sticky top-0 z-20">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-lg">
                {chatType === 'product' ? '🛒' : '🌾'}
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">
                  {chatType === 'product' ? 'AgriSales' : 'AgroBot AI'}
                </h1>
                <p className="text-[10px] text-green-100">
                  {chatType === 'product' ? 'পণ্য পরামর্শক — agro.com.bd' : 'কৃষি পরামর্শক'}
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-green-200 text-[10px]">বাকি প্রশ্ন</div>
              <div className="font-bold text-lg leading-tight">{currentLimit.remaining ?? 15}</div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
            {['agro','product'].map(t => (
              <button key={t} onClick={() => setChatType(t)}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                  chatType===t ? 'bg-white text-green-700 shadow' : 'text-green-100 hover:bg-white/10'
                }`}>
                {t==='agro' ? '🌾 কৃষি পরামর্শ' : '🛒 পণ্য জিজ্ঞাসা'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Limit bar */}
      <LimitBar
        used={currentLimit.used||0}
        limit={15}
        isBonus={currentLimit.isBonus}
        bonusGranted={currentLimit.bonusGranted}
        chatType={chatType}
      />

      {/* Messages */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 py-4 flex flex-col gap-3 pb-40">
        {currentMessages.map(msg => (
          <Message key={msg.id} msg={msg} onFollowUp={sendMessage} />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 flex gap-1 items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </main>

      {/* Input area */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
        <div className="max-w-2xl mx-auto px-3 pt-2 pb-3">

          {showQuickQ && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-1" style={{scrollbarWidth:'none'}}>
              {quickQuestions.map((q,i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="flex-none text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-green-100 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea ref={textareaRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={chatType==='product'
                ? 'পণ্য সম্পর্কে জিজ্ঞাসা করুন...'
                : 'কৃষি প্রশ্ন লিখুন...'}
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-h-28"
              onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,112)+'px'; }}
            />
            <button onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-none">
              {loading ? '...' : '➤'}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-1">
            {chatType==='product'
              ? '🛒 agro.com.bd — আপনার কৃষি পণ্যের বিশ্বস্ত উৎস'
              : '🌱 AgroBot — Powered by agro.com.bd'}
          </p>
        </div>
      </div>

    </div>
  );
}
