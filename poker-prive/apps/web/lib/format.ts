export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (a >= 10_000) return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return fmt(n);
}

export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const SUITS: Record<string, { symbol: string; color: string; name: string }> = {
  s: { symbol: '♠', color: '#111827', name: 'pique' },
  h: { symbol: '♥', color: '#d42a3c', name: 'cœur' },
  d: { symbol: '♦', color: '#1d6fe0', name: 'carreau' },
  c: { symbol: '♣', color: '#0f7a43', name: 'trèfle' },
};
export const rankLabel = (r: string) => (r === 'T' ? '10' : r);
