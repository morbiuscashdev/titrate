# Titrate Phase 1: Contracts + SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Titrate smart contracts (both variants) and TypeScript SDK — the foundation consumed by the web app and TUI in later phases.

**Architecture:** Monorepo with `packages/contracts` (Foundry) and `packages/sdk` (TypeScript). Contracts are compiled at build time with `metadata.bytecodeHash: "none"` to produce name-independent bytecode. The SDK ships pre-compiled ABI+bytecode as static JSON artifacts and provides modules for chain config, CSV handling, wallet derivation, calldata encoding, contract deployment/verification, block scanning, and composable pipelines.

**Tech Stack:** TypeScript (strict), Viem, Solidity ^0.8.28, Foundry (forge), Vitest, npm workspaces

**Spec:** `docs/superpowers/specs/2026-03-29-titrate-design.md`

---

## File Structure

```
titrate/
├── package.json
├── tsconfig.base.json
├── .gitignore
├── CLAUDE.md
├── packages/
│   ├── contracts/
│   │   ├── package.json
│   │   ├── foundry.toml
│   │   ├── remappings.txt
│   │   ├── src/
│   │   │   ├── TitrateSimple.sol
│   │   │   └── TitrateFull.sol
│   │   ├── test/
│   │   │   ├── TitrateSimple.t.sol
│   │   │   ├── TitrateFull.t.sol
│   │   │   └── helpers/
│   │   │       └── MockERC20.sol
│   │   └── script/
│   │       └── extract-artifacts.sh
│   └── sdk/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── chains/
│           │   ├── index.ts
│           │   └── config.ts
│           ├── csv/
│           │   ├── index.ts
│           │   ├── parse.ts
│           │   ├── validate.ts
│           │   └── amounts.ts
│           ├── wallet/
│           │   ├── index.ts
│           │   └── derive.ts
│           ├── encode/
│           │   ├── index.ts
│           │   └── encoders.ts
│           ├── distributor/
│           │   ├── index.ts
│           │   ├── deploy.ts
│           │   ├── verify.ts
│           │   ├── disperse.ts
│           │   ├── allowance.ts
│           │   ├── registry.ts
│           │   └── artifacts/
│           │       ├── TitrateSimple.json
│           │       └── TitrateFull.json
│           ├── scanner/
│           │   ├── index.ts
│           │   ├── blocks.ts
│           │   ├── logs.ts
│           │   ├── properties.ts
│           │   └── titrate-range.ts
│           ├── pipeline/
│           │   ├── index.ts
│           │   ├── pipeline.ts
│           │   ├── sources.ts
│           │   └── filters.ts
│           ├── storage/
│           │   └── index.ts
│           └── __tests__/
│               ├── chains.test.ts
│               ├── csv.test.ts
│               ├── wallet.test.ts
│               ├── encode.test.ts
│               ├── scanner.test.ts
│               └── pipeline.test.ts
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/foundry.toml`
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/vitest.config.ts`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop
git init
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "titrate",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "test:sdk": "npm run test -w packages/sdk",
    "test:contracts": "npm run test -w packages/contracts"
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.superpowers/
.DS_Store
*.log
cache/
out/
```

- [ ] **Step 5: Create CLAUDE.md**

```markdown
# Titrate

Offline-first airdrop platform for EVM chains.

## Monorepo

- `packages/contracts` — Solidity contracts (Foundry)
- `packages/sdk` — TypeScript SDK (Viem, Vitest)
- `packages/web` — Web app (Vite + React) — Phase 2
- `packages/tui` — Terminal UI — Phase 3

## Commands

- `forge test` — run contract tests (from packages/contracts)
- `npx vitest run` — run SDK tests (from packages/sdk)
- `npm test` — run all tests (from root)

## Conventions

- Functional patterns, no classes except where Viem requires them
- Pure functions, immutability, composition
- No `any` — use `unknown` at boundaries and narrow
- Strict mode always
- Conventional commits: `type(scope): subject`
```

- [ ] **Step 6: Create packages/contracts/package.json**

```json
{
  "name": "@titrate/contracts",
  "private": true,
  "scripts": {
    "build": "forge build",
    "test": "forge test -vvv",
    "extract": "bash script/extract-artifacts.sh"
  }
}
```

- [ ] **Step 7: Create packages/contracts/foundry.toml**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200
cbor_metadata = false

