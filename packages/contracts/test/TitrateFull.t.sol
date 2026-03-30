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
}
