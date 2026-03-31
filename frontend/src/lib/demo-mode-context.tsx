"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api"; // Ensure api is imported so we can attach auth token if needed

interface DemoModeContextType {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => Promise<void>;
  isLoading: boolean;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoModeState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial state from backend
  useEffect(() => {
    async function fetchState() {
      try {
        const res = await api.getDemoMode();
        setIsDemoModeState(res.demoMode);
      } catch (err) {
        console.error("Failed to fetch demo mode state:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchState();
  }, []);

  const setDemoMode = async (enabled: boolean) => {
    setIsDemoModeState(enabled); // Optimistic UI update
    
    try {
      const res = await api.setDemoMode(enabled);
      // Backend validates it
      setIsDemoModeState(res.demoMode);
    } catch (err) {
      console.error("Failed to update demo mode:", err);
      setIsDemoModeState(!enabled); // Revert on failure
    }
  };


  return (
    <DemoModeContext.Provider value={{ isDemoMode, setDemoMode, isLoading }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error("useDemoMode must be used within a DemoModeProvider");
  }
  return context;
}
