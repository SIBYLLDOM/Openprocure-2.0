// Where a logged-in partner lands: the Setup Profile wizard on their first
// login (see SETUP_PROFILE.txt), then their own OEM/Reseller portal once
// submitted — personalized with their name and id (see App.tsx's
// /oem/:name/:id and /reseller/:name/:id routes, which verify the URL
// actually matches the logged-in user).
export const getDefaultRoute = (user: { id?: number; name?: string; partnerType?: string | null; profileSubmitted?: boolean } | null): string => {
  if (!user?.id || !user?.partnerType) return '/login';
  if (!user.profileSubmitted) return '/setup-profile';
  return `/${user.partnerType}/${encodeURIComponent(user.name ?? '')}/${user.id}`;
};
