import { authClient, authEnabled } from "./client";
import { useGuest } from "@/lib/guest";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
  isAdmin: boolean;
  isGuest: boolean;
};

export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
  isAdmin: true,
  isGuest: false,
};

export const GUEST_USER: AppUser = {
  id: "guest",
  displayName: "Guest",
  primaryEmail: null,
  profileImageUrl: null,
  isDevFallback: false,
  isAdmin: false,
  isGuest: true,
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

export function useCurrentUserState(): CurrentUserState {
  const guest = useGuest((s) => s.on);
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
  const { data, isPending } = authClient.useSession();
  if (guest) return { user: GUEST_USER, isPending: false };
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
          isDevFallback: false,
          isAdmin: (user as typeof user & { isAdmin?: boolean }).isAdmin === true,
          isGuest: false,
        }
      : null,
    isPending,
  };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
