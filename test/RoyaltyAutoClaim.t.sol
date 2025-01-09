// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/RoyaltyAutoClaim.sol";
import "./MockV2.sol";

contract RoyaltyAutoClaimTest is Test {
    RoyaltyAutoClaim v1;
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address token = vm.addr(3);
    address[] reviewers = new address[](3);
    UUPSProxy proxy;

    function setUp() public {
        reviewers[0] = vm.addr(4);
        reviewers[1] = vm.addr(5);
        reviewers[2] = vm.addr(6);

        v1 = new RoyaltyAutoClaim();
        proxy =
            new UUPSProxy(address(v1), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers)));

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v1));
    }

    function test_upgradeToAndCall() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();
        vm.prank(vm.addr(123));
        vm.expectRevert();
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));
        vm.prank(owner);
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));
        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v2));
    }
}
