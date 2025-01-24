// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import "../utils/MockV2.sol";
import "../utils/AATest.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

contract RoyaltyAutoClaim_E2E_Test is AATest {
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address[] initialReviewers = new address[](3);

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;

    IERC20 token;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function setUp() public override {
        super.setUp();

        initialReviewers[0] = vm.addr(3);
        initialReviewers[1] = vm.addr(4);

        token = new MockERC20(owner);

        impl = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
            address(impl), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(token), initialReviewers))
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(impl));

        // deal
        vm.deal(address(proxy), 100 ether);
        vm.prank(owner);
        token.transfer(address(proxy), 100 ether);

        royaltyAutoClaim = RoyaltyAutoClaim(payable(address(proxy)));

        // log
        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer 0", initialReviewers[0]);
        console.log("reviewer 1", initialReviewers[1]);
    }

    function test_simple_flow() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );

        vm.expectRevert();
        royaltyAutoClaim.claimRoyalty("test");

        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);

        vm.expectRevert();
        royaltyAutoClaim.claimRoyalty("test");
        assertEq(royaltyAutoClaim.getRoyalty("test"), 0 ether, "Royalty should be 0");

        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        assertEq(royaltyAutoClaim.getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        royaltyAutoClaim.claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }

    function test_simple_flow_4337() public {
        // Setup submitter
        address submitter = vm.randomAddress();

        // Register submission via admin
        PackedUserOperation memory userOp = _buildUserOp(
            2, // admin's private key
            address(proxy),
            abi.encodeCall(royaltyAutoClaim.registerSubmission, ("test", submitter))
        );
        handleUserOp(userOp);

        // Verify submission state
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );

        // Try to claim before reviews - should fail
        userOp = _buildUserOp(0xbeef, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        handleUserOp(userOp);

        // First review
        userOp = _buildUserOp(3, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 20))); // reviewer 0
        handleUserOp(userOp);

        // Try to claim after one review - should still fail
        userOp = _buildUserOp(0xbeef, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        handleUserOp(userOp);
        assertEq(royaltyAutoClaim.getRoyalty("test"), 0 ether, "Royalty should be 0");

        // Second review
        userOp = _buildUserOp(4, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 40))); // reviewer 1
        handleUserOp(userOp);

        assertEq(royaltyAutoClaim.getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        // Record balances before claim
        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        // Claim royalty
        userOp = _buildUserOp(0xbeef, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        handleUserOp(userOp);

        // Verify final state
        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));
        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }
}
