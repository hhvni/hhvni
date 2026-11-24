'use client';
import { InitialsAvatar, PRESET_PREFIX, PresetAvatar, presetOf } from './avatars';
/** Composants d'interface de base (boutons, champs, panneaux, avatar…). */
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, forwardRef, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'gold' | 'primary' | 'ghost' | 'danger' | 'subtle' | 'success';
const VARIANTS: Record<Variant, string> = {
  gold: 'bg-gradient-to-b from-gold-300 via-gold-400 to-gold-600 text-night-950 shadow-[0_6px_20px_-6px_rgba(236,201,119,0.6)] hover:brightness-110',
  primary: 'bg-gradient-to-b from-[#3a7bf0] to-[#2559c9] text-white shadow-[0_6px_20px_-8px_rgba(79,143,247,0.7)] hover:brightness-110',
  success: 'bg-gradient-to-b from-[#3ccf8e] to-[#1f9a63] text-night-950 hover:brightness-110',
  danger: 'bg-gradient-to-b from-[#e8616c] to-[#b83440] text-white hover:brightness-110',
  ghost: 'bg-white/5 text-ink ring-1 ring-white/10 hover:bg-white/10',
  subtle: 'bg-transparent text-muted hover:text-ink hover:bg-white/5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }>(
  function Button({ variant = 'ghost', size = 'md', loading, className, children, disabled, ...rest }, ref) {
    const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45',
          VARIANTS[variant], sizes[size], className,
        )}
        {...rest}
      >
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(
  function Input({ label, hint, className, id, ...rest }, ref) {
    const inputId = id ?? rest.name;
    return (
      <label className="block" htmlFor={inputId}>
        {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cx(
            'h-11 w-full rounded-xl border border-white/10 bg-night-950/60 px-3.5 text-sm text-ink placeholder:text-faint outline-none transition focus:border-gold-400/60 focus:ring-2 focus:ring-gold-400/20',
            className,
          )}
          {...rest}
        />
        {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      </label>
    );
  },
);

export function Select({ label, children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>}
      <select
        className={cx('h-11 w-full rounded-xl border border-white/10 bg-night-950/60 px-3 text-sm text-ink outline-none focus:border-gold-400/60', className)}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-1.5 text-left">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-gold-500' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('panel p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-gold-400">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Avatar({ name, url, size = 40, className, ring }: { name: string; url?: string | null; size?: number; className?: string; ring?: string }) {
  const preset = presetOf(url);
  const photo = url && !preset && !url.startsWith(PRESET_PREFIX) ? url : null;
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-night-800', className)}
      style={{ width: size, height: size, boxShadow: ring }}
      role="img"
      aria-label={name}
    >
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} /> : preset ? <PresetAvatar preset={preset} /> : <InitialsAvatar name={name} />}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue'; className?: string }) {
  const tones = {
    neutral: 'bg-white/8 text-muted ring-white/10',
    gold: 'bg-gold-400/12 text-gold-300 ring-gold-400/30',
    green: 'bg-success/12 text-success ring-success/30',
    red: 'bg-danger/12 text-danger ring-danger/30',
    blue: 'bg-info/12 text-info ring-info/30',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', tones[tone], className)}>{children}</span>;
}

export function OnlineDot({ online }: { online: boolean }) {
  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full ring-2 ring-night-900', online ? 'bg-success' : 'bg-faint')} aria-label={online ? 'en ligne' : 'hors ligne'} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx('panel max-h-[92vh] w-full overflow-y-auto rounded-b-none bg-night-850/95 p-6 scroll-thin sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink" aria-label="Fermer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-xl bg-night-950/60 p-1 ring-1 ring-white/8', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx('relative rounded-lg px-3 py-1.5 text-xs font-semibold transition', value === it.value ? 'text-night-950' : 'text-muted hover:text-ink')}
        >
          {value === it.value && <motion.span layoutId={`tab-${items.map((i) => i.value).join()}`} className="absolute inset-0 rounded-lg bg-gold-400" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
      {icon && <div className="text-2xl opacity-70">{icon}</div>}
      {children}
    </div>
  );
}

// ─── Notifications (toasts) ───

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
  action?: { label: string; onClick: () => void };
}
const ToastCtx = createContext<(text: string, tone?: Toast['tone'], action?: Toast['action']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className={cx(
                'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-2xl ring-1 backdrop-blur-md',
                t.tone === 'error' ? 'bg-[#2a1116]/95 text-[#ffc9ce] ring-danger/40' : t.tone === 'success' ? 'bg-[#0f2a1f]/95 text-[#bff3da] ring-success/40' : 'bg-night-800/95 text-ink ring-white/10',
              )}
            >
              <span>{t.text}</span>
              {t.action && (
                <button className="rounded-lg bg-gold-400 px-2.5 py-1 text-xs font-bold text-night-950" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gold' | 'green' | 'red' }) {
  return (
    <div className="rounded-xl bg-night-950/40 p-3.5 ring-1 ring-white/6">
      <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className={cx('mt-1 text-xl font-semibold tabular', tone === 'gold' && 'text-gold-300', tone === 'green' && 'text-success', tone === 'red' && 'text-danger')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
