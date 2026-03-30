import type { Address } from 'viem';
import { getExplorerApiUrl } from '../chains/index.js';
import { getContractSourceTemplate } from './deploy.js';

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

/**
 * Polls the block explorer's `checkverifystatus` endpoint until verification
 * is confirmed or the maximum number of attempts is exhausted.
 *
 * @param params - Polling parameters
 * @param params.apiUrl - Block explorer API base URL
 * @param params.guid - GUID returned by the initial `verifysourcecode` submission
 * @param params.maxAttempts - Maximum poll attempts before giving up (default: 10)
 * @param params.intervalMs - Milliseconds to wait between polls (default: 3000)
 * @returns Whether verification was confirmed and the final status message
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

    const data = (await response.json()) as {
      status: string;
      result: string;
      message: string;
    };

    const message = data.result || data.message;

    if (data.status === '1') {
      return { verified: true, message };
    }

    // "Pending in queue" or "Already Verified" without status=1
    // "Fail - Unable to verify" means a terminal failure
    if (message.toLowerCase().includes('fail') || message.toLowerCase().includes('error')) {
      return { verified: false, message };
    }

    // Still pending — continue polling
  }

  return { verified: false, message: 'Verification timed out: max poll attempts exceeded' };
}

/**
 * Submits source code verification to the configured block explorer API,
 * then polls for the verification status until confirmed or timed out.
 * Returns success=false (rather than throwing) if the chain is unsupported
 * or the request fails.
 *
 * @param params - Verification parameters
 * @returns Verification result with success flag, message, and optional explorer URL
 */
export async function verifyContract(params: VerifyParams): Promise<VerifyResult> {
  const {
    address,
    name,
    variant,
    chainId,
    compilerVersion = 'v0.8.28+commit.7893614a',
  } = params;

  const apiUrl = getExplorerApiUrl(chainId);
  if (!apiUrl) {
    return {
      success: false,
      message: `No explorer API URL configured for chain ${chainId}`,
      explorerUrl: null,
    };
  }

  const sourceTemplate = getContractSourceTemplate(variant);
  const originalName = variant === 'simple' ? 'TitrateSimple' : 'TitrateFull';
  const customSource = sourceTemplate.replaceAll(originalName, name);

  const explorerUrl = `${apiUrl.replace('/api', '')}/address/${address}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: address,
        sourceCode: customSource,
        codeformat: 'solidity-single-file',
        contractname: name,
        compilerversion: compilerVersion,
        optimizationUsed: '1',
        runs: '200',
      }),
    });

    const data = (await response.json()) as {
      status: string;
      result: string;
      message: string;
    };

    // status '1' means the submission was accepted and a GUID is returned in result
    if (data.status !== '1') {
      return {
        success: false,
        message: data.result || data.message,
        explorerUrl,
      };
    }

    const guid = data.result;

    const pollResult = await pollVerificationStatus({ apiUrl, guid });
    return {
      success: pollResult.verified,
      message: pollResult.message,
      explorerUrl,
    };
  } catch (err) {
    return {
      success: false,
      message: `Verification request failed: ${String(err)}`,
      explorerUrl: null,
    };
  }
}
