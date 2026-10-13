// Shared types for the Pages Functions. The API Worker is reached through a service binding,
// so its secrets stay server side and the browser only ever talks to this site.
export interface PagesEnv {
  API: Fetcher;
  ASSETS: Fetcher;
}
