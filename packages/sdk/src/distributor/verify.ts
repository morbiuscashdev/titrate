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

/**
 * Submits source code verification to the configured block explorer API.
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
  const customSource = sourceTemplate.replace(new RegExp(originalName, 'g'), name);

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

    return {
      success: data.status === '1',
      message: data.result || data.message,
      explorerUrl: `${apiUrl.replace('/api', '')}/address/${address}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Verification request failed: ${String(err)}`,
      explorerUrl: null,
    };
  }
}
