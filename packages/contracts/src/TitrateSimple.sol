// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title TitrateSimple
/// @notice Minimal batch distributor. No auth, no registry.
contract TitrateSimple {

    error LengthMismatch();
    error CallFailed();
    error RefundFailed();

    /// @notice Distribute variable token amounts to each recipient
    /// @param token ERC-20 address, or address(0) for native
    function disperse(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        if (recipients.length != amounts.length) revert LengthMismatch();
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
        if (targets.length != calldatas.length) revert LengthMismatch();
        if (targets.length != values.length) revert LengthMismatch();
        uint256 len = targets.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = targets[i].call{value: values[i]}(calldatas[i]);
            if (!ok) revert CallFailed();
            unchecked { ++i; }
        }
        _refundDust();
    }

    function _sendNative(
        address[] calldata recipients, uint256[] calldata amounts
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            if (!ok) revert CallFailed();
            unchecked { ++i; }
        }
    }

    function _sendNativeSimple(
        address[] calldata recipients, uint256 amount
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            (bool ok, ) = recipients[i].call{value: amount}("");
            if (!ok) revert CallFailed();
            unchecked { ++i; }
        }
    }

    function _sendToken(
        address token, address[] calldata recipients, uint256[] calldata amounts
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            IERC20(token).transferFrom(msg.sender, recipients[i], amounts[i]);
            unchecked { ++i; }
        }
    }

    function _sendTokenSimple(
        address token, address[] calldata recipients, uint256 amount
    ) internal {
        uint256 len = recipients.length;
        for (uint256 i; i < len; ) {
            IERC20(token).transferFrom(msg.sender, recipients[i], amount);
            unchecked { ++i; }
        }
    }

    function _refundDust() internal {
        if (address(this).balance > 0) {
            (bool ok, ) = msg.sender.call{value: address(this).balance}("");
            if (!ok) revert RefundFailed();
        }
    }
}
