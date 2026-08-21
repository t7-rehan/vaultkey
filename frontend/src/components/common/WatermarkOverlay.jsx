import React from 'react';

export function WatermarkOverlay({ ipAddress, timestamp }) {
  const text = `VAULTKEY CONFIDENTIAL · ${ipAddress || '127.0.0.1'} · ${timestamp ? new Date(timestamp).toLocaleDateString() : 'VIEW ONLY'} · DO NOT COPY`;

  // Repeat watermark pattern across grid
  const items = Array.from({ length: 30 });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-30 flex flex-wrap justify-around items-center opacity-15 dark:opacity-20 gap-x-12 gap-y-16 p-8">
      {items.map((_, i) => (
        <div
          key={i}
          className="transform -rotate-25 text-xs font-mono font-bold tracking-widest text-gray-900 dark:text-white whitespace-nowrap"
        >
          {text}
        </div>
      ))}
    </div>
  );
}
