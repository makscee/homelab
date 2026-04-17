// Ambient module declaration for CSS side-effect imports.
// TS 6.0 raised TS2882 for bare `import './globals.css'` forms that
// were silently tolerated in TS 5.x. Next.js handles CSS at build time;
// this declaration is type-only and has no runtime effect.
declare module "*.css";
