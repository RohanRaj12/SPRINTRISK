"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Sparkles, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: "agent" | "user";
  content: string;
  isStreaming?: boolean;
}

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "agent",
      content:
        "Hi! I'm Sprint Guardian AI. Ask me about sprint health, stale tickets, PR reviews, or run an audit.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const streamText = async (text: string, msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, content: "", isStreaming: true } : m
      )
    );
    let currentText = "";
    const words = text.split(" ");
    for (let i = 0; i < words.length; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, 20 + Math.random() * 30)
      );
      currentText += (i === 0 ? "" : " ") + words[i];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: currentText } : m
        )
      );
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, isStreaming: false } : m
      )
    );
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsgId = Date.now().toString();
    const agentMsgId = (Date.now() + 1).toString();
    const userMessage = input;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: userMessage },
    ]);
    setInput("");

    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: "agent", content: "", isStreaming: true },
    ]);

    try {
      const response = await api.sendMessage(userMessage);
      streamText(response.reply, agentMsgId);
    } catch (err: any) {
      streamText(
        "Sorry, I encountered an error: " + (err.message || "Unknown error"),
        agentMsgId
      );
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-105 transition-transform"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[560px] flex flex-col rounded-2xl border border-border/60 bg-background shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between h-12 border-b border-border/50 px-4 bg-card shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Sprint Guardian AI</h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto min-h-0">
            <div className="space-y-4 pb-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 text-sm ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      msg.role === "user"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User size={14} />
                    ) : (
                      <Bot size={14} />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border/50"
                    }`}
                  >
                    <span className="leading-relaxed whitespace-pre-wrap text-[13px]">
                      {msg.content}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-3 ml-0.5 bg-primary/70 animate-pulse" />
                      )}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border/50 bg-card">
            <div className="relative flex items-end rounded-xl border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
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
                className="min-h-[40px] max-h-24 w-full resize-none border-0 bg-transparent py-2.5 pl-3 pr-11 text-sm shadow-none focus-visible:ring-0"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                className="absolute right-1.5 bottom-1.5 h-7 w-7 rounded-lg"
              >
                <Send size={13} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
