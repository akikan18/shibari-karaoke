import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ToastProps = {
  messages: { id: string; text: string }[];
  onRemove: (id: string) => void;
};

export const Toast = ({ messages, onRemove }: ToastProps) => {
  return (
    <div className="fixed bottom-24 left-0 w-full flex flex-col items-center pointer-events-none z-[200] gap-2 px-4">
      <AnimatePresence>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            layout
            className="bg-black/80 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 min-w-[200px] justify-center"
          >
            <span className="text-xl">🔔</span>
            <span className="text-xs font-bold tracking-widest whitespace-pre-wrap text-center">{msg.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export const useToast = () => {
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);

  const addToast = (text: string) => {
    const id = Date.now().toString() + Math.random();
    setMessages((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return { messages, addToast, removeToast };
};