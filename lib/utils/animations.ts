/**
 * Animation utility classes and helpers for TalentFlow
 */

export const animations = {
  // Fade animations
  fadeIn: 'animate-fadeIn',
  slideUp: 'animate-slide-up',
  scaleIn: 'animate-scale-in',
  shake: 'animate-shake',
  
  // Hover effects
  hoverLift: 'hover-lift',
  cardInteractive: 'card-interactive',
  
  // Loading animations
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
};

export const transitions = {
  // Standard transitions
  all: 'transition-all duration-200 ease-in-out',
  colors: 'transition-colors duration-200',
  transform: 'transition-transform duration-200',
  opacity: 'transition-opacity duration-200',
  
  // Specific use cases
  button: 'transition-all duration-200 hover:scale-105 active:scale-95',
  card: 'transition-all duration-200 hover:shadow-lg',
  input: 'transition-all duration-200 focus:ring-2 focus:ring-blue-600',
};

export const microInteractions = {
  // Button press effect
  buttonPress: 'active:scale-95 transition-transform',
  
  // Card hover
  cardHover: 'hover:shadow-lg hover:-translate-y-1 transition-all duration-200',
  
  // Icon bounce on hover
  iconBounce: 'hover:animate-bounce',
  
  // Smooth color transition
  smoothColor: 'transition-colors duration-300',
  
  // Ripple effect (requires custom implementation)
  ripple: 'relative overflow-hidden before:absolute before:inset-0 before:bg-white/20 before:scale-0 hover:before:scale-100 before:transition-transform before:duration-300',
};

export const focusStates = {
  default: 'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
  error: 'focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2',
  success: 'focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2',
};

// Stagger animation helper
export const staggerDelay = (index: number, baseDelay: number = 50): { animationDelay: string } => ({
  animationDelay: `${index * baseDelay}ms`,
});

// Spring animation configuration
export const springConfig = {
  stiff: { type: 'spring', stiffness: 300, damping: 20 },
  smooth: { type: 'spring', stiffness: 200, damping: 30 },
  gentle: { type: 'spring', stiffness: 100, damping: 20 },
};
