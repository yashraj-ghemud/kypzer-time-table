// Minimal lint config: catch real mistakes (undefined names, unused vars, unreachable code).
export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
        performance: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly', getComputedStyle: 'readonly', matchMedia: 'readonly', innerWidth: 'readonly',
        innerHeight: 'readonly', scrollY: 'readonly', devicePixelRatio: 'readonly', CSS: 'readonly', Node: 'readonly', Blob: 'readonly', File: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Response: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', CompressionStream: 'readonly',
        DecompressionStream: 'readonly', btoa: 'readonly', atob: 'readonly', Image: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
        Notification: 'readonly', confirm: 'readonly', alert: 'readonly', WebGLRenderingContext: 'readonly', self: 'readonly', caches: 'readonly', fetch: 'readonly',
        process: 'readonly', Promise: 'readonly', Map: 'readonly', Set: 'readonly', Uint8Array: 'readonly', Float32Array: 'readonly', Uint8ClampedArray: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
];
