// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./BaseTest.t.sol";

/// @title Security Critical Tests
/// @notice Tests to verify TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities in ERC-4337's validate-then-execute pattern.
///         EntryPoint validates ALL UserOps first (incrementing nonces), then executes them sequentially.
///         If execution-phase functions skip precondition checks when msg.sender == entryPoint(),
///         bundled UserOps can exploit the gap between validation and execution.
///
///         These tests assert the EXPECTED SECURE behavior. If a test FAILS, the vulnerability is confirmed.
contract RoyaltyAutoClaim_Security_Test is BaseTest {
    string constant TITLE = "security-test";
    string constant TITLE2 = "security-test-2";

    function setUp() public override {
        super.setUp();
    }

    /* -------------------------------------------------------------------------- */
    /*       1. TOCTOU: Double-claim via bundled UserOps (CRITICAL)               */
    /* -------------------------------------------------------------------------- */

    /// @notice Two claimRoyalty UserOps for the same title in a single handleOps bundle.
    ///         Both pass validation (submission is claimable during validation phase).
    ///         Execution: first claim succeeds and sets status=Claimed; second should be blocked.
    ///         VULNERABILITY: claimRoyalty skips _requireClaimable when msg.sender == entryPoint(),
    ///         so the second execution also transfers tokens — a double-spend.
    function test_TOCTOU_doubleClaim_via_bundled_userOps() public {
        // Setup: register + 2 reviews = claimable
        _registerSubmission(TITLE, recipient);
        _reviewSubmissionWithProof(TITLE, 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof(TITLE, 40, reviewer2Nullifier1);
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

    /// @notice Same as above but using admin as the second claimer.
    ///         Admin is also authorized to claim, so both ops pass validation.
    function test_TOCTOU_doubleClaim_recipientAndAdmin() public {
        // Setup: register + 2 reviews = claimable
        _registerSubmission(TITLE, recipient);
        _reviewSubmissionWithProof(TITLE, 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof(TITLE, 40, reviewer2Nullifier1);

        uint256 royaltyAmount = royaltyAutoClaim.getRoyalty(TITLE);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        bytes memory claimCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (TITLE));

        // Op1: recipient claims
        PackedUserOperation memory op1 = _buildUserOp(recipientKey, address(royaltyAutoClaim), claimCall);

        // Op2: admin claims the same title (using nonce key 1)
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = claimCall;
        op2.signature = _signUserOp(adminKey, op2, admin);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        uint256 recipientBalanceAfter = token.balanceOf(recipient);

        // Even though admin also submitted a claim, recipient should only receive 1x
        assertEq(
            recipientBalanceAfter,
            recipientBalanceBefore + royaltyAmount,
            "VULNERABILITY: Double-claim via recipient + admin bundled UserOps"
        );
    }

    /* -------------------------------------------------------------------------- */
    /*       2. TOCTOU: Double-review via bundled UserOps (HIGH)                  */
    /* -------------------------------------------------------------------------- */

    /// @notice Two reviewSubmission4337 UserOps with the same nullifier in a single bundle.
    ///         Both pass validation (hasReviewed is false for both during validation).
    ///         VULNERABILITY: _reviewSubmission doesn't re-check hasReviewed, so the same
    ///         nullifier is counted twice, inflating totalRoyaltyLevel and reviewCount.
    function test_TOCTOU_doubleReview_sameNullifier() public {
        _registerSubmission(TITLE, recipient);

        uint256 nullifier = reviewer1Nullifier1;
        uint16 royaltyLevel = 20;

        // Build two review UserOps with the same nullifier but different nonce keys
        bytes memory reviewCall =
            abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission4337, (TITLE, royaltyLevel, nullifier));
        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(nullifier, royaltyLevel, TITLE);

        // Op1: review with nonce key 0
        PackedUserOperation memory op1 = _buildUserOpWithoutSignature(address(royaltyAutoClaim), reviewCall);
        op1.signature = abi.encode(proof);

        // Op2: same review with nonce key 1
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = reviewCall;
        op2.signature = abi.encode(proof);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        // EXPECTED SECURE BEHAVIOR: reviewCount should be 1, not 2
        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(TITLE);
        assertEq(submission.reviewCount, 1, "VULNERABILITY: Same nullifier counted twice (double-review)");
        assertEq(
            submission.totalRoyaltyLevel, royaltyLevel, "VULNERABILITY: totalRoyaltyLevel inflated via double-review"
        );
    }

    /// @notice Double-review with different royalty levels from the same nullifier.
    ///         Even more impactful: attacker inflates totalRoyaltyLevel to maximize payout.
    function test_TOCTOU_doubleReview_differentLevels_sameNullifier() public {
        _registerSubmission(TITLE, recipient);

        uint256 nullifier = reviewer1Nullifier1;

        // Op1: review with level 80 (nonce key 0)
        bytes memory reviewCall1 = abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission4337, (TITLE, 80, nullifier));
        ISemaphore.SemaphoreProof memory proof1 = _createSemaphoreProof(nullifier, 80, TITLE);

        PackedUserOperation memory op1 = _buildUserOpWithoutSignature(address(royaltyAutoClaim), reviewCall1);
        op1.signature = abi.encode(proof1);

        // Op2: review again with level 80 using nonce key 1
        bytes memory reviewCall2 = abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission4337, (TITLE, 80, nullifier));
        ISemaphore.SemaphoreProof memory proof2 = _createSemaphoreProof(nullifier, 80, TITLE);

        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = reviewCall2;
        op2.signature = abi.encode(proof2);

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = op1;
        ops[1] = op2;
        entryPoint.handleOps(ops, payable(msg.sender));

        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(TITLE);
        assertEq(submission.reviewCount, 1, "VULNERABILITY: reviewCount inflated by same nullifier");

        // If both went through: totalRoyaltyLevel = 160, reviewCount = 2, avg = 80 ether
        // If only one: totalRoyaltyLevel = 80, reviewCount = 1
        assertEq(submission.totalRoyaltyLevel, 80, "VULNERABILITY: totalRoyaltyLevel inflated");
    }

    /* -------------------------------------------------------------------------- */
    /*       3. TOCTOU: Double-registration via bundled UserOps (HIGH)            */
    /* -------------------------------------------------------------------------- */

    /// @notice Two registerSubmission4337 UserOps for the same title in a single bundle.
    ///         Both pass validation (status is NotExist during validation for both).
    ///         VULNERABILITY: second execution overwrites the first recipient silently.
    function test_TOCTOU_doubleRegistration_sameTitleDifferentRecipients() public {
        address recipient1 = makeAddr("recipient1");
        address recipient2 = makeAddr("recipient2");

        bytes32 nullifier1 = bytes32(uint256(1111));
        bytes32 nullifier2 = bytes32(uint256(2222));

        // Op1: register with recipient1 (nonce key 0)
        bytes memory regCall1 =
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (TITLE, recipient1, nullifier1));
        PackedUserOperation memory op1 = _buildUserOpWithoutSignature(address(royaltyAutoClaim), regCall1);
        bytes32 userOpHash1 = entryPoint.getUserOpHash(op1);
        TitleHashVerifierLib.EmailProof memory proof1 =
            _createEmailProof(recipient1, nullifier1, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash1);
        op1.signature = abi.encode(proof1);

        // Op2: register same title with recipient2 (nonce key 1)
        PackedUserOperation memory op2 = _createUserOp();
        op2.sender = address(royaltyAutoClaim);
        op2.nonce = entryPoint.getNonce(address(royaltyAutoClaim), 1);
        op2.callData = abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (TITLE, recipient2, nullifier2));
        bytes32 userOpHash2 = entryPoint.getUserOpHash(op2);
        TitleHashVerifierLib.EmailProof memory proof2 =
            _createEmailProof(recipient2, nullifier2, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash2);
        op2.signature = abi.encode(proof2);

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
    /*       4. Missing zero-address check in email-based updateRoyaltyRecipient  */
    /* -------------------------------------------------------------------------- */

    /// @notice updateRoyaltyRecipient via email proof allows setting recipient to address(0).
    ///         Compare: _verifyRegistration checks address(0), adminUpdateRoyaltyRecipient checks address(0),
    ///         but _verifyRecipientUpdate does NOT.
    function test_updateRoyaltyRecipient_allows_zero_address() public {
        // Register a submission with a valid recipient
        _registerSubmission(TITLE, recipient);

        // Create an email proof with recipient = address(0)
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            address(0), bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, bytes32(0)
        );

        // EXPECTED SECURE BEHAVIOR: should revert with ZeroAddress
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.updateRoyaltyRecipient(TITLE, proof);
    }

    /// @notice Same zero-address vulnerability via the ERC-4337 path.
    function test_updateRoyaltyRecipient4337_allows_zero_address() public {
        // Register a submission
        _registerSubmission(TITLE, recipient);

        bytes32 nullifier = bytes32(vm.randomUint());

        bytes memory updateCall =
            abi.encodeCall(IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (TITLE, address(0), nullifier));

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), updateCall);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(address(0), nullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash);
        userOp.signature = abi.encode(proof);

        // EXPECTED SECURE BEHAVIOR: validation should fail (AA24 signature error or AA23 reverted)
        vm.expectRevert();
        _handleUserOp(userOp);
    }
}
