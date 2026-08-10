"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationProvider } from "@/contexts/NotificationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
