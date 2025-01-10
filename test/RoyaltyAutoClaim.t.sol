// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../src/RoyaltyAutoClaim.sol";
import "./MockV2.sol";
import "./AATest.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

contract RoyaltyAutoClaimTest is AATest {
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address[] reviewers = new address[](3);

    RoyaltyAutoClaim royaltyAutoClaim;
    UUPSProxy proxy;
    IERC20 token;

    function setUp() public override {
        super.setUp();

        reviewers[0] = vm.addr(3);
        reviewers[1] = vm.addr(4);

        token = new MockERC20(owner);

        royaltyAutoClaim = new RoyaltyAutoClaim();
        proxy = new UUPSProxy(
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(token), reviewers))
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(royaltyAutoClaim));

        // deal
        vm.deal(address(proxy), 100 ether);
        vm.prank(owner);
        token.transfer(address(proxy), 100 ether);

        // log
        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer 0", reviewers[0]);
        console.log("reviewer 1", reviewers[1]);
    }

    function test_upgradeToAndCall() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();

        vm.prank(vm.addr(0xbeef));
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

    function test_flow() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        (address royaltyRecipient, uint8 reviewCount, uint16 totalRoyaltyLevel) =
            RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(royaltyRecipient, submitter);
        assertEq(reviewCount, 0);
        assertEq(totalRoyaltyLevel, 0);

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 0 ether);

        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 30 ether);

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(submitter), 30 ether);
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether);
    }
}
