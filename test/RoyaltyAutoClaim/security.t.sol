// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BaseTest.t.sol";

/// @title Security Critical Tests
/// @notice Tests to verify TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities in ERC-4337's validate-then-execute pattern.
///         EntryPoint validates ALL UserOps first (incrementing nonces), then executes them sequentially.
///         When execution-phase functions skip precondition checks when msg.sender == entryPoint(),
///         bundled UserOps can exploit the gap between validation and execution.
///
///         These tests assert the EXPECTED SECURE behavior. If a test FAILS, the vulnerability is confirmed.
contract RoyaltyAutoClaim_Security_Test is BaseTest {
    string constant TITLE = "security-test";

    function setUp() public override {
        super.setUp();
    }

    /// @dev Helper to register a submission via admin direct call
    function _registerSubmission(string memory title) internal {
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission(title, recipient);
    }

    /// @dev Helper to review a submission via direct call
    function _reviewSubmissionDirect(string memory title, uint16 royaltyLevel, address reviewer) internal {
        vm.prank(reviewer);
        royaltyAutoClaim.reviewSubmission(title, royaltyLevel);
    }

    /* -------------------------------------------------------------------------- */
    /*       1. TOCTOU: Double-claim via bundled UserOps (CRITICAL)               */
    /* -------------------------------------------------------------------------- */

    /// @notice Two claimRoyalty UserOps for the same title in a single handleOps bundle.
    ///         Both pass validation (submission is claimable during validation phase).
    ///         Execution: first claim succeeds and sets status=Claimed; second should be blocked.
    function test_TOCTOU_doubleClaim_via_bundled_userOps() public {
        // Setup: register + 2 reviews = claimable
        _registerSubmission(TITLE);
        _reviewSubmissionDirect(TITLE, 20, reviewer1);
        _reviewSubmissionDirect(TITLE, 40, reviewer2);
        assertTrue(royaltyAutoClaim.isSubmissionClaimable(TITLE), "Should be claimable");

        uint256 royaltyAmount = royaltyAutoClaim.getRoyalty(TITLE);
        assertGt(royaltyAmount, 0, "Royalty should be non-zero");

        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        uint256 contractBalanceBefore = token.balanceOf(address(royaltyAutoClaim));

        // Build two claimRoyalty UserOps with different nonce keys
        bytes memory claimCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (TITLE));

        // Op1: recipient claims with nonce key 0
        PackedUserOperation memory op1 = _buildUserOp(recipientKey, address(royaltyAutoClaim), claimCall);

        // Op2: recipient claims again with nonce key 1 (different key = independent nonce sequence)
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = claimCall;
        op2.signature = _signUserOp(recipientKey, op2, recipient);

        // Bundle both ops in a single handleOps call
        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        uint256 contractBalanceAfter = token.balanceOf(address(royaltyAutoClaim));

        // EXPECTED SECURE BEHAVIOR: recipient receives royalty exactly once
        assertEq(
            recipientBalanceAfter,
            recipientBalanceBefore + royaltyAmount,
            "VULNERABILITY: Recipient received royalty more than once via bundled UserOps (double-claim)"
        );
        assertEq(
            contractBalanceAfter,
            contractBalanceBefore - royaltyAmount,
            "VULNERABILITY: Contract lost more tokens than expected (double-claim)"
        );
    }

    /// @notice In v1, only the recipient can claim via 4337 (validateUserOp checks isRecipient).
    ///         This test verifies that a second claim by the same recipient with a different nonce key
    ///         is blocked at execution phase even though both pass validation.
    ///         (Admin cannot claim in v1 unlike v2, so we test same-recipient double-claim instead.)
    function test_TOCTOU_doubleClaim_sameRecipientDifferentNonceKeys() public {
        // Setup: register + 2 reviews = claimable
        _registerSubmission(TITLE);
        _reviewSubmissionDirect(TITLE, 20, reviewer1);
        _reviewSubmissionDirect(TITLE, 40, reviewer2);

        uint256 royaltyAmount = royaltyAutoClaim.getRoyalty(TITLE);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        uint256 contractBalanceBefore = token.balanceOf(address(royaltyAutoClaim));

        bytes memory claimCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (TITLE));

        // Op1: recipient claims with nonce key 0
        PackedUserOperation memory op1 = _buildUserOp(recipientKey, address(royaltyAutoClaim), claimCall);

        // Op2: recipient claims again with nonce key 2 (different key = independent nonce sequence)
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 2);
        op2.callData = claimCall;
        op2.signature = _signUserOp(recipientKey, op2, recipient);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        uint256 contractBalanceAfter = token.balanceOf(address(royaltyAutoClaim));

        // EXPECTED SECURE BEHAVIOR: recipient receives royalty exactly once
        assertEq(
            recipientBalanceAfter,
            recipientBalanceBefore + royaltyAmount,
            "VULNERABILITY: Double-claim via same recipient with different nonce keys"
        );
        assertEq(
            contractBalanceAfter,
            contractBalanceBefore - royaltyAmount,
            "VULNERABILITY: Contract lost more tokens than expected (double-claim)"
        );
    }

    /* -------------------------------------------------------------------------- */
    /*       2. TOCTOU: Double-review via bundled UserOps (HIGH)                  */
    /* -------------------------------------------------------------------------- */

    /// @notice Two reviewSubmission UserOps with the same reviewer in a single bundle.
    ///         Both pass validation (hasReviewed is false for both during validation).
    ///         VULNERABILITY: _reviewSubmission doesn't re-check hasReviewed, so the same
    ///         reviewer is counted twice, inflating totalRoyaltyLevel and reviewCount.
    function test_TOCTOU_doubleReview_sameReviewer() public {
        _registerSubmission(TITLE);

        uint16 royaltyLevel = 20;

        // Build two review UserOps with the same reviewer but different nonce keys
        bytes memory reviewCall = abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (TITLE, royaltyLevel));

        // Op1: reviewer1 reviews with nonce key 0
        PackedUserOperation memory op1 = _buildUserOp(reviewer1Key, address(royaltyAutoClaim), reviewCall);

        // Op2: same reviewer1 reviews with nonce key 1
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = reviewCall;
        op2.signature = _signUserOp(reviewer1Key, op2, reviewer1);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        // EXPECTED SECURE BEHAVIOR: reviewCount should be 1, not 2
        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(TITLE);
        assertEq(submission.reviewCount, 1, "VULNERABILITY: Same reviewer counted twice (double-review)");
        assertEq(
            submission.totalRoyaltyLevel, royaltyLevel, "VULNERABILITY: totalRoyaltyLevel inflated via double-review"
        );
    }

    /// @notice Double-review with different royalty levels from the same reviewer.
    ///         Even more impactful: attacker inflates totalRoyaltyLevel to maximize payout.
    function test_TOCTOU_doubleReview_differentLevels_sameReviewer() public {
        _registerSubmission(TITLE);

        // Op1: review with level 80 (nonce key 0)
        bytes memory reviewCall1 = abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (TITLE, 80));
        PackedUserOperation memory op1 = _buildUserOp(reviewer1Key, address(royaltyAutoClaim), reviewCall1);

        // Op2: review again with level 80 using nonce key 1
        bytes memory reviewCall2 = abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (TITLE, 80));
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = reviewCall2;
        op2.signature = _signUserOp(reviewer1Key, op2, reviewer1);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(TITLE);
        assertEq(submission.reviewCount, 1, "VULNERABILITY: reviewCount inflated by same reviewer");
        assertEq(submission.totalRoyaltyLevel, 80, "VULNERABILITY: totalRoyaltyLevel inflated");
    }

    /* -------------------------------------------------------------------------- */
    /*       3. TOCTOU: Double-registration via bundled UserOps (HIGH)            */
    /* -------------------------------------------------------------------------- */

    /// @notice Two registerSubmission UserOps for the same title in a single bundle.
    ///         Both pass validation (admin signer check only in validateUserOp for admin functions).
    ///         In v1, registerSubmission has inline checks that run during execution,
    ///         so the second registration should be blocked by AlreadyRegistered.
    function test_TOCTOU_doubleRegistration_sameTitleDifferentRecipients() public {
        address recipient1 = makeAddr("recipient1");
        address recipient2 = makeAddr("recipient2");

        // Op1: register with recipient1 (nonce key 0)
        bytes memory regCall1 = abi.encodeCall(IRoyaltyAutoClaim.registerSubmission, (TITLE, recipient1));
        PackedUserOperation memory op1 = _buildUserOp(adminKey, address(royaltyAutoClaim), regCall1);

        // Op2: register same title with recipient2 (nonce key 1)
        bytes memory regCall2 = abi.encodeCall(IRoyaltyAutoClaim.registerSubmission, (TITLE, recipient2));
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = regCall2;
        op2.signature = _signUserOp(adminKey, op2, admin);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        // EXPECTED SECURE BEHAVIOR: only the first registration should succeed
        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(TITLE);
        assertEq(
            submission.royaltyRecipient, recipient1, "VULNERABILITY: Second registration overwrote the first recipient"
        );
    }

    /* -------------------------------------------------------------------------- */
    /*       4. Missing zero-address check in updateRoyaltyRecipient              */
    /* -------------------------------------------------------------------------- */

    /// @notice updateRoyaltyRecipient allows setting recipient to address(0).
    function test_updateRoyaltyRecipient_rejects_zero_address() public {
        _registerSubmission(TITLE);

        // EXPECTED SECURE BEHAVIOR: should revert with ZeroAddress
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.updateRoyaltyRecipient(TITLE, address(0));
    }

    /// @notice Same zero-address vulnerability via the ERC-4337 path.
    ///         EntryPoint doesn't revert on execution failures — it emits UserOperationRevertReason.
    function test_updateRoyaltyRecipient4337_rejects_zero_address() public {
        _registerSubmission(TITLE);

        bytes memory updateCall = abi.encodeCall(IRoyaltyAutoClaim.updateRoyaltyRecipient, (TITLE, address(0)));

        PackedUserOperation memory userOp = _buildUserOp(adminKey, address(royaltyAutoClaim), updateCall);

        // EXPECTED SECURE BEHAVIOR: execution reverts with ZeroAddress, emitted as UserOperationRevertReason
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(royaltyAutoClaim),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector)
        );
        _handleUserOp(userOp);

        // Verify recipient was NOT changed
        assertEq(
            royaltyAutoClaim.submissions(TITLE).royaltyRecipient,
            recipient,
            "VULNERABILITY: Recipient was changed to address(0)"
        );
    }
}
