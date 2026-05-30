/// <reference types="vite/client" />

// Allow importing audio assets as URL strings (handled by Vite's asset pipeline).
declare module '*.wav' {
  const src: string;
  export default src;
}
declare module '*.mp3' {
  const src: string;
  export default src;
}
declare module '*.ogg' {
  const src: string;
  export default src;
}
