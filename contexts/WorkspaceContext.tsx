"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listCurrentUserWorkspaceAccess,
  type MembershipRow,
  type WorkspaceAccess,
  type WorkspaceRow,
} from "@/lib/services/database-service";

interface WorkspaceContextValue {
  workspaces: WorkspaceRow[];
  activeWorkspace: WorkspaceRow | null;
  activeMembership: MembershipRow | null;
  loading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_PREFIX = "postflow.active-workspace";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState<WorkspaceAccess[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setAccess([]);
      setActiveWorkspaceId(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextAccess = await listCurrentUserWorkspaceAccess();
      const storageKey = `${STORAGE_PREFIX}:${user.id}`;
      const storedId = window.localStorage.getItem(storageKey);
      const validStoredId = nextAccess.some(
        ({ workspace }) => workspace.id === storedId,
      )
        ? storedId
        : null;
      if (storedId && !validStoredId) window.localStorage.removeItem(storageKey);

      setAccess(nextAccess);
      setActiveWorkspaceId((current) => {
        if (nextAccess.some(({ workspace }) => workspace.id === current)) {
          return current;
        }
        return validStoredId ?? nextAccess[0]?.workspace.id ?? null;
      });
    } catch {
      setAccess([]);
      setActiveWorkspaceId(null);
      setError("Your workspaces could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refreshWorkspaces();
  }, [authLoading, refreshWorkspaces]);

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      if (!user || !access.some(({ workspace }) => workspace.id === workspaceId)) {
        return;
      }
      setActiveWorkspaceId(workspaceId);
      window.localStorage.setItem(`${STORAGE_PREFIX}:${user.id}`, workspaceId);
    },
    [access, user],
  );

  const activeAccess = access.find(
    ({ workspace }) => workspace.id === activeWorkspaceId,
  );
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: access.map(({ workspace }) => workspace),
      activeWorkspace: activeAccess?.workspace ?? null,
      activeMembership: activeAccess?.membership ?? null,
      loading: authLoading || loading,
      error,
      selectWorkspace,
      refreshWorkspaces,
    }),
    [access, activeAccess, authLoading, error, loading, refreshWorkspaces, selectWorkspace],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  }
  return context;
}
