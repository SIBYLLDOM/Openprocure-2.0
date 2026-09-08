interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = 'h-4 w-full rounded-md' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 ${className}`} />;
}
