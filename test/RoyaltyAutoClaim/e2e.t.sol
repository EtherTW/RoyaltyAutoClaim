// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./BaseTest.t.sol";

contract RoyaltyAutoClaim_E2E_Test is BaseTest {
    function setUp() public override {
        super.setUp();
    }

    function test_prevent_storage_collision() public {
        // Get storage slots 0-3 and verify they are empty
        for (uint256 i = 0; i < 4; i++) {
            bytes32 slot = vm.load(address(royaltyAutoClaim), bytes32(i));
            assertEq(slot, bytes32(0), "Flat storage slots should be empty");
        }

        // Perform some state changes
        vm.prank(owner);
        royaltyAutoClaim.transferOwnership(vm.randomAddress());

        // Verify slots are still empty after state changes
        for (uint256 i = 0; i < 4; i++) {
            bytes32 slot = vm.load(address(royaltyAutoClaim), bytes32(i));
            assertEq(slot, bytes32(0), "Flat storage slots should remain empty after state changes");
        }
    }

    function test_simple_flow() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, recipient, "Royalty recipient should be recipient");
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
        assertEq(royaltyAutoClaim.isSubmissionClaimable("test"), false, "Submission should not be claimable");

        vm.prank(reviewer2);
        royaltyAutoClaim.reviewSubmission("test", 40);

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(recipient), 30 ether, "Recipient should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }

    function test_simple_flow_4337() public {
        _registerSubmission4337("test", recipient);

        // Verify submission state
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, recipient, "Royalty recipient should be recipient");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );

        // Try to claim before reviews - should fail
        PackedUserOperation memory userOp =
            _buildUserOp(recipientKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
            )
        );
        _handleUserOp(userOp);

        // First review
        userOp =
            _buildUserOp(reviewer1Key, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 20)));
        _handleUserOp(userOp);

        // Try to claim after one review - should still fail
        userOp = _buildUserOp(recipientKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
            )
        );
        _handleUserOp(userOp);
        assertEq(royaltyAutoClaim.isSubmissionClaimable("test"), false, "Submission should not be claimable");

        // Second review
        userOp =
            _buildUserOp(reviewer2Key, address(proxy), abi.encodeCall(royaltyAutoClaim.reviewSubmission, ("test", 40)));
        _handleUserOp(userOp);

        // Record balances before claim
        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        // Claim royalty
        userOp = _buildUserOp(recipientKey, address(proxy), abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("test")));
        _handleUserOp(userOp);

        // Verify final state
        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));
        assertEq(token.balanceOf(recipient), 30 ether, "Recipient should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }
}
