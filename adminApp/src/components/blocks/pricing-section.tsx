import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import confetti from 'canvas-confetti';
import NumberFlow from '@number-flow/react';
import { Button } from '../ui';
import { cn } from '../../lib/utils';

export interface PricingPlan {
  // Used to build the default "Get Started" destination (/get-started/:key)
  // when `ctaHref` isn't set.
  key: string;
  // Overrides the default /get-started/:key destination — e.g. OEM/Reseller
  // send straight to /login (register from there) instead of a per-plan
  // placeholder page.
  ctaHref?: string;
  name: string;
  // Numeric monthly/yearly price for a plan with real self-serve billing
  // (animates via NumberFlow and reacts to the toggle). Omit both and set
  // staticPriceLabel instead for a negotiated/no-cost plan (e.g. "Custom
  // Pricing", "Free") that the monthly/yearly toggle shouldn't touch.
  price?: number;
  yearlyPrice?: number;
  staticPriceLabel?: string;
  period: string;
  // Short highlight shown under the price (e.g. a free-trial call-out) —
  // doesn't react to the monthly/yearly toggle, just static copy.
  priceNote?: string;
  features: string[];
  description: string;
  buttonText: string;
  isPopular: boolean;
}

interface PricingSectionProps {
  plans: PricingPlan[];
  title?: string;
  description?: string;
  className?: string;
}

// Ported from a shadcn/Next.js pricing template to this app's own stack:
// react-router instead of next/link, this app's own Button (see
// components/ui/Button.tsx) instead of shadcn's buttonVariants, and a small
// hand-rolled toggle switch instead of @radix-ui/react-switch — the app has
// no radix/cva dependency anywhere else, and /components/ui already holds a
// same-named custom Button/Badge kit that a shadcn button.tsx would collide
// with on a case-insensitive filesystem (see earlier integration notes).
// framer-motion, canvas-confetti and @number-flow/react ARE genuinely new
// capabilities (motion, confetti, animated counters) this app didn't have,
// so those three are installed for real rather than replaced.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function PricingSection({
  plans,
  title = 'Simple, Transparent Pricing',
  description = 'Choose the plan that fits your role in the Meril network — every plan includes full platform access and dedicated support.',
  className,
}: PricingSectionProps) {
  const [isMonthly, setIsMonthly] = useState(true);
  const isDesktop = useIsDesktop();
  const switchRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const handleToggle = (checked: boolean) => {
    setIsMonthly(!checked);
    if (checked && switchRef.current) {
      const rect = switchRef.current.getBoundingClientRect();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
        colors: ['#4f46e5', '#0d9488', '#f59e0b'],
        ticks: 200,
        gravity: 1.2,
        decay: 0.94,
        startVelocity: 30,
        shapes: ['circle'],
      });
    }
  };

  return (
    <section id="pricing" className={cn('relative bg-white py-16 px-4 md:py-24 overflow-hidden', className)}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-gray-900">{title}</h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">{description}</p>
        </div>

        {/* The toggle only means something for a plan with real monthly/yearly
            numeric pricing — hide it entirely when every plan is a static
            label (e.g. "₹499 / 6 months"), so there's no dead control. */}
        {plans.some((p) => !p.staticPriceLabel) && (
          <div className="flex items-center justify-center gap-3 mb-12">
            <button
              ref={switchRef}
              type="button"
              role="switch"
              aria-checked={!isMonthly}
              onClick={() => handleToggle(isMonthly)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                !isMonthly ? 'bg-primary-600' : 'bg-gray-200'
              )}
            >
              <span className={cn('pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform', !isMonthly ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className="font-semibold text-gray-700">
              Annual billing <span className="text-primary-600">(Save 20%)</span>
            </span>
          </div>
        )}

        <div className={cn('grid grid-cols-1 gap-6 items-center mx-auto', plans.length >= 3 ? 'md:grid-cols-3 max-w-5xl' : 'md:grid-cols-2 max-w-2xl')}>
          {plans.map((plan) => (
            <motion.div
              key={plan.key}
              initial={{ y: 50, opacity: 1 }}
              whileInView={
                isDesktop
                  ? { y: plan.isPopular ? -20 : 0, opacity: 1, scale: plan.isPopular ? 1 : 0.97 }
                  : {}
              }
              viewport={{ once: true }}
              transition={{ duration: 1.2, type: 'spring', stiffness: 100, damping: 30, delay: 0.3 }}
              className={cn(
                'relative rounded-2xl border-2 border-primary-500 p-6 bg-white text-center flex flex-col',
                plan.isPopular ? 'shadow-xl z-10' : 'shadow-md'
              )}
            >
              {plan.isPopular && (
                <div className="absolute top-0 right-0 bg-gradient-brand py-1 px-3 rounded-bl-xl rounded-tr-2xl flex items-center gap-1">
                  <Star className="text-white h-3.5 w-3.5 fill-current" />
                  <span className="text-white text-xs font-bold">Popular</span>
                </div>
              )}

              <div className="flex-1 flex flex-col">
                <p className="text-sm font-bold text-gray-500 tracking-wide">{plan.name}</p>

                <div className="mt-4 flex items-baseline justify-center gap-x-1.5">
                  {plan.staticPriceLabel ? (
                    <>
                      <span className="text-3xl font-bold text-gray-900">{plan.staticPriceLabel}</span>
                      <span className="text-sm font-semibold text-gray-400">/ {plan.period}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        <NumberFlow
                          value={isMonthly ? (plan.price ?? 0) : (plan.yearlyPrice ?? 0)}
                          format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                          transformTiming={{ duration: 500, easing: 'ease-out' }}
                          willChange
                        />
                      </span>
                      <span className="text-sm font-semibold text-gray-400">/ {plan.period}</span>
                    </>
                  )}
                </div>
                {plan.priceNote ? (
                  <p className="text-xs font-semibold text-primary-600 mt-1">{plan.priceNote}</p>
                ) : !plan.staticPriceLabel ? (
                  <p className="text-xs text-gray-400 mt-1">{isMonthly ? 'billed monthly' : 'billed annually'}</p>
                ) : null}

                <ul className="mt-5 gap-2 flex flex-col text-left">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <hr className="w-full my-5 border-gray-100" />

                <Button
                  variant="primary"
                  className="w-full !py-3 !text-base justify-center"
                  onClick={() => {
                    const href = plan.ctaHref ?? `/get-started/${plan.key}`;
                    // mailto:/external links aren't client-side routes — react-router's
                    // navigate() can't leave the SPA, so hand those off to the browser.
                    if (href.startsWith('mailto:') || /^https?:\/\//.test(href)) {
                      window.location.href = href;
                    } else {
                      navigate(href);
                    }
                  }}
                >
                  {plan.buttonText}
                </Button>
                <p className="mt-4 text-xs text-gray-400">{plan.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
