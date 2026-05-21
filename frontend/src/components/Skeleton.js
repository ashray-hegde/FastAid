import React from 'react';
import './skeleton.css';

export default function Skeleton({ count = 3, height = '80px', style = {} }) {
  const items = Array.from({ length: count });
  return (
    <div className="skeleton-list">
      {items.map((_, i) => (
        <div key={i} className="skeleton-item" style={{ height, ...style }} />
      ))}
    </div>
  );
}
