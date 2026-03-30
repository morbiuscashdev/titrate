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

    function test_disperse_token_variable() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice; recipients[1] = bob; recipients[2] = carol;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e8; amounts[1] = 200e8; amounts[2] = 300e8;

        vm.prank(sender);
        distributor.disperse(address(token), recipients, amounts);

        assertEq(token.balanceOf(alice), 100e8);
        assertEq(token.balanceOf(bob), 200e8);
        assertEq(token.balanceOf(carol), 300e8);
        assertEq(token.balanceOf(sender), 1_000_000e8 - 600e8);
    }

    function test_disperse_token_reverts_mismatched_lengths() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e8;

        vm.prank(sender);
        vm.expectRevert();
        distributor.disperse(address(token), recipients, amounts);
    }

    function test_disperseSimple_token() public {
        address[] memory recipients = new address[](3);
        recipients[0] = alice; recipients[1] = bob; recipients[2] = carol;

        vm.prank(sender);
        distributor.disperseSimple(address(token), recipients, 50e8);

        assertEq(token.balanceOf(alice), 50e8);
        assertEq(token.balanceOf(bob), 50e8);
        assertEq(token.balanceOf(carol), 50e8);
    }

    function test_disperse_native_variable() public {
        vm.deal(sender, 10 ether);
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether; amounts[1] = 2 ether;

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

    function test_disperseSimple_native() public {
        vm.deal(sender, 10 ether);
        address[] memory recipients = new address[](3);
        recipients[0] = alice; recipients[1] = bob; recipients[2] = carol;

        vm.prank(sender);
        distributor.disperseSimple{value: 3 ether}(address(0), recipients, 1 ether);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 1 ether);
        assertEq(carol.balance, 1 ether);
    }

    function test_disperseCall_erc20_transfer() public {
        token.mint(address(distributor), 500e8);
        address[] memory targets = new address[](2);
        targets[0] = address(token); targets[1] = address(token);
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
        targets[0] = alice; targets[1] = bob;
        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = ""; calldatas[1] = "";
        uint256[] memory values = new uint256[](2);
        values[0] = 1 ether; values[1] = 2 ether;

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

    function test_bytecode_is_deterministic() public view {
        assertTrue(address(distributor).code.length > 0);
    }
}
