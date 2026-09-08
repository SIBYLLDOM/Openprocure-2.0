// Backend origin, derived from whatever host the frontend itself was loaded
// from (localhost, a LAN IP, etc.) instead of a hardcoded 'localhost' — so
// the app also works when opened from another machine on the network.
// Openprocure 2.0 runs its own backend on 5002 (5001 is the original
// MerilOne backend) so both copies can run side by side without clashing.
export const API_ORIGIN = `http://${window.location.hostname}:5002`;
