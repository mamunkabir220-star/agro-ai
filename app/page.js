'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: '🌾 আসসালামু আলাইকুম! আমি AgroBot, আপনার কৃষি পরামর্শক।\n\nআমাকে জিজ্ঞাসা করুন:\n• ফসল চাষ সম্পর্কে\n• সার ও কীটনাশক\n• পোকামাকড় দমন\n• আবহাওয়া ও সেচ\n• গবাদি পশু ও মাছ চাষ\n\nকিভাবে সাহায্য করতে পারি?',
      time: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState({ hourly: 10, daily: 100 });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Generate session ID
  const getSessionId = () => {
    if (typeof window === 'undefined') return 'ssr';
    let id = localStorage.getItem('agrobot_session');
    if (!id) {
      id = 'web_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('agrobot_session', id);
    }
    return id;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: input.trim(),
      time: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.text,
          userId: getSessionId(),
          platform: 'web'
        })
      });

      const data = await response.json();

      const botMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.response || 'দুঃখিত, একটি সমস্যা হয়েছে।',
        time: new Date(),
        cached: data.cached,
        isAgro: data.isAgro
      };

      setMessages(prev => [...prev, botMessage]);
      
      if (data.remaining) {
        setRemaining(data.remaining);
      }

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: '🔧 দুঃখিত, সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        time: new Date()
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Quick questions
  const quickQuestions = [
    'ধান চাষে কোন সার ব্যবহার করব?',
    'টমেটোতে পোকা দমন করব কিভাবে?',
    'জৈব সার কিভাবে তৈরি করব?',
    'মাছ চাষে পানির pH কত হওয়া উচিত?'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="gradient-bg text-white py-4 px-6 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl">
              🌾
            </div>
            <div>
              <h1 className="text-xl font-bold">AgroBot AI</h1>
              <p className="text-sm text-green-100">আপনার কৃষি পরামর্শক</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-green-100">আজকের প্রশ্ন বাকি</div>
            <div className="font-bold">{remaining.daily} টি</div>
          </div>
        </div>
      </header>

      {/* Chat Container */}
      <main className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          
          {/* Messages Area */}
          <div className="h-[60vh] overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-bubble flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.sender === 'user'
                      ? 'bg-green-600 text-white rounded-br-md'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <div className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-green-200' : 'text-gray-400'}`}>
                    {msg.time.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
                    {msg.cached && ' • ⚡ ক্যাশড'}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="typing-dot w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="typing-dot w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="typing-dot w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 2 && (
            <div className="px-4 py-3 bg-green-50 border-t border-green-100">
              <p className="text-sm text-green-700 mb-2">🎯 দ্রুত প্রশ্ন করুন:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-sm bg-white border border-green-200 text-green-700 px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="আপনার কৃষি সম্পর্কিত প্রশ্ন লিখুন..."
                className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                rows={1}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <span>পাঠান</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              AgroBot শুধুমাত্র কৃষি সম্পর্কিত প্রশ্নের উত্তর দেয় 🌱
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-6 text-sm text-gray-500">
          <p>Powered by <span className="text-green-600 font-medium">agro.com.bd</span></p>
        </footer>
      </main>
    </div>
  );
}
