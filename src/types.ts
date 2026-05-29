export type GameMode = 'menu' | 'select-character' | 'play' | 'puzzles' | 'lessons' | 'store' | 'online-match' | 'analysis' | 'local-friend' | 'home' | 'settings' | 'profile';

export type BoardTheme = 'classic' | 'forest' | 'cosmic';

export interface Character {
  id: string;
  name: string;
  avatar: string;
  difficulty: 'Sangat Mudah' | 'Mudah' | 'Sedang' | 'Sulit';
  elo: number;
  playstyle: string;
  bio: string;
  welcomeMsg: string;
  checkmateMsg: string;
  blunderMsg: string;
  color: string;
}

export interface Puzzle {
  id: string;
  title: string;
  difficulty: 'Mudah' | 'Sedang' | 'Sulit';
  description: string;
  fen: string;
  solution: string[]; // e.g., ["Qxf7+"] or keys like ["f7g8", "h8h7"]
  explanation: string;
  points: number;
}

export interface LessonStep {
  title: string;
  description: string;
  fen?: string; // board configuration if needed
  highlightSquares?: string[]; // e.g., ["e2", "e4"]
  requiredMove?: { from: string; to: string }; // if any required move to pass
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  icon: string;
  difficulty: 'Dasar' | 'Menengah';
  steps: LessonStep[];
  points: number;
}

export interface PurchaseableTheme {
  id: BoardTheme;
  name: string;
  cost: number;
  primaryColor: string;
  secondaryColor: string;
  bgClass: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  targetType: 'played' | 'won' | 'elo' | 'xp';
  targetValue: number;
}

