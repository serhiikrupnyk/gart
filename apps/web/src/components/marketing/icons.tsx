import type { SVGProps } from 'react';

/**
 * The landing's icon set: one family, one stroke weight, drawn here so the
 * page ships zero dependencies. All decorative — every icon sits beside its
 * own caption, so they are hidden from assistive technology.
 */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function BarbellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 10v4M6.5 7.5v9M17.5 7.5v9M21 10v4M6.5 12h11" />
    </Icon>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Icon>
  );
}

export function TrendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 19.5h16M5 15.5l4.5-4.5 3 3L19 7.5" />
      <path d="M15.5 7.5H19V11" />
    </Icon>
  );
}

export function FlameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5c.6 2.8-3.7 4.6-3.7 8.3a3.7 3.7 0 0 0 7.4 0c0-1.4-.6-2.5-1.4-3.6-.7-1-1.6-2.4-2.3-4.7Z" />
      <path d="M12 20.5v-2" />
    </Icon>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20.5 11.5a8 8 0 0 1-8 8H4l1.8-2.8a8 8 0 1 1 14.7-5.2Z" />
      <path d="M9 10.5h6M9 13.5h3.5" />
    </Icon>
  );
}

export function CardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 14.5h4" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function CrossIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 7l10 10M17 7L7 17" />
    </Icon>
  );
}
