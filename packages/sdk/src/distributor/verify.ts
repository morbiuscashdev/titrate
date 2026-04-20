import type { Address } from 'viem';
import { getExplorerApiUrl } from '../chains/index.js';
import { getContractSourceTemplate } from './deploy.js';
import TitrateSimpleArtifact from './artifacts/TitrateSimple.json' with { type: 'json' };
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VerifyBackend = 'sourcify' | 'etherscan' | 'blockscout-v2';

export type VerifyAttempt = {
  readonly backend: VerifyBackend;
  readonly success: boolean;
  readonly message: string;
};

export type VerifyParams = {
  readonly address: Address;
  readonly name: string;
  readonly variant: 'simple' | 'full';
  readonly chainId: number;
  readonly compilerVersion?: string;
};

export type VerifyResult = {
  readonly success: boolean;
  readonly message: string;
  readonly explorerUrl: string | null;
  /** Per-backend outcomes. Every applicable backend attempts, regardless of any other's success. */
  readonly attempts: readonly VerifyAttempt[];
};

export type PollVerificationStatusParams = {
  readonly apiUrl: string;
  readonly guid: string;
  readonly maxAttempts?: number;
  readonly intervalMs?: number;
};

export type PollVerificationStatusResult = {
  readonly verified: boolean;
  readonly message: string;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULT_COMPILER_VERSION = 'v0.8.28+commit.7893614a';
const SOURCIFY_SERVER_URL = 'https://sourcify.dev/server';

/** Returns the raw metadata JSON string Foundry emitted for the compiled contract. */
function getRawMetadata(variant: 'simple' | 'full'): string {
  const artifact = variant === 'simple' ? TitrateSimpleArtifact : TitrateFullArtifact;
  const meta = (artifact as { rawMetadata?: string }).rawMetadata;
  if (!meta) {
    throw new Error(`Artifact for '${variant}' has no rawMetadata — rerun scripts/sync-artifacts.ts`);
  }
  return meta;
}

function getCustomSource(variant: 'simple' | 'full', name: string): string {
  const template = getContractSourceTemplate(variant);
  const originalName = variant === 'simple' ? 'TitrateSimple' : 'TitrateFull';
  return template.replaceAll(originalName, name);
}

/** Strips a trailing `/api` (if any) from a base explorer API URL. */
function apiRoot(apiUrl: string): string {
  return apiUrl.endsWith('/api') ? apiUrl.slice(0, -'/api'.length) : apiUrl;
}

// ---------------------------------------------------------------------------
// Etherscan-compat (existing v1 flow) — works on Etherscan + legacy Blockscout
// ---------------------------------------------------------------------------

/**
 * Polls the block explorer's `checkverifystatus` endpoint until verification
 * is confirmed or the maximum number of attempts is exhausted.
 */
export async function pollVerificationStatus(
  params: PollVerificationStatusParams,
): Promise<PollVerificationStatusResult> {
  const { apiUrl, guid, maxAttempts = 10, intervalMs = 3000 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }

    const response = await fetch(
      `${apiUrl}?module=contract&action=checkverifystatus&guid=${guid}`,
    );
    const data = (await response.json()) as { status: string; result: string; message: string };
    const message = data.result || data.message;

    if (data.status === '1') {
      return { verified: true, message };
    }
    if (message.toLowerCase().includes('fail') || message.toLowerCase().includes('error')) {
      return { verified: false, message };
    }
  }

  return { verified: false, message: 'Verification timed out: max poll attempts exceeded' };
}

