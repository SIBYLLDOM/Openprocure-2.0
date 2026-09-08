import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({
  padded = true,
  hoverable = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`card ${padded ? 'p-5' : ''} ${
        hoverable ? 'hover:shadow-md transition-shadow duration-300' : ''
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
