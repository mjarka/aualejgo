/**
 * Buduje URL do pliku z katalogu `public/assets`.
 *
 * Sciezki do grafik i dzwiekow sa zwyklymi stringami w konfiguracji, wiec
 * Vite ich NIE przepisuje przy budowaniu. Bez tego prefiksu gra dzialalaby
 * lokalnie, ale po opublikowaniu na GitHub Pages (adres /<repo>/) przegladarka
 * szukalaby plikow pod korzeniem domeny i nic by sie nie wczytalo.
 *
 * `import.meta.env.BASE_URL` pochodzi z `base` w vite.config.ts i wynosi
 * '/' w trybie dev oraz '/aualejgo/' w zbudowanej wersji.
 */
export const assetUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
};
