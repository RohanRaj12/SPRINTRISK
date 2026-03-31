"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: "agent" | "user";
  content: string;
  isStreaming?: boolean;
}

export function AgentPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "agent",
      content: "Hello! I'm Sprint Guardian. I can analyze Jira tickets, check GitHub PRs, and notify the team on Slack. What would you like to review today?",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const streamText = async (text: string, msgId: string) => {
    setMessages((prev) => 
      prev.map((m) => m.id === msgId ? { ...m, content: "", isStreaming: true } : m)
    );

    let currentText = "";
    const words = text.split(" ");
    
    for (let i = 0; i < words.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 40));
      currentText += (i === 0 ? "" : " ") + words[i];
      
      setMessages((prev) => 
        prev.map((m) => m.id === msgId ? { ...m, content: currentText } : m)
      );
    }

    setMessages((prev) => 
      prev.map((m) => m.id === msgId ? { ...m, isStreaming: false } : m)
    );
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsgId = Date.now().toString();
    const agentMsgId = (Date.now() + 1).toString();
    const userMessage = input;
    
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: userMessage }]);
    setInput("");
    
    // Add blank streaming agent message
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: "agent", content: "", isStreaming: true },
    ]);
    
    try {
      const response = await api.sendMessage(userMessage);
      streamText(response.reply, agentMsgId);
    } catch (err: any) {
      streamText("Sorry, I encountered an error: " + err.message, agentMsgId);
    }
  };

  return (
    <aside className="w-[400px] border-l border-border/50 bg-background/95 flex flex-col h-full shadow-2xl z-10">
      <div className="flex items-center gap-2 h-14 border-b border-border/50 px-4 shrink-0 bg-background">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-medium text-sm">Sprint Guardian AI</h2>
      </div>

      <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="space-y-6 pb-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 text-sm ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md ${
                    msg.role === "user"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div
                  className={`flex flex-col gap-1 min-w-[120px] max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-card border border-border/50 shadow-sm"
                  }`}
                >
                  <span className="leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && (
                      <motion.span 
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-block w-1.5 h-3.5 ml-1 bg-primary/70 align-middle"
                      />
                    )}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="p-4 border-t border-border/50 bg-background">
        <div className="relative flex items-end overflow-hidden rounded-xl border border-input bg-card shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about the sprint..."
            className="min-h-[44px] max-h-32 w-full resize-none border-0 bg-transparent py-3 pl-4 pr-12 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md"
          >
            <Send size={14} className="ml-0.5" />
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          AI can make mistakes. Verify critical actions.
        </p>
      </div>
    </aside>
  );
}
