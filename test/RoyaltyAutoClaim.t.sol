// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../src/RoyaltyAutoClaim.sol";
import "./MockV2.sol";
import "./AATest.t.sol";

contract RoyaltyAutoClaimTest is AATest {
    RoyaltyAutoClaim royaltyAutoClaim;
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address token = vm.addr(3);
    address[] reviewers = new address[](3);
    UUPSProxy proxy;

    function setUp() public override {
        super.setUp();

        reviewers[0] = vm.addr(4);
        reviewers[1] = vm.addr(5);
        reviewers[2] = vm.addr(6);

        royaltyAutoClaim = new RoyaltyAutoClaim();
        proxy = new UUPSProxy(
            address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers))
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(royaltyAutoClaim));

        // deal
        vm.deal(address(proxy), 100 ether);
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

    function test_upgradeToAndCall_4337() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();
        address aaSender = address(proxy);

        PackedUserOperation memory userOp = createUserOp();
        userOp.sender = aaSender;
        userOp.nonce = entryPoint.getNonce(aaSender, 0);
        userOp.callData = abi.encodeCall(
            royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(0xbeef, ECDSA.toEthSignedMessageHash(entryPoint.getUserOpHash(userOp)));
        userOp.signature = abi.encodePacked(r, s, v);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        userOp = createUserOp();
        userOp.sender = aaSender;
        userOp.nonce = entryPoint.getNonce(aaSender, 0);
        userOp.callData = abi.encodeCall(
            royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
        );
        console.log("owner", owner);

        (v, r, s) = vm.sign(1, ECDSA.toEthSignedMessageHash(entryPoint.getUserOpHash(userOp)));
        userOp.signature = abi.encodePacked(r, s, v);
        handleUserOp(userOp);

        assertEq(address(uint160(uint256(vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2));
    }
}
