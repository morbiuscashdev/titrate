// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/TitrateFull.sol";
import "./helpers/MockERC20.sol";

/// @dev A contract that unconditionally rejects incoming ETH transfers.
contract ETHRejecter {
    receive() external payable {
        revert("ETH rejected");
    }
}

/// @dev A contract that rejects ETH only when a flag is set.
/// Used to test the _refundDust failure path: the distributor calls
/// `msg.sender.call{value:...}("")` and we need msg.sender to reject.
contract ConditionalRejecter {
    bool public rejectETH;
    TitrateFull public distributor;

    constructor(TitrateFull _distributor) {
        distributor = _distributor;
    }

    function setRejectETH(bool _reject) external {
        rejectETH = _reject;
    }

    receive() external payable {
        if (rejectETH) revert("ETH rejected");
    }

    function callDisperse(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        distributor.disperse{value: msg.value}(token, address(0), recipients, amounts, bytes32(0));
    }

    function callDisperseSimple(
        address token,
        address[] calldata recipients,
        uint256 amount
    ) external payable {
        distributor.disperseSimple{value: msg.value}(token, address(0), recipients, amount, bytes32(0));
    }
}

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

        token.mint(cold, 10_000_000e8);
        vm.startPrank(cold);
        token.approve(address(distributor), type(uint256).max);
        distributor.approve(hot, TitrateFull.disperse.selector, 1_000_000e8);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, 1_000_000e8);
        vm.stopPrank();

        vm.deal(hot, 10 ether);
    }

    function test_disperse_self() public {
        token.mint(hot, 1000e8);
        vm.prank(hot);
        token.approve(address(distributor), type(uint256).max);

        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e8; amounts[1] = 200e8;

        vm.prank(hot);
        distributor.disperse(address(token), address(0), recipients, amounts, bytes32(0));

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    function test_disperse_on_behalf() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e8; amounts[1] = 200e8;

        vm.prank(hot);
        distributor.disperse(address(token), cold, recipients, amounts, bytes32(0));

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
    }

    function test_allowance_decrements() public {
        uint256 before = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);

        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, bytes32(0));

        uint256 after_ = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);
        assertEq(before - after_, 200e8);
    }

    function test_allowance_blocks_wrong_selector() public {
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
        recipients[0] = alice; recipients[1] = bob;

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

    function test_registry_records_when_campaignId_set() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;

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
        recipients[0] = alice; recipients[1] = bob;

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 100e8, campaignId);

        address[] memory toCheck = new address[](3);
        toCheck[0] = alice; toCheck[1] = bob; toCheck[2] = carol;

        bool[] memory results = distributor.checkRecipients(cold, campaignId, toCheck);
        assertTrue(results[0]);
        assertTrue(results[1]);
        assertFalse(results[2]);
    }

    function test_disperse_native_self() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether; amounts[1] = 2 ether;

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

    // ─── Branch coverage additions ────────────────────────────────────────────

    function test_disperse_reverts_mismatched_lengths() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](1); // mismatch
        amounts[0] = 100e8;

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperse(address(token), cold, recipients, amounts, bytes32(0));
    }

    function test_refundDust_no_op_when_balance_is_zero() public {
        // Call disperseSimple with exact ETH — no dust to refund
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;

        uint256 hotBefore = hot.balance;

        vm.prank(hot);
        distributor.disperseSimple{value: 2 ether}(address(0), address(0), recipients, 1 ether, bytes32(0));

        // After sending exactly 2 ether (1 ether each to alice and bob), no dust remains.
        // _refundDust runs but the balance > 0 branch is false.
        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 1 ether);
        // Hot gets back what it didn't spend (nothing, all was sent)
        assertApproxEqAbs(hot.balance, hotBefore - 2 ether, 0.01 ether);
    }

    function test_refundDust_returns_excess_native() public {
        // Send more ETH than needed — dust should be refunded
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0.5 ether;

        uint256 hotBefore = hot.balance;

        vm.prank(hot);
        distributor.disperse{value: 1 ether}(address(0), address(0), recipients, amounts, bytes32(0));

        assertEq(alice.balance, 0.5 ether);
        // Hot should have been refunded ~0.5 ether dust
        assertApproxEqAbs(hot.balance, hotBefore - 0.5 ether, 0.01 ether);
    }

    function test_disperseCall_reverts_mismatched_targets_calldatas() public {
        address[] memory targets = new address[](2);
        targets[0] = address(token); targets[1] = address(token);
        bytes[] memory calldatas = new bytes[](1); // mismatch
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);
        uint256[] memory values = new uint256[](2);
        address[] memory registryRecipients = new address[](0);

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperseCall(targets, calldatas, values, bytes32(0), registryRecipients);
    }

    function test_disperseCall_reverts_mismatched_targets_values() public {
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);
        uint256[] memory values = new uint256[](2); // mismatch
        address[] memory registryRecipients = new address[](0);

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperseCall(targets, calldatas, values, bytes32(0), registryRecipients);
    }

    function test_disperseCall_without_registry_recipients() public {
        // Call disperseCall with an empty registryRecipients array —
        // the `registryRecipients.length > i` condition is always false, so no registry entries.
        token.mint(address(distributor), 200e8);

        address[] memory targets = new address[](1);
        targets[0] = address(token);
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);
        uint256[] memory values = new uint256[](1);
        address[] memory registryRecipients = new address[](0); // empty

        vm.prank(hot);
        distributor.disperseCall(targets, calldatas, values, campaignId, registryRecipients);

        assertEq(token.balanceOf(alice), 100e8);
        // No registry entry should have been recorded
        assertFalse(distributor.registry(hot, campaignId, alice));
    }

    function test_disperseCall_zero_campaignId_skips_registry() public {
        // When campaignId is bytes32(0), even if registryRecipients is provided,
        // no registry entry is recorded.
        token.mint(address(distributor), 200e8);

        address[] memory targets = new address[](1);
        targets[0] = address(token);
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, 100e8);
        uint256[] memory values = new uint256[](1);
        address[] memory registryRecipients = new address[](1);
        registryRecipients[0] = alice;

        vm.prank(hot);
        distributor.disperseCall(targets, calldatas, values, bytes32(0), registryRecipients);

        assertEq(token.balanceOf(alice), 100e8);
        assertFalse(distributor.registry(hot, bytes32(0), alice));
    }

    function test_multicall_reverts_on_failed_delegatecall() public {
        // Encode a call that will revert inside multicall
        bytes[] memory calls = new bytes[](1);
        // Call a non-existent function selector — delegatecall will return false
        calls[0] = abi.encodeWithSelector(bytes4(0xdeadbeef));

        vm.prank(hot);
        vm.expectRevert();
        distributor.multicall(calls);
    }

    function test_checkRecipients_empty_list() public {
        address[] memory toCheck = new address[](0);
        bool[] memory results = distributor.checkRecipients(cold, campaignId, toCheck);
        assertEq(results.length, 0);
    }

    function test_disperse_self_with_zero_from() public {
        // When from == address(0), _resolveSource returns msg.sender (hot)
        // and the allowance deduction is skipped (from != address(0) is false).
        token.mint(hot, 500e8);
        vm.prank(hot);
        token.approve(address(distributor), type(uint256).max);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e8;

        // from = address(0) → self-disperse, no allowance check
        vm.prank(hot);
        distributor.disperse(address(token), address(0), recipients, amounts, bytes32(0));

        assertEq(token.balanceOf(alice), 100e8);
    }

    function test_disperseSimple_self_with_zero_from() public {
        // When from == address(0) in disperseSimple, _resolveSource returns msg.sender.
        token.mint(hot, 500e8);
        vm.prank(hot);
        token.approve(address(distributor), type(uint256).max);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;

        // from = address(0) → self-disperse, no allowance deduction
        vm.prank(hot);
        distributor.disperseSimple(address(token), address(0), recipients, 50e8, bytes32(0));

        assertEq(token.balanceOf(bob), 50e8);
    }

    function test_sendNative_reverts_on_recipient_rejection() public {
        // Deploy a contract that rejects ETH — triggers the require(ok) false branch
        // in _sendNative (line 159).
        ETHRejecter rejecter = new ETHRejecter();

        address[] memory recipients = new address[](1);
        recipients[0] = address(rejecter);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperse{value: 1 ether}(address(0), address(0), recipients, amounts, bytes32(0));
    }

    function test_sendNativeSimple_reverts_on_recipient_rejection() public {
        // Deploy a contract that rejects ETH — triggers the require(ok) false branch
        // in _sendNativeSimple (line 171).
        ETHRejecter rejecter = new ETHRejecter();

        address[] memory recipients = new address[](1);
        recipients[0] = address(rejecter);

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperseSimple{value: 1 ether}(address(0), address(0), recipients, 1 ether, bytes32(0));
    }

    function test_disperseCall_reverts_on_failed_external_call() public {
        // Call disperseCall with a target that will fail — triggers require(ok) false branch.
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        bytes[] memory calldatas = new bytes[](1);
        // Try to transfer more than the distributor has — will revert
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", alice, type(uint256).max);
        uint256[] memory values = new uint256[](1);
        address[] memory registryRecipients = new address[](0);

        vm.prank(hot);
        vm.expectRevert();
        distributor.disperseCall(targets, calldatas, values, bytes32(0), registryRecipients);
    }

    function test_refundDust_reverts_when_sender_rejects_eth() public {
        // Use ConditionalRejecter as the caller — it rejects ETH after the disperse call,
        // triggering the require(ok) false branch in _refundDust (line 211).
        ConditionalRejecter rejecter = new ConditionalRejecter(distributor);
        vm.deal(address(rejecter), 10 ether);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0.5 ether; // send less than 1 ether so there's dust

        // Enable ETH rejection before the call so when _refundDust tries to send back
        // the remaining 0.5 ether dust, the rejecter's receive() reverts.
        rejecter.setRejectETH(true);

        vm.expectRevert();
        rejecter.callDisperse{value: 1 ether}(address(0), recipients, amounts);
    }
}