async function tryVerifyEtherscan(params: {
  readonly apiUrl: string;
  readonly address: Address;
  readonly name: string;
  readonly variant: 'simple' | 'full';
  readonly compilerVersion: string;
}): Promise<VerifyAttempt> {
  try {
    const response = await fetch(params.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: params.address,
        sourceCode: getCustomSource(params.variant, params.name),
        codeformat: 'solidity-single-file',
        contractname: params.name,
        compilerversion: params.compilerVersion,
        optimizationUsed: '1',
        runs: '200',
      }),
    });

    // Treat non-JSON responses (HTML 5xx / captcha pages) as a clean failure.
    const text = await response.text();
    let data: { status?: string; result?: string; message?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return {
        backend: 'etherscan',
        success: false,
        message: `Non-JSON response (HTTP ${response.status}): ${text.slice(0, 80)}`,
      };
    }

    if (data.status !== '1') {
      return {
        backend: 'etherscan',
        success: false,
        message: data.result || data.message || 'Etherscan submission rejected',
      };
    }

    const guid = data.result as string;
    const poll = await pollVerificationStatus({ apiUrl: params.apiUrl, guid });
    return { backend: 'etherscan', success: poll.verified, message: poll.message };
  } catch (err) {
    return {
      backend: 'etherscan',
      success: false,
      message: `Etherscan request failed: ${String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Blockscout v2 REST API — used by recent Blockscout deployments
// ---------------------------------------------------------------------------

async function tryVerifyBlockscoutV2(params: {
  readonly apiUrl: string;
  readonly address: Address;
  readonly name: string;
  readonly variant: 'simple' | 'full';
  readonly compilerVersion: string;
}): Promise<VerifyAttempt> {
  // The v2 endpoint lives alongside the Etherscan-compat /api on the same host:
  //   <apiBase>/v2/smart-contracts/<address>/verification/via/flattened-code
  const url = `${apiRoot(params.apiUrl)}/api/v2/smart-contracts/${params.address}/verification/via/flattened-code`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler_version: params.compilerVersion,
        license_type: 'mit',
        source_code: getCustomSource(params.variant, params.name),
        is_optimization_enabled: true,
        optimization_runs: 200,
        contract_name: params.name,
        libraries: {},
        evm_version: 'default',
        autodetect_constructor_args: true,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        backend: 'blockscout-v2',
        success: false,
        message: `Blockscout v2 HTTP ${response.status}: ${text.slice(0, 120)}`,
      };
    }

    let data: { message?: string; status?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return {
        backend: 'blockscout-v2',
        success: false,
        message: `Blockscout v2 non-JSON: ${text.slice(0, 120)}`,
      };
    }

    // Blockscout accepts the submission synchronously; the actual verification
    // runs in the background. A 2xx response with no error is the strongest
    // signal we can get without long-polling the contracts endpoint.
    return {
      backend: 'blockscout-v2',
      success: true,
      message: data.message ?? 'Submission accepted',
    };
  } catch (err) {
    return {
      backend: 'blockscout-v2',
      success: false,
      message: `Blockscout v2 request failed: ${String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Sourcify — chain-agnostic source verification against solc metadata
// ---------------------------------------------------------------------------

async function tryVerifySourcify(params: {
  readonly address: Address;
  readonly name: string;
  readonly variant: 'simple' | 'full';
  readonly chainId: number;
}): Promise<VerifyAttempt> {
  try {
    // Sourcify matches sources by the metadata hash baked into deployed
    // bytecode. The metadata.json was captured during Foundry compilation.
    const metadata = getRawMetadata(params.variant);
    const source = getCustomSource(params.variant, params.name);

    const files: Record<string, string> = {
      'metadata.json': metadata,
      [`${params.name}.sol`]: source,
    };

    const response = await fetch(`${SOURCIFY_SERVER_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: params.address,
        chain: String(params.chainId),
        files,
      }),
    });

    const text = await response.text();
    let data: {
      error?: string;
      message?: string;
      result?: ReadonlyArray<{ status?: string; message?: string }>;
    };
    try {
      data = JSON.parse(text);
    } catch {
      return {
        backend: 'sourcify',
        success: false,
        message: `Sourcify non-JSON (HTTP ${response.status}): ${text.slice(0, 120)}`,
      };
    }

    if (data.error) {
      return { backend: 'sourcify', success: false, message: data.error };
    }

    const first = data.result?.[0];
    if (first?.status === 'perfect' || first?.status === 'partial') {
      return {
        backend: 'sourcify',
        success: true,
        message: `Sourcify ${first.status} match`,
      };
    }

    return {
      backend: 'sourcify',
      success: false,
      message: data.message ?? first?.message ?? 'Sourcify returned no match',
    };
  } catch (err) {
    return {
      backend: 'sourcify',
      success: false,
      message: `Sourcify request failed: ${String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Submits source code verification to every known backend in parallel:
 * Sourcify, Blockscout v2, and the Etherscan-compat v1 API. Returns success
 * if ANY backend succeeds. Per-backend outcomes are recorded in `attempts`
 * so callers can surface which verifier succeeded (or why all failed).
 *
 * The set of applicable backends is determined by the chain configuration:
 * Sourcify is attempted for any chainId (the server rejects unsupported
 * chains with a clear message); Etherscan-compat and Blockscout v2 are
 * attempted only when a chain has a configured explorer API URL.
 */
export async function verifyContract(params: VerifyParams): Promise<VerifyResult> {
  const {
    address,
    name,
    variant,
    chainId,
    compilerVersion = DEFAULT_COMPILER_VERSION,
  } = params;

  const apiUrl = getExplorerApiUrl(chainId);
  const explorerUrl = apiUrl ? `${apiRoot(apiUrl)}/address/${address}` : null;

  const tasks: Array<Promise<VerifyAttempt>> = [
    tryVerifySourcify({ address, name, variant, chainId }),
  ];
  if (apiUrl) {
    tasks.push(
      tryVerifyEtherscan({ apiUrl, address, name, variant, compilerVersion }),
      tryVerifyBlockscoutV2({ apiUrl, address, name, variant, compilerVersion }),
    );
  }

  const attempts = await Promise.all(tasks);
  const winner = attempts.find((a) => a.success);
  const summary = winner
    ? `Verified via ${winner.backend}: ${winner.message}`
    : `All ${attempts.length} verification backends failed`;

  return {
    success: Boolean(winner),
    message: summary,
    explorerUrl,
    attempts,
  };
}
