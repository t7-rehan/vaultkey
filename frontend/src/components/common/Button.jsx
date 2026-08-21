import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  variant = 'primary', // primary | secondary | danger | outline | ghost
  size = 'md', // sm | md | lg
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  ...props
}) {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none";

  const variants = {
    primary: "bg-[#4F7CFF] hover:bg-brand-600 text-white shadow-sm shadow-brand-500/20 active:scale-[0.98]",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-surface-darkSecondary dark:hover:bg-gray-800 dark:text-gray-200 active:scale-[0.98]",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-500/20 active:scale-[0.98]",
    outline: "border border-[#E6EAF0] dark:border-[#253044] bg-transparent hover:bg-gray-50 dark:hover:bg-surface-darkSecondary text-gray-700 dark:text-gray-200 active:scale-[0.98]",
    ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-surface-darkSecondary text-gray-600 dark:text-gray-300",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs font-medium gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
