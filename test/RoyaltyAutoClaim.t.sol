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

        assertEq(RoyaltyAutoClaim(address(proxy)).owner(), owner);
        assertEq(RoyaltyAutoClaim(address(proxy)).admin(), admin);
        assertEq(RoyaltyAutoClaim(address(proxy)).token(), token);
        assertEq(RoyaltyAutoClaim(address(proxy)).reviewers(0), reviewers[0]);
        assertEq(RoyaltyAutoClaim(address(proxy)).reviewers(1), reviewers[1]);
        assertEq(RoyaltyAutoClaim(address(proxy)).reviewers(2), reviewers[2]);
        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v1));
    }

    function test_upgradeToAndCall() public {
        address newOwner = vm.randomAddress();
        address newAdmin = vm.randomAddress();
        address newToken = vm.randomAddress();
        address[] memory newReviewers = new address[](3);
        newReviewers[0] = vm.randomAddress();
        newReviewers[1] = vm.randomAddress();

        MockV2 v2 = new MockV2();

        vm.prank(owner);
        MockV2(address(proxy)).upgradeToAndCall(
            address(v2), abi.encodeCall(MockV2.initialize, (newOwner, newAdmin, newToken, newReviewers))
        );

        assertEq(MockV2(address(proxy)).owner(), newOwner);
        assertEq(MockV2(address(proxy)).admin(), newAdmin);
        assertEq(MockV2(address(proxy)).token(), newToken);
        assertEq(MockV2(address(proxy)).reviewers(0), newReviewers[0]);
        assertEq(MockV2(address(proxy)).reviewers(1), newReviewers[1]);

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v2));
    }
}
