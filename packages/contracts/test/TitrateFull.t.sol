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

    // ─── Fuzz Tests ───────────────────────────────────────────────────────────

    /// @dev Fuzz 1: Allowance never goes negative — remaining allowance always
    ///   equals initial minus total distributed, and never underflows.
    function test_fuzz_allowance_decrements_correctly(
        uint128 approveAmount,
        uint8 recipientCount
    ) public {
        // Bound inputs to safe ranges
        recipientCount = uint8(bound(recipientCount, 1, 50));
        uint256 perRecipient = uint256(approveAmount) / recipientCount;
        vm.assume(perRecipient > 0);

        uint256 totalDistributed = perRecipient * recipientCount;
        vm.assume(totalDistributed <= uint256(approveAmount));

        // Give cold enough tokens
        token.mint(cold, uint256(approveAmount));

        // Approve hot for the exact approveAmount
        vm.prank(cold);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, uint256(approveAmount));

        uint256 before = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);
        assertEq(before, uint256(approveAmount));

        // Build recipients array
        address[] memory recipients = new address[](recipientCount);
        for (uint256 i; i < recipientCount; i++) {
            recipients[i] = address(uint160(0x1000 + i));
        }

        // Disperse
        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, perRecipient, bytes32(0));

        uint256 after_ = distributor.allowance(cold, hot, TitrateFull.disperseSimple.selector);

        // Invariant: remaining == initial - distributed, no underflow
        assertEq(after_, before - totalDistributed);
        // Explicit underflow check: after_ must be <= before
        assertLe(after_, before);
    }

    /// @dev Fuzz 2: Allowance is selector-scoped — approving one selector
    ///   does not affect another selector's allowance.
    function test_fuzz_allowance_selector_scoped(
        uint128 amountA,
        uint128 amountB
    ) public {
        bytes4 selA = TitrateFull.disperse.selector;
        bytes4 selB = TitrateFull.disperseSimple.selector;

        // Set allowances for two different selectors
        vm.startPrank(cold);
        distributor.approve(hot, selA, uint256(amountA));
        distributor.approve(hot, selB, uint256(amountB));
        vm.stopPrank();

        // Verify they are fully independent
        assertEq(distributor.allowance(cold, hot, selA), uint256(amountA));
        assertEq(distributor.allowance(cold, hot, selB), uint256(amountB));

        // Changing selA doesn't affect selB
        vm.prank(cold);
        distributor.approve(hot, selA, 0);

        assertEq(distributor.allowance(cold, hot, selA), 0);
        assertEq(distributor.allowance(cold, hot, selB), uint256(amountB));

        // Changing selB doesn't affect selA
        vm.prank(cold);
        distributor.approve(hot, selB, type(uint256).max);

        assertEq(distributor.allowance(cold, hot, selA), 0);
        assertEq(distributor.allowance(cold, hot, selB), type(uint256).max);
    }

    /// @dev Fuzz 3: increaseAllowance is additive — approve(a) then
    ///   increaseAllowance(b) always results in exactly a + b.
    function test_fuzz_increaseAllowance_additive(uint128 a, uint128 b) public {
        bytes4 sel = TitrateFull.disperseSimple.selector;

        vm.prank(cold);
        distributor.approve(hot, sel, uint256(a));

        vm.prank(cold);
        distributor.increaseAllowance(hot, sel, uint256(b));

        uint256 expected = uint256(a) + uint256(b);
        assertEq(distributor.allowance(cold, hot, sel), expected);
    }

    /// @dev Fuzz 4: Registry is append-only — once set to true, it never
    ///   reverts to false even if disperse is called again.
    function test_fuzz_registry_append_only(
        address recipient,
        bytes32 firstCampaign,
        bytes32 secondCampaign
    ) public {
        // Require a real recipient (not zero address or the distributor itself)
        vm.assume(recipient != address(0));
        vm.assume(recipient != address(distributor));
        vm.assume(recipient != address(token));
        // Require a non-zero campaignId so registry is actually written
        vm.assume(firstCampaign != bytes32(0));
        // Guard against recipient being a precompile or system contract
        vm.assume(uint160(recipient) > 9);

        // Give cold enough tokens for two dispersals
        token.mint(cold, 1_000e8);
        vm.prank(cold);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, 1_000e8);

        address[] memory recipients = new address[](1);
        recipients[0] = recipient;

        // First disperse — should set registry[cold][firstCampaign][recipient] = true
        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 1e8, firstCampaign);

        assertTrue(distributor.registry(cold, firstCampaign, recipient));

        // Second disperse with a different campaignId — first entry must remain true
        if (secondCampaign != bytes32(0) && secondCampaign != firstCampaign) {
            token.mint(cold, 1_000e8);
            vm.prank(cold);
            distributor.increaseAllowance(hot, TitrateFull.disperseSimple.selector, 1_000e8);

            vm.prank(hot);
            distributor.disperseSimple(address(token), cold, recipients, 1e8, secondCampaign);

            // The first campaign's registry entry must still be true
            assertTrue(distributor.registry(cold, firstCampaign, recipient));
            // The second campaign's entry was also set
            assertTrue(distributor.registry(cold, secondCampaign, recipient));
        }

        // Calling disperse again with same campaignId must not flip registry to false
        token.mint(cold, 1_000e8);
        vm.prank(cold);
        distributor.increaseAllowance(hot, TitrateFull.disperseSimple.selector, 1_000e8);

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, recipients, 1e8, firstCampaign);

        assertTrue(distributor.registry(cold, firstCampaign, recipient));
    }

    /// @dev Fuzz 5: Refund dust invariant — for native token disperse,
    ///   msg.value - sum(amounts) is always refunded to the caller.
    function test_fuzz_refund_dust_invariant(
        uint64 msgValue,
        uint8 recipientCount,
        uint64 perAmount
    ) public {
        // Bound to ensure we have dust and recipients don't drain more than msgValue
        recipientCount = uint8(bound(recipientCount, 1, 20));
        // Ensure perAmount is positive and total doesn't exceed msgValue
        vm.assume(perAmount > 0);
        uint256 total = uint256(perAmount) * uint256(recipientCount);
        vm.assume(total <= uint256(msgValue));
        // Ensure there's actual dust to refund (total < msgValue)
        vm.assume(total < uint256(msgValue));

        address caller = makeAddr("dust-caller");
        vm.deal(caller, uint256(msgValue));

        address[] memory recipients = new address[](recipientCount);
        for (uint256 i; i < recipientCount; i++) {
            // Use addresses that can receive ETH (EOA-style)
            recipients[i] = address(uint160(0x5000 + i));
        }

        uint256 callerBefore = caller.balance;

        vm.prank(caller);
        distributor.disperseSimple{value: uint256(msgValue)}(
            address(0),
            address(0),
            recipients,
            uint256(perAmount),
            bytes32(0)
        );

        uint256 dust = uint256(msgValue) - total;
        uint256 callerAfter = caller.balance;

        // Caller should have received back exactly the dust
        assertEq(callerAfter, callerBefore - total);
        assertEq(callerAfter, callerBefore - uint256(msgValue) + dust);

        // Each recipient received perAmount
        for (uint256 i; i < recipientCount; i++) {
            assertEq(recipients[i].balance, uint256(perAmount));
        }
    }

    /// @dev Fuzz 6: No double-send via registry — registry accurately tracks
    ///   all recipients across multiple disperse calls with the same campaignId.
    function test_fuzz_registry_tracks_all_recipients(
        uint8 firstCount,
        uint8 secondCount
    ) public {
        firstCount = uint8(bound(firstCount, 1, 10));
        secondCount = uint8(bound(secondCount, 1, 10));

        bytes32 campaign = keccak256("fuzz-campaign");
        uint256 totalNeeded = (uint256(firstCount) + uint256(secondCount)) * 1e8;

        token.mint(cold, totalNeeded);
        vm.prank(cold);
        distributor.approve(hot, TitrateFull.disperseSimple.selector, totalNeeded);

        // First batch: recipients at indices 0x8000..0x8000+firstCount
        address[] memory firstBatch = new address[](firstCount);
        for (uint256 i; i < firstCount; i++) {
            firstBatch[i] = address(uint160(0x8000 + i));
        }

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, firstBatch, 1e8, campaign);

        // Verify first batch is all recorded
        for (uint256 i; i < firstCount; i++) {
            assertTrue(distributor.registry(cold, campaign, firstBatch[i]));
        }

        // Second batch: recipients at indices 0x9000..0x9000+secondCount (distinct)
        address[] memory secondBatch = new address[](secondCount);
        for (uint256 i; i < secondCount; i++) {
            secondBatch[i] = address(uint160(0x9000 + i));
        }

        vm.prank(hot);
        distributor.disperseSimple(address(token), cold, secondBatch, 1e8, campaign);

        // All from both batches should now be recorded
        for (uint256 i; i < firstCount; i++) {
            assertTrue(distributor.registry(cold, campaign, firstBatch[i]));
        }
        for (uint256 i; i < secondCount; i++) {
            assertTrue(distributor.registry(cold, campaign, secondBatch[i]));
        }
    }
}
