import { chromium, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Diretório onde screenshots e diagnósticos de falha são gravados.
// Subpasta dedicada para NUNCA limpar o %TEMP%/tmp inteiro ao zerar diagnósticos.
export const DIAG_DIR = process.env.ONI_DIAG_DIR ?? path.join(os.tmpdir(), 'oni-sso');

// Caminho de um arquivo de diagnóstico/screenshot dentro do DIAG_DIR.
export const diagPath = (name: string): string => path.join(DIAG_DIR, name);

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

// Aguarda até `predicate()` ser verdadeiro ou estourar o timeout. Útil para
// esperar o SAMLResponse ser capturado sem depender de 'networkidle' (que não
// estabiliza em páginas com conexões persistentes, ex.: console AWS).
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  return predicate();
}

// Base dos perfis persistentes (um subdir por provedor). Persistir o perfil faz
// os cookies de "dispositivo confiável"/"continuar conectado" sobreviverem entre
// execuções, permitindo ao IdP pular senha/MFA dentro da janela da política.
const PROFILE_BASE = process.env.ONI_PROFILE_DIR ?? path.join(os.homedir(), '.oni-sso', 'profiles');
const PERSIST = process.env.ONI_NO_PERSIST !== '1';

function launchOptions() {
  const headful = process.env.ONI_HEADFUL === '1' || process.env.HEADLESS === 'false';
  return {
    headless: !headful,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
}

export interface Session {
  page: Page;
  addInitScript: (script: string) => Promise<void>;
  close: () => Promise<void>;
}

// Abre uma sessão de navegador. Por padrão usa um contexto PERSISTENTE por
// provedor (ONI_PROFILE_DIR). Defina ONI_NO_PERSIST=1 para sessão efêmera.
// Defina ONI_HEADFUL=1 (ou HEADLESS=false) para ver o navegador.
export async function openSession(profileKey: string): Promise<Session> {
  if (PERSIST) {
    const dir = path.join(PROFILE_BASE, profileKey);
    fs.mkdirSync(dir, { recursive: true });
    const context: BrowserContext = await chromium.launchPersistentContext(dir, launchOptions());
    const page = context.pages()[0] ?? await context.newPage();
    return {
      page,
      addInitScript: async (script: string) => { await context.addInitScript(script); },
      close: () => context.close(),
    };
  }
  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    addInitScript: async (script: string) => { await context.addInitScript(script); },
    close: () => browser.close(),
  };
}

// Salva diagnóstico (screenshot + URL + HTML) para tornar relatos de erro
// acionáveis. Nunca lança exceção.
export async function dumpFailure(page: Page | undefined, label: string): Promise<void> {
  try {
    if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });
    if (!page) return;
    const base = path.join(DIAG_DIR, `failure-${label}`);
    await page.screenshot({ path: `${base}.png` }).catch(() => undefined);
    const url = page.url();
    const html = await page.content().catch(() => '');
    fs.writeFileSync(`${base}.html`, `<!-- url: ${url} -->\n${html}`, 'utf-8');
    console.error(`Diagnostic saved to ${base}.png / ${base}.html (current url: ${url})`);
  } catch {
    /* diagnóstico é best-effort */
  }
}

// Erro fatal padronizado para a CLI.
export function fatal(message: string): never {
  console.error(message);
  process.exit(1);
}

// Limpa arquivos de um diretório (best-effort) para zerar screenshots antigos.
// Cria o diretório se não existir. Por segurança, só deve apontar para uma
// pasta dedicada (ver DIAG_DIR), nunca para a raiz de %TEMP%.
export function clearFolder(folderPath: string): void {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    return;
  }
  for (const file of fs.readdirSync(folderPath)) {
    try {
      fs.unlinkSync(path.join(folderPath, file));
    } catch {
      /* ignora o que não pode ser removido */
    }
  }
}
