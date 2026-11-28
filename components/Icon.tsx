import { ICONS } from '@/lib/art';

// Phosphor duotone icon as a CSS mask over currentColor: no innerHTML, CSP-safe (data: images are allowed).
export default function Icon({ name, className = 'size-5' }: { name: keyof typeof ICONS; className?: string }) {
  const { body, w, h } = ICONS[name];
  const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;
  return (
    <span aria-hidden className={`inline-block shrink-0 bg-current ${className}`}
      style={{ maskImage: url, WebkitMaskImage: url, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }} />
  );
}
