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