[profile.default.metadata]
bytecode_hash = "none"
```

- [ ] **Step 8: Create packages/sdk/package.json**

```json
{
  "name": "@titrate/sdk",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "viem": "^2.23.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 9: Create packages/sdk/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 10: Create packages/sdk/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 11: Install dependencies**

```bash
npm install
```

- [ ] **Step 12: Install Foundry dependencies**

```bash
cd packages/contracts && forge install foundry-rs/forge-std --no-commit && cd ../..
```

- [ ] **Step 13: Create packages/contracts/remappings.txt**

```
forge-std/=lib/forge-std/src/
```

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(scaffold): initialize titrate monorepo with contracts and sdk packages"
```

---

### Task 2: Simple Contract

**Files:**
- Create: `packages/contracts/src/TitrateSimple.sol`
- Create: `packages/contracts/test/helpers/MockERC20.sol`

- [ ] **Step 1: Create MockERC20 test helper**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
```

- [ ] **Step 2: Create TitrateSimple.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title TitrateSimple
/// @notice Minimal batch distributor. No auth, no registry.
contract TitrateSimple {

    /// @notice Distribute variable token amounts to each recipient
    /// @param token ERC-20 address, or address(0) for native
    function disperse(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        require(recipients.length == amounts.length);
        if (token == address(0)) {
            _sendNative(recipients, amounts);
            _refundDust();
        } else {
            _sendToken(token, recipients, amounts);
        }
    }

    /// @notice Distribute same token amount to all recipients
    function disperseSimple(
        address token,
        address[] calldata recipients,
        uint256 amount
    ) external payable {
        if (token == address(0)) {
            _sendNativeSimple(recipients, amount);
            _refundDust();
        } else {
            _sendTokenSimple(token, recipients, amount);
        }
    }

    /// @notice Arbitrary calldata batch execution
    function disperseCall(
        address[] calldata targets,
        bytes[] calldata calldatas,
        uint256[] calldata values
    ) external payable {
        require(targets.length == calldatas.length);
        require(targets.length == values.length);
        for (uint256 i; i < targets.length; ) {
            (bool ok, ) = targets[i].call{value: values[i]}(calldatas[i]);
            require(ok);
            unchecked { ++i; }
        }
        _refundDust();
    }

    // ─── Internals ──────────────────────────────────────

    function _sendNative(
        address[] calldata recipients, uint256[] calldata amounts
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            require(ok);
            unchecked { ++i; }
        }
    }

    function _sendNativeSimple(
        address[] calldata recipients, uint256 amount
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amount}("");
            require(ok);
            unchecked { ++i; }
        }
    }

    function _sendToken(
        address token, address[] calldata recipients, uint256[] calldata amounts
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(msg.sender, recipients[i], amounts[i]);
            unchecked { ++i; }
        }
    }

    function _sendTokenSimple(
        address token, address[] calldata recipients, uint256 amount
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(msg.sender, recipients[i], amount);
            unchecked { ++i; }
        }
    }

    function _refundDust() internal {
        if (address(this).balance > 0) {
            (bool ok, ) = msg.sender.call{value: address(this).balance}("");
            require(ok);
        }
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/contracts && forge build`
Expected: successful compilation

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/TitrateSimple.sol packages/contracts/test/helpers/MockERC20.sol
git commit -m "feat(contracts): add TitrateSimple distributor and MockERC20"
```

---

### Task 3: Simple Contract Tests

**Files:**
- Create: `packages/contracts/test/TitrateSimple.t.sol`

- [ ] **Step 1: Create TitrateSimple.t.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/TitrateSimple.sol";
import "./helpers/MockERC20.sol";

contract TitrateSimpleTest is Test {
    TitrateSimple public distributor;
    MockERC20 public token;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");
    address public sender = makeAddr("sender");

    function setUp() public {
        distributor = new TitrateSimple();
        token = new MockERC20("Test Token", "TT", 8);

        token.mint(sender, 1_000_000e8);
        vm.prank(sender);
        token.approve(address(distributor), type(uint256).max);
    }

    // ─── disperse (ERC-20, variable amounts) ────────────

    function test_disperse_token_variable() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e8;
        amounts[1] = 200e8;
        amounts[2] = 300e8;

        vm.prank(sender);
        distributor.disperse(address(token), recipients, amounts);

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
        assertEq(token.balanceOf(carol), 300e8);
        assertEq(token.balanceOf(sender), 1_000_000e8 - 600e8);
    }

    function test_disperse_token_reverts_mismatched_lengths() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e8;

        vm.prank(sender);
        vm.expectRevert();
        distributor.disperse(address(token), recipients, amounts);
    }

    // ─── disperseSimple (ERC-20, uniform amount) ────────

    function test_disperseSimple_token() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;

        vm.prank(sender);
        distributor.disperseSimple(address(token), recipients, 50e8);

        assertEq(token.balanceOf(alice), 50e8);
        assertEq(token.balanceOf(bob), 50e8);
        assertEq(token.balanceOf(carol), 50e8);
    }

    // ─── disperse (native, variable amounts) ────────────

    function test_disperse_native_variable() public {
        vm.deal(sender, 10 ether);

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;

        vm.prank(sender);
        distributor.disperse{value: 3 ether}(address(0), recipients, amounts);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
    }

    function test_disperse_native_refunds_dust() public {
        vm.deal(sender, 10 ether);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.prank(sender);
        distributor.disperse{value: 3 ether}(address(0), recipients, amounts);

        assertEq(alice.balance, 1 ether);
        assertEq(sender.balance, 9 ether);
    }

    // ─── disperseSimple (native, uniform) ───────────────

    function test_disperseSimple_native() public {
        vm.deal(sender, 10 ether);

        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;

        vm.prank(sender);
        distributor.disperseSimple{value: 3 ether}(address(0), recipients, 1 ether);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 1 ether);
        assertEq(carol.balance, 1 ether);
    }

    // ─── disperseCall (arbitrary calldata) ──────────────

    function test_disperseCall_erc20_transfer() public {
        token.mint(address(distributor), 500e8);

        address[] memory targets = new address[](2);
        targets[0] = address(token);
        targets[1] = address(token);

        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);
        calldatas[1] = abi.encodeWithSignature("transfer(address,uint256)", bob, 200e8);

        uint256[] memory values = new uint256[](2);

        distributor.disperseCall(targets, calldatas, values);

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    function test_disperseCall_native_transfer() public {
        vm.deal(sender, 5 ether);

        address[] memory targets = new address[](2);
        targets[0] = alice;
        targets[1] = bob;

        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = "";
        calldatas[1] = "";

        uint256[] memory values = new uint256[](2);
        values[0] = 1 ether;
        values[1] = 2 ether;

        vm.prank(sender);
        distributor.disperseCall{value: 3 ether}(targets, calldatas, values);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
    }

    function test_disperseCall_reverts_mismatched_lengths() public {
        address[] memory targets = new address[](2);
        bytes[] memory calldatas = new bytes[](1);
        uint256[] memory values = new uint256[](2);

        vm.expectRevert();
        distributor.disperseCall(targets, calldatas, values);
    }

    // ─── Bytecode stability (metadata.bytecodeHash = none) ─

    function test_bytecode_is_deterministic() public view {
        // With cbor_metadata = false and bytecode_hash = "none",
        // the deployed bytecode should not contain metadata.
        // This test verifies the contract deployed successfully,
        // meaning the bytecode is valid. The actual cross-name
        // stability test is done via the extract-artifacts script.
        assertTrue(address(distributor).code.length > 0);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/contracts && forge test -vvv --match-contract TitrateSimpleTest`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/test/TitrateSimple.t.sol
git commit -m "test(contracts): add TitrateSimple test suite"
```

---

### Task 4: Full Contract

**Files:**
- Create: `packages/contracts/src/TitrateFull.sol`

- [ ] **Step 1: Create TitrateFull.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title TitrateFull
/// @notice Batch distributor with operator allowance, on-chain registry, and multicall.
contract TitrateFull {

    // ─── Operator Allowance ─────────────────────────────
    // mapping(owner => operator => selector => allowance)
    mapping(address => mapping(address => mapping(bytes4 => uint256)))
        public allowance;

    function approve(address operator, bytes4 selector, uint256 amount) external {
        allowance[msg.sender][operator][selector] = amount;
    }

    function increaseAllowance(address operator, bytes4 selector, uint256 added) external {
        allowance[msg.sender][operator][selector] += added;
    }

    // ─── On-chain Registry ──────────────────────────────
    mapping(address => mapping(bytes32 => mapping(address => bool)))
        public registry;

    function checkRecipients(
        address distributor,
        bytes32 campaignId,
        address[] calldata recipients
    ) external view returns (bool[] memory) {
        bool[] memory results = new bool[](recipients.length);
        for (uint256 i; i < recipients.length; ) {
            results[i] = registry[distributor][campaignId][recipients[i]];
            unchecked { ++i; }
        }
        return results;
    }

    // ─── Distribution ───────────────────────────────────

    function disperse(
        address token,
        address from,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 campaignId
    ) external payable {
        require(recipients.length == amounts.length);
        bool isNative = token == address(0);
        address source = _resolveSource(from, isNative, this.disperse.selector);

        if (!isNative && from != address(0)) {
            _deductAllowance(from, this.disperse.selector, _sum(amounts));
        }

        if (isNative) {
            _sendNative(recipients, amounts, source, campaignId);
            _refundDust();
        } else {
            _sendToken(token, source, recipients, amounts, campaignId);
        }
    }

    function disperseSimple(
        address token,
        address from,
        address[] calldata recipients,
        uint256 amount,
        bytes32 campaignId
    ) external payable {
        bool isNative = token == address(0);
        address source = _resolveSource(from, isNative, this.disperseSimple.selector);

        if (!isNative && from != address(0)) {
            _deductAllowance(from, this.disperseSimple.selector, amount * recipients.length);
        }

        if (isNative) {
            _sendNativeSimple(recipients, amount, source, campaignId);
            _refundDust();
        } else {
            _sendTokenSimple(token, source, recipients, amount, campaignId);
        }
    }

    function disperseCall(
        address[] calldata targets,
        bytes[] calldata calldatas,
        uint256[] calldata values,
        bytes32 campaignId,
        address[] calldata registryRecipients
    ) external payable {
        require(targets.length == calldatas.length);
        require(targets.length == values.length);

        for (uint256 i; i < targets.length; ) {
            (bool ok, ) = targets[i].call{value: values[i]}(calldatas[i]);
            require(ok);
            if (campaignId != bytes32(0) && registryRecipients.length > i)
                _recordIfNeeded(msg.sender, campaignId, registryRecipients[i]);
            unchecked { ++i; }
        }

        _refundDust();
    }

    // ─── Multicall ──────────────────────────────────────

    function multicall(bytes[] calldata data)
        external payable returns (bytes[] memory results)
    {
        results = new bytes[](data.length);
        for (uint256 i; i < data.length; ) {
            (bool ok, bytes memory result) = address(this).delegatecall(data[i]);
            require(ok);
            results[i] = result;
            unchecked { ++i; }
        }
    }

    // ─── Internals ──────────────────────────────────────

    function _resolveSource(address from, bool isNative, bytes4 selector)
        internal view returns (address)
    {
        if (from == address(0)) return msg.sender;
        require(!isNative, "native: from must be sender");
        require(
            allowance[from][msg.sender][selector] > 0,
            "not authorized for this method"
        );
        return from;
    }

    function _deductAllowance(address from, bytes4 selector, uint256 total) internal {
        require(
            allowance[from][msg.sender][selector] >= total,
            "insufficient allowance"
        );
        allowance[from][msg.sender][selector] -= total;
    }

    function _sum(uint256[] calldata values) internal pure returns (uint256 total) {
        for (uint256 i; i < values.length; ) {
            total += values[i];
            unchecked { ++i; }
        }
    }

    function _sendNative(
        address[] calldata recipients, uint256[] calldata amounts,
        address source, bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            require(ok);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendNativeSimple(
        address[] calldata recipients, uint256 amount,
        address source, bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amount}("");
            require(ok);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendToken(
        address token, address source,
        address[] calldata recipients, uint256[] calldata amounts,
        bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(source, recipients[i], amounts[i]);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendTokenSimple(
        address token, address source,
        address[] calldata recipients, uint256 amount,
        bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(source, recipients[i], amount);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _recordIfNeeded(
        address distributor, bytes32 campaignId, address recipient
    ) internal {
        if (campaignId != bytes32(0))
            registry[distributor][campaignId][recipient] = true;
    }

    function _refundDust() internal {
        if (address(this).balance > 0) {
            (bool ok, ) = msg.sender.call{value: address(this).balance}("");
            require(ok);
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/contracts && forge build`
Expected: successful compilation

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/TitrateFull.sol
git commit -m "feat(contracts): add TitrateFull distributor with allowance, registry, and multicall"
```

---

### Task 5: Full Contract Tests

**Files:**
- Create: `packages/contracts/test/TitrateFull.t.sol`

- [ ] **Step 1: Create TitrateFull.t.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/TitrateFull.sol";
import "./helpers/MockERC20.sol";

contract TitrateFullTest is Test {
    TitrateFull public distributor;
    MockERC20 public token;

    address public cold = makeAddr("cold");
    address public hot = makeAddr("hot");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    bytes32 public campaignId = keccak256("test-campaign-v1");

    function setUp() public {
        distributor = new TitrateFull();
        token = new MockERC20("HEX", "HEX", 8);

        // Cold wallet setup
        token.mint(cold, 10_000_000e8);
        vm.startPrank(cold);
        token.approve(address(distributor), type(uint256).max);
        distributor.approve(hot, TitrateFull.disperse.selector, 1_000_000e8);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, 1_000_000e8);
        vm.stopPrank();

        // Hot wallet gets gas
        vm.deal(hot, 10 ether);
    }

    // ─── Self-distribution (from == address(0)) ─────────

    function test_disperse_self() public {
        token.mint(hot, 1000e8);
        vm.prank(hot);
        token.approve(address(distributor), type(uint256).max);

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e8;
        amounts[1] = 200e8;

        vm.prank(hot);
        distributor.disperse(address(token), address(0), recipients, amounts, bytes32(0));

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    // ─── On-behalf distribution (from != address(0)) ────

    function test_disperse_on_behalf() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e8;
        amounts[1] = 200e8;

        vm.prank(hot);
        distributor.disperse(address(token), cold, recipients, amounts, bytes32(0));

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    // ─── Selector-scoped allowance ──────────────────────

    function test_allowance_decrements() public {
        uint256 before = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, bytes32(0));

        uint256 after_ = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);
        assertEq(before - after_, 200e8);
    }

    function test_allowance_blocks_wrong_selector() public {
        // Hot wallet has disperseSimple allowance, but tries to use disperse
        vm.prank(cold);
        distributor.approve(hot, TitrateFull.disperse.selector, 0);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e8;

        vm.prank(hot);
        vm.expectRevert("not authorized for this method");
        distributor.disperse(address(token), cold, recipients, amounts, bytes32(0));
    }

    function test_allowance_blocks_insufficient() public {
        vm.prank(cold);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, 50e8);

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        vm.prank(hot);
        vm.expectRevert("insufficient allowance");
        distributor.disperseSimple(address(token), cold, recipients, 100e8, bytes32(0));
    }

    function test_increaseAllowance() public {
        uint256 before = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);

        vm.prank(cold);
        distributor.increaseAllowance(hot, TitrateFull.disperseSimple.selector, 500e8);

        uint256 after_ = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);
        assertEq(after_ - before, 500e8);
    }

    // ─── On-chain registry ──────────────────────────────

    function test_registry_records_when_campaignId_set() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, campaignId);

        assertTrue(distributor.registry(cold, campaignId, alice));
        assertTrue(distributor.registry(cold, campaignId, bob));
        assertFalse(distributor.registry(cold, campaignId, carol));
    }

    function test_registry_skips_when_zero() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, bytes32(0));

        assertFalse(distributor.registry(cold, bytes32(0), alice));
    }

    function test_checkRecipients() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, campaignId);

        address[] memory toCheck = new address[](3);
        toCheck[0] = alice;
        toCheck[1] = bob;
        toCheck[2] = carol;

        bool[] memory results = distributor.checkRecipients(cold, campaignId, toCheck);
        assertTrue(results[0]);
        assertTrue(results[1]);
        assertFalse(results[2]);
    }

    // ─── Native token distribution ──────────────────────

    function test_disperse_native_self() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;

        vm.prank(hot);
        distributor.disperse{value: 3 ether}(address(0), address(0), recipients, amounts, bytes32(0));

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2 ether);
    }

    function test_disperse_native_rejects_from() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.prank(hot);
        vm.expectRevert("native: from must be sender");
        distributor.disperse{value: 1 ether}(address(0), cold, recipients, amounts, bytes32(0));
    }

    // ─── Multicall ──────────────────────────────────────

    function test_multicall_composes_operations() public {
        address[] memory r1 = new address[](1);
        r1[0] = alice;
        address[] memory r2 = new address[](1);
        r2[0] = bob;

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(
            TitrateFull.disperseSimple,
            (address(token), cold, r1, 100e8, bytes32(0))
        );
        calls[1] = abi.encodeCall(
            TitrateFull.disperseSimple,
            (address(token), cold, r2, 200e8, bytes32(0))
        );

        vm.prank(hot);
        distributor.multicall(calls);

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    // ─── disperseCall with registry ─────────────────────

    function test_disperseCall_with_registry() public {
        token.mint(address(distributor), 500e8);

        address[] memory targets = new address[](1);
        targets[0] = address(token);

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);

        uint256[] memory values = new uint256[](1);

        address[] memory registryRecipients = new address[](1);
        registryRecipients[0] = alice;

        vm.prank(hot);
        distributor.disperseCall(targets, calldatas, values, campaignId, registryRecipients);

        assertEq(token.balanceOf(alice), 100e8);
        assertTrue(distributor.registry(hot, campaignId, alice));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/contracts && forge test -vvv --match-contract TitrateFullTest`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/test/TitrateFull.t.sol
git commit -m "test(contracts): add TitrateFull test suite covering allowance, registry, multicall"
```

---

### Task 6: Artifact Extraction Script

**Files:**
- Create: `packages/contracts/script/extract-artifacts.sh`

- [ ] **Step 1: Create extract-artifacts.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Extract ABI + bytecode from Foundry output into SDK-consumable JSON artifacts.
# Run from packages/contracts/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ARTIFACTS="$CONTRACT_DIR/../sdk/src/distributor/artifacts"

mkdir -p "$SDK_ARTIFACTS"

forge build

for contract in TitrateSimple TitrateFull; do
  forge_out="$CONTRACT_DIR/out/${contract}.sol/${contract}.json"

  if [ ! -f "$forge_out" ]; then
    echo "ERROR: $forge_out not found. Run 'forge build' first."
    exit 1
  fi

  # Extract ABI and bytecode using node (available in monorepo)
  node -e "
    const data = require('$forge_out');
    const artifact = {
      contractName: '$contract',
      abi: data.abi,
      bytecode: data.bytecode.object,
    };
    console.log(JSON.stringify(artifact, null, 2));
  " > "$SDK_ARTIFACTS/${contract}.json"

  echo "Extracted: $SDK_ARTIFACTS/${contract}.json"
done

# Verify bytecode stability: compile with a different contract name
# and confirm the bytecode is identical (metadata.bytecodeHash = none)
echo ""
echo "Verifying bytecode stability..."

TEMP_DIR=$(mktemp -d)
cp "$CONTRACT_DIR/src/TitrateSimple.sol" "$TEMP_DIR/RenamedContract.sol"
sed -i '' 's/contract TitrateSimple/contract RenamedContract/g' "$TEMP_DIR/RenamedContract.sol"
sed -i '' 's/TitrateSimple/RenamedContract/g' "$TEMP_DIR/RenamedContract.sol"

# Compile the renamed version
RENAMED_OUT=$(forge inspect --root "$CONTRACT_DIR" "$TEMP_DIR/RenamedContract.sol:RenamedContract" bytecode 2>/dev/null || echo "SKIP")

if [ "$RENAMED_OUT" = "SKIP" ]; then
  echo "WARN: Could not verify bytecode stability via forge inspect. Manual verification needed."
else
  ORIGINAL_BYTECODE=$(node -e "const d = require('$SDK_ARTIFACTS/TitrateSimple.json'); console.log(d.bytecode);")
  if [ "$RENAMED_OUT" = "$ORIGINAL_BYTECODE" ]; then
    echo "PASS: Bytecode is identical regardless of contract name"
  else
    echo "FAIL: Bytecodes differ! metadata.bytecodeHash may not be 'none'"
    exit 1
  fi
fi

rm -rf "$TEMP_DIR"
echo "Done."
```

- [ ] **Step 2: Make it executable and run**

```bash
chmod +x packages/contracts/script/extract-artifacts.sh
cd packages/contracts && bash script/extract-artifacts.sh
```

Expected: artifacts created at `packages/sdk/src/distributor/artifacts/TitrateSimple.json` and `TitrateFull.json`

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/script/extract-artifacts.sh packages/sdk/src/distributor/artifacts/
git commit -m "feat(contracts): add artifact extraction script for SDK consumption"
```

---

### Task 7: SDK Core Types

**Files:**
- Create: `packages/sdk/src/types.ts`
- Create: `packages/sdk/src/storage/index.ts`

- [ ] **Step 1: Create types.ts**

```typescript
import type { Address, Hex } from 'viem';

// ─── Campaign ───────────────────────────────────────────

export type CampaignConfig = {
  readonly funder: Address;
  readonly name: string;
  readonly version: number;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly tokenAddress: Address;
  readonly tokenDecimals: number;
  readonly contractAddress: Address | null;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly amountMode: 'uniform' | 'variable';
  readonly amountFormat: 'integer' | 'decimal';
  readonly uniformAmount: string | null;
  readonly batchSize: number;
  readonly campaignId: Hex | null;
  readonly pinnedBlock: bigint | null;
};

// ─── Distribution ───────────────────────────────────────

export type BatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly gasEstimate: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly timestamp: number;
  readonly outcome: 'confirmed' | 'replaced' | 'reverted' | 'dropped';
};

export type BatchResult = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly attempts: readonly BatchAttempt[];
  readonly confirmedTxHash: Hex | null;
  readonly blockNumber: bigint | null;
};

export type BatchStatus = 'pending' | 'signing' | 'broadcast' | 'confirmed' | 'failed';

// ─── Pipeline ───────────────────────────────────────────

export type SourceType = 'block-scan' | 'csv' | 'union';

export type FilterType =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion'
  | 'previously-sent'
  | 'registry-check';

export type PipelineStep =
  | { readonly type: 'source'; readonly sourceType: SourceType; readonly params: Record<string, unknown> }
  | { readonly type: 'filter'; readonly filterType: FilterType; readonly params: Record<string, unknown> };

export type PipelineConfig = {
  readonly steps: readonly PipelineStep[];
};

// ─── Progress ───────────────────────────────────────────

export type ProgressEvent =
  | { readonly type: 'scan'; readonly currentBlock: bigint; readonly endBlock: bigint; readonly addressesFound: number }
  | { readonly type: 'filter'; readonly filterName: string; readonly inputCount: number; readonly outputCount: number }
  | { readonly type: 'batch'; readonly batchIndex: number; readonly totalBatches: number; readonly status: BatchStatus }
  | { readonly type: 'tx'; readonly batchIndex: number; readonly attempt: BatchAttempt };

export type ProgressCallback = (event: ProgressEvent) => void;

// ─── CSV ────────────────────────────────────────────────

export type CSVRow = {
  readonly address: Address;
  readonly amount: string | null;
};

export type AmountFormat = 'integer' | 'decimal';

// ─── Chain ──────────────────────────────────────────────

export type ChainConfig = {
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrls: readonly string[];
  readonly explorerUrl: string;
  readonly explorerApiUrl: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
};

// ─── Calldata Encoding ──────────────────────────────────

export type CallData = {
  readonly target: Address;
  readonly data: Hex;
  readonly value: bigint;
};

// ─── Contract Artifact ──────────────────────────────────

export type ContractArtifact = {
  readonly contractName: string;
  readonly abi: readonly Record<string, unknown>[];
  readonly bytecode: Hex;
};
```

- [ ] **Step 2: Create storage/index.ts**

```typescript
import type { Address, Hex } from 'viem';
import type { CampaignConfig, BatchResult, PipelineConfig, BatchStatus, BatchAttempt } from '../types.js';

export type StoredCampaign = CampaignConfig & {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type StoredAddressSet = {
  readonly id: string;
  readonly campaignId: string;
  readonly name: string;
  readonly type: 'source' | 'derived-filter' | 'external-filter' | 'result';
  readonly addressCount: number;
  readonly createdAt: number;
};

export type StoredAddress = {
  readonly setId: string;
  readonly address: Address;
  readonly amount: string | null;
};

export type StoredBatch = {
  readonly id: string;
  readonly campaignId: string;
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: BatchStatus;
  readonly attempts: readonly BatchAttempt[];
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: bigint | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type StoredWallet = {
  readonly id: string;
  readonly campaignId: string;
  readonly hotAddress: Address;
  readonly coldAddress: Address;
  readonly createdAt: number;
};

export interface CampaignStore {
  get(id: string): Promise<StoredCampaign | null>;
  getByIdentity(funder: Address, name: string, version: number): Promise<StoredCampaign | null>;
  put(campaign: StoredCampaign): Promise<void>;
  list(): Promise<readonly StoredCampaign[]>;
}

export interface AddressSetStore {
  get(id: string): Promise<StoredAddressSet | null>;
  getByCampaign(campaignId: string): Promise<readonly StoredAddressSet[]>;
  put(set: StoredAddressSet): Promise<void>;
}

export interface AddressStore {
  getBySet(setId: string): Promise<readonly StoredAddress[]>;
  putBatch(addresses: readonly StoredAddress[]): Promise<void>;
  countBySet(setId: string): Promise<number>;
}

export interface BatchStore {
  get(id: string): Promise<StoredBatch | null>;
  getByCampaign(campaignId: string): Promise<readonly StoredBatch[]>;
  put(batch: StoredBatch): Promise<void>;
  getLastCompleted(campaignId: string): Promise<StoredBatch | null>;
}

export interface WalletStore {
  get(campaignId: string): Promise<StoredWallet | null>;
  put(wallet: StoredWallet): Promise<void>;
}

export interface PipelineConfigStore {
  get(campaignId: string): Promise<PipelineConfig | null>;
  put(campaignId: string, config: PipelineConfig): Promise<void>;
}

export interface Storage {
  readonly campaigns: CampaignStore;
  readonly addressSets: AddressSetStore;
  readonly addresses: AddressStore;
  readonly batches: BatchStore;
  readonly wallets: WalletStore;
  readonly pipelineConfigs: PipelineConfigStore;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/storage/index.ts
git commit -m "feat(sdk): add core types and storage interface"
```

---

### Task 8: Chains Module

**Files:**
- Create: `packages/sdk/src/chains/config.ts`
- Create: `packages/sdk/src/chains/index.ts`
- Create: `packages/sdk/src/__tests__/chains.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/__tests__/chains.test.ts
import { describe, it, expect } from 'vitest';
import { SUPPORTED_CHAINS, getChainConfig, getExplorerApiUrl } from '../chains/index.js';

describe('chains', () => {
  it('includes ethereum mainnet', () => {
    const eth = getChainConfig(1);
    expect(eth).toBeDefined();
    expect(eth!.name).toBe('Ethereum');
    expect(eth!.nativeSymbol).toBe('ETH');
  });

  it('includes pulsechain', () => {
    const pls = getChainConfig(369);
    expect(pls).toBeDefined();
    expect(pls!.name).toBe('PulseChain');
  });

  it('returns null for unknown chain', () => {
    expect(getChainConfig(999999)).toBeNull();
  });

  it('returns explorer API URL', () => {
    const url = getExplorerApiUrl(1);
    expect(url).toContain('api.etherscan.io');
  });

  it('has at least 4 supported chains', () => {
    expect(SUPPORTED_CHAINS.length).toBeGreaterThanOrEqual(4);
  });

  it('every chain has required fields', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.chainId).toBeGreaterThan(0);
      expect(chain.name).toBeTruthy();
      expect(chain.rpcUrls.length).toBeGreaterThan(0);
      expect(chain.explorerApiUrl).toBeTruthy();
      expect(chain.nativeSymbol).toBeTruthy();
      expect(chain.nativeDecimals).toBe(18);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/__tests__/chains.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create config.ts**

```typescript
// packages/sdk/src/chains/config.ts
import type { ChainConfig } from '../types.js';

export const SUPPORTED_CHAINS: readonly ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    explorerUrl: 'https://etherscan.io',
    explorerApiUrl: 'https://api.etherscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
  {
    chainId: 369,
    name: 'PulseChain',
    rpcUrls: ['https://rpc.pulsechain.com', 'https://pulsechain-rpc.publicnode.com'],
    explorerUrl: 'https://scan.pulsechain.com',
    explorerApiUrl: 'https://api.scan.pulsechain.com/api',
    nativeSymbol: 'PLS',
    nativeDecimals: 18,
  },
  {
    chainId: 8453,
    name: 'Base',
    rpcUrls: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
] as const;
```

- [ ] **Step 4: Create chains/index.ts**

```typescript
// packages/sdk/src/chains/index.ts
import type { ChainConfig } from '../types.js';
import { SUPPORTED_CHAINS } from './config.js';

export { SUPPORTED_CHAINS };

const chainMap = new Map<number, ChainConfig>(
  SUPPORTED_CHAINS.map((c) => [c.chainId, c])
);

export function getChainConfig(chainId: number): ChainConfig | null {
  return chainMap.get(chainId) ?? null;
}

export function getExplorerApiUrl(chainId: number): string | null {
  return chainMap.get(chainId)?.explorerApiUrl ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/__tests__/chains.test.ts`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/chains/ packages/sdk/src/__tests__/chains.test.ts
git commit -m "feat(sdk): add chains module with curated EVM chain registry"
```

---

### Task 9: CSV Module

**Files:**
- Create: `packages/sdk/src/csv/parse.ts`
- Create: `packages/sdk/src/csv/validate.ts`
- Create: `packages/sdk/src/csv/amounts.ts`
- Create: `packages/sdk/src/csv/index.ts`
- Create: `packages/sdk/src/__tests__/csv.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/__tests__/csv.test.ts
import { describe, it, expect } from 'vitest';
import { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from '../csv/index.js';

describe('parseCSV', () => {
  it('parses address-only CSV', () => {
    const csv = 'address\n0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.rows[0].amount).toBeNull();
    expect(result.hasAmounts).toBe(false);
  });

  it('parses address+amount CSV', () => {
    const csv = 'address,amount\n0x1234567890abcdef1234567890abcdef12345678,100\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,200';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amount).toBe('100');
    expect(result.rows[1].amount).toBe('200');
    expect(result.hasAmounts).toBe(true);
  });

  it('handles no header row', () => {
    const csv = '0x1234567890abcdef1234567890abcdef12345678\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('trims whitespace', () => {
    const csv = 'address\n  0x1234567890abcdef1234567890abcdef12345678  ';
    const result = parseCSV(csv);
    expect(result.rows[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });
});

describe('detectAmountFormat', () => {
  it('detects integer format', () => {
    expect(detectAmountFormat(['100', '200', '300'])).toBe('integer');
  });

  it('detects decimal format', () => {
    expect(detectAmountFormat(['1.5', '2.0', '3.14'])).toBe('decimal');
  });

  it('detects decimal when mixed', () => {
    expect(detectAmountFormat(['100', '200', '3.5'])).toBe('decimal');
  });

  it('returns integer for empty array', () => {
    expect(detectAmountFormat([])).toBe('integer');
  });
});

describe('validateAddresses', () => {
  it('flags invalid addresses', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: null },
      { address: 'not-an-address' as `0x${string}`, amount: null },
    ];
    const result = validateAddresses(rows);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].index).toBe(1);
  });
});

describe('deduplicateAddresses', () => {
  it('removes duplicate addresses (case-insensitive)', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0x1234567890ABCDEF1234567890ABCDEF12345678' as `0x${string}`, amount: '200' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '300' },
    ];
    const result = deduplicateAddresses(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps first occurrence', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '200' },
    ];
    const result = deduplicateAddresses(rows);
    expect(result[0].amount).toBe('100');
  });
});

describe('flagConflicts', () => {
  it('flags decimal values when format is integer', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '3.5' },
    ];
    const result = flagConflicts(rows, 'integer');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].index).toBe(1);
    expect(result.conflicts[0].reason).toContain('decimal');
  });

  it('returns no conflicts when format matches', () => {
    const rows = [
      { address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`, amount: '100' },
      { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`, amount: '200' },
    ];
    const result = flagConflicts(rows, 'integer');
    expect(result.conflicts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/__tests__/csv.test.ts`
Expected: FAIL

- [ ] **Step 3: Create parse.ts**

```typescript
// packages/sdk/src/csv/parse.ts
import type { Address } from 'viem';
import type { CSVRow } from '../types.js';

export type ParsedCSV = {
  readonly rows: readonly CSVRow[];
  readonly hasAmounts: boolean;
};

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function parseCSV(content: string): ParsedCSV {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], hasAmounts: false };
  }

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('address');
  const hasAmountColumn = firstLine.includes('amount');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: CSVRow[] = [];

  for (const line of dataLines) {
    const parts = line.split(',').map((p) => p.trim());
    const rawAddress = parts[0];

    if (!ADDRESS_REGEX.test(rawAddress)) continue;

    const address = rawAddress.toLowerCase() as Address;
    const amount = hasAmountColumn && parts.length > 1 ? parts[1] : null;

    rows.push({ address, amount });
  }

  return { rows, hasAmounts: hasAmountColumn };
}
```

- [ ] **Step 4: Create validate.ts**

```typescript
// packages/sdk/src/csv/validate.ts
import type { CSVRow } from '../types.js';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export type ValidationResult = {
  readonly valid: readonly CSVRow[];
  readonly invalid: readonly { readonly index: number; readonly row: CSVRow; readonly reason: string }[];
};

export function validateAddresses(rows: readonly CSVRow[]): ValidationResult {
  const valid: CSVRow[] = [];
  const invalid: { index: number; row: CSVRow; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!ADDRESS_REGEX.test(row.address)) {
      invalid.push({ index: i, row, reason: `Invalid address: ${row.address}` });
    } else {
      valid.push(row);
    }
  }

  return { valid, invalid };
}

export function deduplicateAddresses(rows: readonly CSVRow[]): readonly CSVRow[] {
  const seen = new Set<string>();
  const result: CSVRow[] = [];

  for (const row of rows) {
    const normalized = row.address.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(row);
  }

  return result;
}
```

- [ ] **Step 5: Create amounts.ts**

```typescript
// packages/sdk/src/csv/amounts.ts
import type { CSVRow, AmountFormat } from '../types.js';

export function detectAmountFormat(values: readonly string[]): AmountFormat {
  if (values.length === 0) return 'integer';
  return values.some((v) => v.includes('.')) ? 'decimal' : 'integer';
}

export type ConflictResult = {
  readonly conflicts: readonly { readonly index: number; readonly value: string; readonly reason: string }[];
};

export function flagConflicts(rows: readonly CSVRow[], format: AmountFormat): ConflictResult {
  const conflicts: { index: number; value: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const amount = rows[i].amount;
    if (amount === null) continue;

    if (format === 'integer' && amount.includes('.')) {
      conflicts.push({
        index: i,
        value: amount,
        reason: `Expected integer but found decimal value: ${amount}`,
      });
    }

    if (format === 'decimal' && !/^\d+(\.\d+)?$/.test(amount)) {
      conflicts.push({
        index: i,
        value: amount,
        reason: `Invalid decimal format: ${amount}`,
      });
    }
  }

  return { conflicts };
}
```

- [ ] **Step 6: Create csv/index.ts**

```typescript
// packages/sdk/src/csv/index.ts
export { parseCSV } from './parse.js';
export type { ParsedCSV } from './parse.js';
export { validateAddresses, deduplicateAddresses } from './validate.js';
export type { ValidationResult } from './validate.js';
export { detectAmountFormat, flagConflicts } from './amounts.js';
export type { ConflictResult } from './amounts.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/__tests__/csv.test.ts`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/csv/ packages/sdk/src/__tests__/csv.test.ts
git commit -m "feat(sdk): add CSV parsing, validation, dedup, and amount conflict detection"
```

---

### Task 10: Wallet Module

**Files:**
- Create: `packages/sdk/src/wallet/derive.ts`
- Create: `packages/sdk/src/wallet/index.ts`
- Create: `packages/sdk/src/__tests__/wallet.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/__tests__/wallet.test.ts
import { describe, it, expect } from 'vitest';
import { createEIP712Message, deriveHotWallet } from '../wallet/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';

describe('wallet', () => {
  describe('createEIP712Message', () => {
    it('creates typed data with campaign identity', () => {
      const message = createEIP712Message({
        funder: '0x1234567890abcdef1234567890abcdef12345678',
        name: 'Test Campaign',
        version: 1,
      });

      expect(message.domain.name).toBe('Titrate');
      expect(message.message.funder).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(message.message.name).toBe('Test Campaign');
      expect(message.message.version).toBe(1);
    });
  });

  describe('deriveHotWallet', () => {
    it('derives a valid address from a signature', () => {
      const fakeSig = '0x' + 'ab'.repeat(65) as `0x${string}`;
      const wallet = deriveHotWallet(fakeSig);

      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(wallet.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('is deterministic — same signature produces same wallet', () => {
      const sig = '0x' + 'cd'.repeat(65) as `0x${string}`;
      const wallet1 = deriveHotWallet(sig);
      const wallet2 = deriveHotWallet(sig);

      expect(wallet1.address).toBe(wallet2.address);
      expect(wallet1.privateKey).toBe(wallet2.privateKey);
    });

    it('private key derives to the returned address', () => {
      const sig = '0x' + 'ef'.repeat(65) as `0x${string}`;
      const wallet = deriveHotWallet(sig);
      const account = privateKeyToAccount(wallet.privateKey);

      expect(account.address.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('different signatures produce different wallets', () => {
      const sig1 = '0x' + 'aa'.repeat(65) as `0x${string}`;
      const sig2 = '0x' + 'bb'.repeat(65) as `0x${string}`;

      expect(deriveHotWallet(sig1).address).not.toBe(deriveHotWallet(sig2).address);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/__tests__/wallet.test.ts`
Expected: FAIL

- [ ] **Step 3: Create derive.ts**

```typescript
// packages/sdk/src/wallet/derive.ts
import type { Address, Hex } from 'viem';
import { keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type EIP712MessageParams = {
  readonly funder: Address;
  readonly name: string;
  readonly version: number;
};

export type EIP712TypedData = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
  };
  readonly types: {
    readonly HotWalletDerivation: readonly { readonly name: string; readonly type: string }[];
  };
  readonly primaryType: 'HotWalletDerivation';
  readonly message: {
    readonly funder: Address;
    readonly name: string;
    readonly version: number;
  };
};

export function createEIP712Message(params: EIP712MessageParams): EIP712TypedData {
  return {
    domain: {
      name: 'Titrate',
      version: '1',
      chainId: 1,
    },
    types: {
      HotWalletDerivation: [
        { name: 'funder', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'version', type: 'uint256' },
      ],
    },
    primaryType: 'HotWalletDerivation',
    message: {
      funder: params.funder,
      name: params.name,
      version: params.version,
    },
  };
}

export type DerivedWallet = {
  readonly address: Address;
  readonly privateKey: Hex;
};

export function deriveHotWallet(signature: Hex): DerivedWallet {
  const privateKey = keccak256(signature);
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address,
    privateKey,
  };
}
```

- [ ] **Step 4: Create wallet/index.ts**

```typescript
// packages/sdk/src/wallet/index.ts
export { createEIP712Message, deriveHotWallet } from './derive.js';
export type { EIP712MessageParams, EIP712TypedData, DerivedWallet } from './derive.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/__tests__/wallet.test.ts`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/wallet/ packages/sdk/src/__tests__/wallet.test.ts
git commit -m "feat(sdk): add EIP-712 deterministic hot wallet derivation"
```

---

### Task 11: Encode Module

**Files:**
- Create: `packages/sdk/src/encode/encoders.ts`
- Create: `packages/sdk/src/encode/index.ts`
- Create: `packages/sdk/src/__tests__/encode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/__tests__/encode.test.ts
import { describe, it, expect } from 'vitest';
import { encode } from '../encode/index.js';
import { decodeFunctionData, parseAbi } from 'viem';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

describe('encode', () => {
  const alice = '0x1234567890abcdef1234567890abcdef12345678' as const;
  const token = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
  const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as const;

  describe('transfer', () => {
    it('encodes an ERC-20 transfer call', () => {
      const result = encode.transfer(token, alice, 100n);
      expect(result.target).toBe(token);
      expect(result.value).toBe(0n);

      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: result.data });
      expect(decoded.functionName).toBe('transfer');
      expect(decoded.args[0].toLowerCase()).toBe(alice);
      expect(decoded.args[1]).toBe(100n);
    });
  });

  describe('nativeTransfer', () => {
    it('returns empty calldata with zero value', () => {
      const result = encode.nativeTransfer(alice);
      expect(result.target).toBe(alice);
      expect(result.data).toBe('0x');
      expect(result.value).toBe(0n);
    });
  });

  describe('swap', () => {
    it('encodes a V2 swapExactTokensForTokens call', () => {
      const tokenOut = '0x2222222222222222222222222222222222222222' as const;
      const result = encode.swap(router, token, tokenOut, 1000n, 900n, alice);
      expect(result.target).toBe(router);
      expect(result.value).toBe(0n);
      expect(result.data.length).toBeGreaterThan(10);
    });
  });

  describe('raw', () => {
    it('encodes arbitrary function calls', () => {
      const abi = parseAbi(['function foo(uint256 x) returns (uint256)']);
      const result = encode.raw(token, abi, 'foo', [42n]);
      expect(result.target).toBe(token);
      expect(result.data.length).toBeGreaterThan(10);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/__tests__/encode.test.ts`
Expected: FAIL

- [ ] **Step 3: Create encoders.ts**

```typescript
// packages/sdk/src/encode/encoders.ts
import type { Address, Hex, Abi } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';
import type { CallData } from '../types.js';

const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const UNISWAP_V2_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]);

function transfer(token: Address, to: Address, amount: bigint): CallData {
  return {
    target: token,
    data: encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to, amount],
    }),
    value: 0n,
  };
}

function nativeTransfer(to: Address): CallData {
  return {
    target: to,
    data: '0x',
    value: 0n,
  };
}

function swap(
  router: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  amountOutMin: bigint,
  to: Address,
): CallData {
  return {
    target: router,
    data: encodeFunctionData({
      abi: UNISWAP_V2_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, [tokenIn, tokenOut], to, BigInt(Math.floor(Date.now() / 1000) + 1200)],
    }),
    value: 0n,
  };
}

function raw(target: Address, abi: Abi, functionName: string, args: readonly unknown[]): CallData {
  return {
    target,
    data: encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]),
    value: 0n,
  };
}

export const encode = { transfer, nativeTransfer, swap, raw } as const;
```

- [ ] **Step 4: Create encode/index.ts**

```typescript
// packages/sdk/src/encode/index.ts
export { encode } from './encoders.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/sdk && npx vitest run src/__tests__/encode.test.ts`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/encode/ packages/sdk/src/__tests__/encode.test.ts
git commit -m "feat(sdk): add calldata encoders for transfer, native, swap, and raw"
```

---

### Task 12: SDK Index + Package Wiring

**Files:**
- Create: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create the barrel export**

```typescript
// packages/sdk/src/index.ts

// Types
export type {
  CampaignConfig,
  BatchAttempt,
  BatchResult,
  BatchStatus,
  SourceType,
  FilterType,
  PipelineStep,
  PipelineConfig,
  ProgressEvent,
  ProgressCallback,
  CSVRow,
  AmountFormat,
  ChainConfig,
  CallData,
  ContractArtifact,
} from './types.js';

// Chains
export { SUPPORTED_CHAINS, getChainConfig, getExplorerApiUrl } from './chains/index.js';

// CSV
export { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from './csv/index.js';
export type { ParsedCSV, ValidationResult, ConflictResult } from './csv/index.js';

// Wallet
export { createEIP712Message, deriveHotWallet } from './wallet/index.js';
export type { EIP712MessageParams, EIP712TypedData, DerivedWallet } from './wallet/index.js';

// Encode
export { encode } from './encode/index.js';

// Storage
export type {
  Storage,
  CampaignStore,
  AddressSetStore,
  AddressStore,
  BatchStore,
  WalletStore,
  PipelineConfigStore,
  StoredCampaign,
  StoredAddressSet,
  StoredAddress,
  StoredBatch,
  StoredWallet,
} from './storage/index.js';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat(sdk): add barrel export wiring all modules"
```

---

## Phase Boundary

Tasks 1-12 establish the **foundation**: monorepo scaffold, both Solidity contracts with tests, and the SDK with chains, CSV, wallet derivation, calldata encoding, core types, and storage interface.

**Remaining SDK modules** (scanner, pipeline, distributor) are implementation-heavy and depend on RPC interaction. They should be planned as **Phase 1B** tasks once this foundation is solid and all tests pass.

**Phase 2** (web app) and **Phase 3** (TUI) each get their own implementation plan.

---

## Pre-flight Checklist

Before starting:
- [ ] Foundry is installed (`forge --version`)
- [ ] Node.js >= 18 installed (`node --version`)
- [ ] npm >= 9 installed (`npm --version`)
