import React from 'react';

interface PieceProps {
  type: string; // 'p' | 'r' | 'n' | 'b' | 'q' | 'k'
  color: string; // 'w' | 'b'
  className?: string;
  skin?: string;
}

export const ChessPiece: React.FC<PieceProps> = ({ type, color, className = 'w-full h-full', skin = 'standard' }) => {
  const isWhite = color === 'w';
  
  // Custom styled CSS colors with beautiful shadows and gradients
  let fillClass = isWhite 
    ? 'fill-slate-50 stroke-slate-800' 
    : 'fill-slate-800 stroke-slate-900';
    
  if (skin === 'wood') {
    fillClass = isWhite
      ? 'fill-[#f1d7a8] stroke-[#855329]' // warm maple wood
      : 'fill-[#5f3f26] stroke-[#2c1c0e]'; // rich espresso walnut wood
  } else if (skin === 'neon') {
    fillClass = isWhite
      ? 'fill-[#1c1c24] stroke-[#00f0ff]' // sci-fi cyan glow
      : 'fill-[#1c1c24] stroke-[#ff007f]'; // cyberpunk magenta glow
  } else if (skin === 'gold') {
    fillClass = isWhite
      ? 'fill-[#ffd700] stroke-[#917105]' // brilliant royal gold
      : 'fill-[#252525] stroke-[#ffd700]'; // platinum with gold lining
  }
    
  // High contrast elegant minimal custom vector paths for chess pieces
  switch (type.toLowerCase()) {
    case 'p': // Pawn
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="4">
          <filter id="shadow">
            <feDropShadow dx="2" dy="2" stdDeviation="2" floodOpacity="0.3"/>
          </filter>
          <g filter="url(#shadow)">
            <ellipse cx="50" cy="85" rx="30" ry="8" />
            <path d="M 35 80 L 65 80 L 60 45 L 40 45 Z" />
            <circle cx="50" cy="32" r="16" />
            {isWhite && <circle cx="50" cy="32" r="10" className="fill-white/40 stroke-none" />}
          </g>
        </svg>
      );
    case 'r': // Rook
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="4">
          <g>
            <rect x="25" y="80" width="50" height="10" rx="2" />
            <path d="M 30 80 L 70 80 L 65 35 L 35 35 Z" />
            <path d="M 30 35 L 70 35 L 70 20 L 60 20 L 60 27 L 55 27 L 55 20 L 45 20 L 45 27 L 40 27 L 40 20 L 30 20 Z" />
            {isWhite && <rect x="38" y="45" width="24" height="6" rx="1" className="fill-white/30 stroke-none" />}
          </g>
        </svg>
      );
    case 'n': // Knight
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <g>
            {/* Elegant, high-fidelity chess knight horse silhouette */}
            <path d="M 33 82 
                     L 67 82 
                     C 67 82, 70 82, 70 78 
                     C 70 72, 65 65, 62 61 
                     C 65 59, 69 52, 70 45 
                     C 71 35, 66 23, 56 16 
                     C 52 13, 44 14, 40 18 
                     C 38 15, 33 13, 31 16 
                     C 29 19, 31 23, 29 26 
                     C 25 29, 21 34, 21 40 
                     C 21 44, 25 45, 23 49 
                     C 19 55, 20 62, 26 66 
                     C 29 68, 30 71, 28 75 
                     C 27 77, 28 82, 33 82 Z" />
            {/* Stylized mane lines and layered highlights */}
            <path d="M 46 22 C 48 26, 48 31, 46 36 M 52 26 C 55 31, 55 38, 51 44 M 58 35 C 60 40, 59 47, 54 53" fill="none" strokeWidth="2" className={isWhite ? 'stroke-slate-850' : 'stroke-slate-200'} />
            {/* Snout outline / nostril detail */}
            <path d="M 25 38 C 24 35, 27 34, 29 35" fill="none" strokeWidth="2" className={isWhite ? 'stroke-slate-850' : 'stroke-slate-100'} />
            {/* Mouth / jawline definition */}
            <path d="M 23 49 C 27 49, 31 46, 32 42" fill="none" strokeWidth="2" className={isWhite ? 'stroke-slate-850' : 'stroke-slate-100'} />
            {/* Cool majestic sleek eye */}
            <path d="M 40 30 C 43 28, 45 31, 44 34 Z" className={isWhite ? 'fill-slate-800' : 'fill-slate-100'} />
            {/* Elegant neck shadow line */}
            <path d="M 38 78 C 42 62, 49 52, 60 48" fill="none" strokeWidth="2" className={isWhite ? 'stroke-slate-400' : 'stroke-slate-950'} opacity="0.6" />
          </g>
        </svg>
      );
    case 'b': // Bishop
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="4">
          <g>
            <ellipse cx="50" cy="85" rx="25" ry="6" />
            <path d="M 33 82 L 67 82 L 60 65 L 40 65 Z" />
            <path d="M 40 65 C 40 65 30 55 35 42 C 40 30 50 22 50 22 C 50 22 60 30 65 42 C 70 55 60 65 60 65 Z" />
            <circle cx="50" cy="18" r="4.5" />
            <path d="M 45 42 H 55 M 50 37 V 47" fill="none" strokeWidth="3" />
            <path d="M 58 35 L 42 50" fill="none" strokeWidth="2" />
          </g>
        </svg>
      );
    case 'q': // Queen
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="4">
          <g>
            <ellipse cx="50" cy="85" rx="30" ry="7" />
            <path d="M 30 82 L 70 82 A 5 5 0 0 0 75 75 L 85 40 L 68 62 L 50 30 L 32 62 L 15 40 L 25 75 A 5 5 0 0 0 30 82 Z" />
            <circle cx="15" cy="37" r="4" />
            <circle cx="32" cy="59" r="4" />
            <circle cx="50" cy="26" r="4" />
            <circle cx="68" cy="59" r="4" />
            <circle cx="85" cy="37" r="4" />
          </g>
        </svg>
      );
    case 'k': // King
      return (
        <svg viewBox="0 0 100 100" className={`${className} ${fillClass}`} strokeWidth="4">
          <g>
            <ellipse cx="50" cy="85" rx="30" ry="7" />
            <path d="M 30 82 L 70 82 L 70 70 L 63 60 L 65 40 L 73 35 L 50 48 L 27 35 L 35 40 L 37 60 L 30 70 Z" />
            <path d="M 50 25 V 10 M 43 17 H 57" fill="none" strokeWidth="4.5" />
            <rect x="35" y="70" width="30" height="5" rx="1.5" />
          </g>
        </svg>
      );
    default:
      return null;
  }
};
