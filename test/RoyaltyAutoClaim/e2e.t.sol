// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BaseTest.t.sol";

contract RoyaltyAutoClaim_E2E_Test is BaseTest {
    function setUp() public override {
        super.setUp();
    }

    function test_prevent_storage_collision() public {
        // Get storage slots 0-3 and verify they are empty
        for (uint256 i = 0; i < 4; i++) {
            bytes32 slot = vm.load(address(royaltyAutoClaim), bytes32(i));
            assertEq(slot, bytes32(0), "Storage slot should be empty");
        }

        // Perform some state changes
        address[] memory reviewers = new address[](1);
        reviewers[0] = initialReviewers[0];
        vm.prank(owner);
        royaltyAutoClaim.transferOwnership(vm.randomAddress());

        // Verify slots are still empty after state changes
        for (uint256 i = 0; i < 4; i++) {
            bytes32 slot = vm.load(address(royaltyAutoClaim), bytes32(i));
            assertEq(slot, bytes32(0), "Storage slot should remain empty after state changes");
        }
    }

    function test_simple_flow() public {
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

        vm.prank(reviewer1);
        royaltyAutoClaim.reviewSubmission("test", 20);

        vm.expectRevert();
        royaltyAutoClaim.claimRoyalty("test");
        assertEq(royaltyAutoClaim.getRoyalty("test"), 0 ether, "Royalty should be 0");

        vm.prank(reviewer2);
        royaltyAutoClaim.reviewSubmission("test", 40);

        assertEq(royaltyAutoClaim.getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        royaltyAutoClaim.claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }

    function test_simple_flow_4337() public {
        // Register submission via admin
        PackedUserOperation memory userOp = _buildUserOp(
            adminKey, address(proxy), abi.encodeCall(royaltyAutoClaim.registerSubmission, ("test", submitter))
        );
        _handleUserOp(userOp);

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
        userOp = _buildUserOp(submitterKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        _handleUserOp(userOp);

        // First review
        userOp =
            _buildUserOp(reviewer1Key, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 20))); // reviewer 0
        _handleUserOp(userOp);

        assertEq(submission.reviewCount, 1, "Review count should be 1");
        assertEq(royaltyAutoClaim.hasReviewed("test", reviewer1), true, "Has reviewed should be true");

        // Try to claim after one review - should still fail
        userOp = _buildUserOp(submitterKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        _handleUserOp(userOp);
        assertEq(royaltyAutoClaim.getRoyalty("test"), 0 ether, "Royalty should be 0");

        // Second review
        userOp =
            _buildUserOp(reviewer2Key, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 40))); // reviewer 1
        _handleUserOp(userOp);

        assertEq(submission.reviewCount, 2, "Review count should be 2");
        assertEq(royaltyAutoClaim.hasReviewed("test", reviewer2), true, "Has reviewed should be true");
        assertEq(royaltyAutoClaim.getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        // Record balances before claim
        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        // Claim royalty
        userOp = _buildUserOp(submitterKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        _handleUserOp(userOp);

        // Verify final state
        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));
        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }
}
