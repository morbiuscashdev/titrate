// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title TitrateFull
/// @notice Batch distributor with operator allowance, on-chain registry, and multicall.
contract TitrateFull {

    error LengthMismatch();
    error NotAuthorized();
    error NativeFromMustBeSender();
    error InsufficientAllowance();
    error CallFailed();
    error RefundFailed();

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
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
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
        if (recipients.length != amounts.length) revert LengthMismatch();
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
        if (targets.length != calldatas.length) revert LengthMismatch();
        if (targets.length != values.length) revert LengthMismatch();

        uint256 len = targets.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = targets[i].call{value: values[i]}(calldatas[i]);
            if (!ok) revert CallFailed();
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
        uint256 len = data.length;
        results = new bytes[](len);
        for (uint256 i; i < len; ) {
            (bool ok, bytes memory result) = address(this).delegatecall(data[i]);
            if (!ok) revert CallFailed();
            results[i] = result;
            unchecked { ++i; }
        }
    }

    // ─── Internals ──────────────────────────────────────

    function _resolveSource(address from, bool isNative, bytes4 selector)
        internal view returns (address)
    {
        if (from == address(0)) return msg.sender;
        if (isNative) revert NativeFromMustBeSender();
        if (allowance[from][msg.sender][selector] == 0) revert NotAuthorized();
        return from;
    }

    function _deductAllowance(address from, bytes4 selector, uint256 total) internal {
        uint256 current = allowance[from][msg.sender][selector];
        if (current < total) revert InsufficientAllowance();
        allowance[from][msg.sender][selector] = current - total;
    }

    function _sum(uint256[] calldata values) internal pure returns (uint256 total) {
        uint256 len = values.length;
        for (uint256 i; i < len; ) {
            total += values[i];
            unchecked { ++i; }
        }
    }

    function _sendNative(
        address[] calldata recipients, uint256[] calldata amounts,
        address source, bytes32 campaignId
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            if (!ok) revert CallFailed();
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendNativeSimple(
        address[] calldata recipients, uint256 amount,
        address source, bytes32 campaignId
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = recipients[i].call{value: amount}("");
            if (!ok) revert CallFailed();
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendToken(
        address token, address source,
        address[] calldata recipients, uint256[] calldata amounts,
        bytes32 campaignId
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
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
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
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
            if (!ok) revert RefundFailed();
        }
    }
}
