import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";

/**
 * The signed-in student, or undefined when nobody is.
 *
 * Wrapped rather than called directly in two places because both need the same
 * two options and disagreeing on either is a real bug: a different `queryKey`
 * would give the gate and the header separate caches, so signing out would
 * empty one and leave the other showing a name.
 *
 * `retry: false` because a 401 here is the signed-out state, not a transient
 * failure — the default three attempts put a stall in front of every visitor
 * who has simply not signed in yet.
 *
 * `retryOnMount: false` because without it a second consumer mounting while
 * this query is in its error state refetches on mount, that refetch 401s, the
 * tree re-renders, and the mount happens again — an infinite request loop that
 * left the app stuck on its loading state and never reached the sign-in form.
 * Signing in invalidates this key explicitly, so nothing depends on the mount
 * refetch to recover.
 */
export function useCurrentUser() {
  return useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
      retryOnMount: false,
    },
  });
}
