import { createMiddleware } from '@tanstack/react-start';

// Attaches the local JWT token (from localStorage) to serverFn RPC headers
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    let token: string | null = null;
    try {
      if (typeof window !== "undefined") {
        token = localStorage.getItem("nivaas_token");
      }
    } catch {
      // ignore
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
