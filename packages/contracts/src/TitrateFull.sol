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
