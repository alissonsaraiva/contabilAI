export async function register() {
  // Importa código Node.js-only apenas no runtime Node.js
  // (o bundler do Edge não vai analisar este import por estar dentro do if)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
