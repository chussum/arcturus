// Next 16 no longer ships a global '*.css' module declaration, and TS 6.0
// checks side-effect imports (TS2882) — without this, every css import fails.
declare module '*.css';
