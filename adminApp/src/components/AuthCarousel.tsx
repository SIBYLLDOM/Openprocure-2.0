import { useEffect, useState } from 'react';

const IMAGES = [
  '/images/meril-campus-login.webp',
  '/images/meril-campus-signup.jpg',
  '/images/meril-campus-3.jpg'
];

const SLIDE_MS = 3000;

interface AuthCarouselProps {
  badge: string;
  title: string;
  subtitle: string;
}

// Shared photo panel for Login/Signup — same fixed width and slideshow on
// both pages so switching between them never reflows the layout. Auto-
// advances every 3s with a crossfade; dots are also clickable.
export function AuthCarousel({ badge, title, subtitle }: AuthCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setIndex((i) => (i + 1) % IMAGES.length), SLIDE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hidden lg:block relative lg:w-[70%] flex-shrink-0 overflow-hidden">
      {IMAGES.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
          style={{ backgroundImage: `url('${src}')`, opacity: i === index ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(180deg, rgba(6,15,29,0) 40%, rgba(6,15,29,0.55) 80%, rgba(6,15,29,0.8) 100%)' }} />
      <div className="absolute top-8 left-8 inline-flex items-center gap-2 bg-black/30 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
        {badge}
      </div>
      <div className="absolute bottom-12 left-8 right-8 text-white">
        <h2 className="text-3xl font-bold leading-snug mb-3 max-w-md">{title}</h2>
        <p className="text-white/70 text-sm max-w-md mb-6">{subtitle}</p>
        <div className="flex gap-1.5">
          {IMAGES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1 rounded-full transition-all ${i === index ? 'w-8 bg-white' : 'w-4 bg-white/40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
