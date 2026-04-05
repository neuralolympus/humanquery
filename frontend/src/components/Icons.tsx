import type { SVGProps } from 'react';

function iconClass(className?: string) {
  return ['inline-block shrink-0', className].filter(Boolean).join(' ');
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...rest}>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...rest}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

export function IconHistory(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlay(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

export function IconKeyboard(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden {...rest}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" strokeLinecap="round" />
    </svg>
  );
}

export function IconTable(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg className={iconClass(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" strokeLinecap="round" />
    </svg>
  );
}
