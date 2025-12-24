// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../utils/MockV2.sol";
import "./BaseTest.t.sol";

/*

forge test test/RoyaltyAutoClaim/integration.t.sol -vvvv --skip test/RoyaltyAutoClaim/e2e.t.sol

---

Test case order
(Find following keywords to quickly navigate)

Email-based operations
Other operations

---

Expected Error of _handleUserOp

1. validateUserOp Error
(ex.1) AA24 signature error
vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));

(ex.2) AA23 reverted
vm.expectRevert(
    abi.encodeWithSelector(
        IEntryPoint.FailedOpWithRevert.selector,
        0,
        "AA23 reverted",
        abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fakeOwner)
    )
);

2. execution Error
vm.expectEmit(false, true, true, true);
emit IEntryPoint.UserOperationRevertReason(
    bytes32(0), address(royaltyAutoClaim), userOp.nonce, abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector)
);

*/

contract RoyaltyAutoClaim_Integration_Test is BaseTest {
    string testSubmissionTitle = "test";
    IEmailVerifier newEmailVerifier = IEmailVerifier(makeAddr("newEmailVerifier"));

    function setUp() public override {
        super.setUp();
    }

    function test_validateUserOp_owner_functions() public {
        // note: Here we only check the success/failure of the validation phase and not the execution phase,
        // therefore the function parameters can be random
        bytes[] memory ownerCalls = new bytes[](5);
        ownerCalls[0] = abi.encodeCall(UUPSUpgradeable.upgradeToAndCall, (address(0), ""));
        ownerCalls[1] = abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (address(0)));
        ownerCalls[2] = abi.encodeCall(RoyaltyAutoClaim.changeAdmin, (address(0)));
        ownerCalls[3] = abi.encodeCall(RoyaltyAutoClaim.changeRoyaltyToken, (address(0)));
        ownerCalls[4] = abi.encodeCall(RoyaltyAutoClaim.emergencyWithdraw, (address(0), 0));

        // Should fail for non-owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), ownerCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake)
                )
            );
            _handleUserOp(userOp);
        }

        // Should fail for invalid signature
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), ownerCalls[i]);
            userOp.signature = _signUserOp(fakeKey, userOp, owner);
            vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
            _handleUserOp(userOp);
        }

        // Should succeed for owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(ownerKey, address(royaltyAutoClaim), ownerCalls[i]);
            _handleUserOp(userOp);
        }
    }

    function test_validateUserOp_admin_functions() public {
        // Test Admin Functions
        bytes[] memory adminCalls = new bytes[](4);
        adminCalls[0] = abi.encodeCall(RoyaltyAutoClaim.adminRegisterSubmission, (testSubmissionTitle, recipient));
        adminCalls[1] = abi.encodeCall(
            RoyaltyAutoClaim.adminUpdateRoyaltyRecipient, (testSubmissionTitle, makeAddr("newRecipient"))
        );
        adminCalls[2] = abi.encodeCall(RoyaltyAutoClaim.revokeSubmission, (testSubmissionTitle));
        adminCalls[3] = abi.encodeCall(RoyaltyAutoClaim.updateEmailVerifier, (newEmailVerifier));

        // Should fail for non-admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), adminCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake)
                )
            );
            _handleUserOp(userOp);
        }

        // Should fail for invalid signature
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), adminCalls[i]);
            userOp.signature = _signUserOp(fakeKey, userOp, admin);
            vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
            _handleUserOp(userOp);
        }

        // Should succeed for admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(adminKey, address(royaltyAutoClaim), adminCalls[i]);
            _handleUserOp(userOp);
        }
    }

    function test_validateUserOp_reviewer_functions() public {
        _registerSubmission(testSubmissionTitle, recipient);

        uint256 nullifier = reviewer1Nullifier1;
        bytes memory reviewerCall =
            abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (testSubmissionTitle, 20, nullifier));

        // Create proof
        ISemaphore.SemaphoreProof memory semaphoreProof = _createSemaphoreProof(nullifier, 20, testSubmissionTitle);

        // Should fail for invalid proof
        MockSemaphore(address(mockSemaphore)).setMockVerifyResult(false);
        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), reviewerCall);
        userOp.signature = abi.encode(semaphoreProof);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        _handleUserOp(userOp);
        MockSemaphore(address(mockSemaphore)).setMockVerifyResult(true);

        // Should fail for nullifier mismatch
        userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), reviewerCall);
        ISemaphore.SemaphoreProof memory wrongProof = semaphoreProof;
        wrongProof.nullifier = reviewer2Nullifier1; // Different nullifier
        userOp.signature = abi.encode(wrongProof);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.NullifierMismatch.selector)
            )
        );
        _handleUserOp(userOp);

        // Should succeed with valid proof
        _reviewSubmission4337(reviewer1Nullifier1, testSubmissionTitle, 20);

        // Should succeed with different nullifier (second reviewer)
        _reviewSubmission4337(reviewer2Nullifier1, testSubmissionTitle, 40);
    }

    function test_validateUserOp_recipient_functions() public {
        _registerSubmission(testSubmissionTitle, recipient);

        _reviewSubmission4337(reviewer1Nullifier1, testSubmissionTitle, 20);
        _reviewSubmission4337(reviewer2Nullifier1, testSubmissionTitle, 40);

        // Should fail if not recipient
        PackedUserOperation memory userOp = _buildUserOp(
            fakeKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake)
            )
        );
        _handleUserOp(userOp);

        // Should fail for invalid signature
        userOp = _buildUserOp(
            fakeKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );
        // Put recipient address but signed with fakeKey
        userOp.signature = _signUserOp(fakeKey, userOp, recipient);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        _handleUserOp(userOp);

        // Should succeed for recipient
        userOp = _buildUserOp(
            recipientKey,
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );
        _handleUserOp(userOp);
    }

    function testCannot_validateUserOp_unsupported_selector() public {
        bytes4 unsupportedSelector = bytes4(keccak256("unsupportedFunction()"));
        bytes memory unsupportedCall = abi.encodePacked(unsupportedSelector);

        PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), unsupportedCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.UnsupportSelector.selector, unsupportedSelector)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_validateUserOp_not_from_entrypoint() public {
        PackedUserOperation memory userOp;
        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        royaltyAutoClaim.validateUserOp(userOp, bytes32(0), 0);
    }

    function testCannot_validateUserOp_with_paymaster() public {
        PackedUserOperation memory userOp = _buildUserOp(
            fakeKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );

        userOp.paymasterAndData = abi.encodePacked(vm.addr(0xdead), uint128(999_999), uint128(999_999));

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.ForbiddenPaymaster.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_validateUserOp_InvalidSignatureLength() public {
        PackedUserOperation memory userOp = _buildUserOp(
            fakeKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );

        userOp.signature = new bytes(123);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidSignatureLength.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function test_upgradeToAndCall() public {
        MockV2 v2 = new MockV2();

        PackedUserOperation memory userOp = _buildUserOp(
            fakeKey,
            address(royaltyAutoClaim),
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake)
            )
        );
        _handleUserOp(userOp);

        userOp = _buildUserOp(
            ownerKey,
            address(royaltyAutoClaim),
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        _handleUserOp(userOp);
        assertEq(
            address(uint160(uint256(vm.load(address(royaltyAutoClaim), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2)
        );
    }

    function testCannot_transferOwnership_if_zero_address() public {
        PackedUserOperation memory userOp = _buildUserOp(
            ownerKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (address(0)))
        );
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(royaltyAutoClaim),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector)
        );
        _handleUserOp(userOp);
    }

    /// ========================= Email-based operations =========================

    function test_registerSubmission4337_with_valid_proof() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();

        bytes memory callData =
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (testSubmissionTitle, testRecipient, nullifier));

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(testRecipient, nullifier, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash);

        userOp.signature = abi.encode(proof);
        _handleUserOp(userOp);

        // Verify submission was registered
        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(testSubmissionTitle);
        assertEq(submission.royaltyRecipient, testRecipient, "Recipient should match");
        assertEq(
            uint8(submission.status),
            uint8(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Status should be Registered"
        );
    }

    function testCannot_registerSubmission4337_with_invalid_proof() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();

        bytes memory callData =
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (testSubmissionTitle, testRecipient, nullifier));

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(testRecipient, nullifier, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash);

        userOp.signature = abi.encode(proof);

        // Set mock to return false (invalid proof)
        MockEmailVerifier(address(mockEmailVerifier)).setMockVerifyResult(false);

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        _handleUserOp(userOp);

        // Reset mock
        MockEmailVerifier(address(mockEmailVerifier)).setMockVerifyResult(true);
    }

    function testCannot_registerSubmission4337_with_recipient_mismatch() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();
        address wrongRecipient = vm.randomAddress();

        bytes memory callData =
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (testSubmissionTitle, testRecipient, nullifier));

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        // Proof has wrong recipient
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(wrongRecipient, nullifier, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash);

        userOp.signature = abi.encode(proof);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.RecipientMismatch.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_registerSubmission4337_with_nullifier_mismatch() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        bytes32 wrongNullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();

        bytes memory callData =
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (testSubmissionTitle, testRecipient, nullifier));

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        // Proof has wrong nullifier
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            testRecipient, wrongNullifier, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash
        );

        userOp.signature = abi.encode(proof);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.NullifierMismatch.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function test_updateRoyaltyRecipient4337_with_valid_proof() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        // First register
        _registerSubmission(testSubmissionTitle, testRecipient);

        bytes memory callData = abi.encodeCall(
            IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (testSubmissionTitle, newRecipient, nullifier)
        );

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(newRecipient, nullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash);

        userOp.signature = abi.encode(proof);
        _handleUserOp(userOp);

        // Verify recipient was updated
        IRoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(testSubmissionTitle);
        assertEq(submission.royaltyRecipient, newRecipient, "Recipient should be updated");
    }

    function testCannot_updateRoyaltyRecipient4337_with_invalid_proof() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        // First register
        _registerSubmission(testSubmissionTitle, testRecipient);

        bytes memory callData = abi.encodeCall(
            IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (testSubmissionTitle, newRecipient, nullifier)
        );

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(newRecipient, nullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash);

        userOp.signature = abi.encode(proof);

        // Set mock to return false (invalid proof)
        MockEmailVerifier(address(mockEmailVerifier)).setMockVerifyResult(false);

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        _handleUserOp(userOp);

        // Reset mock
        MockEmailVerifier(address(mockEmailVerifier)).setMockVerifyResult(true);
    }

    function testCannot_updateRoyaltyRecipient4337_with_recipient_mismatch() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();
        address wrongRecipient = vm.randomAddress();

        // First register
        _registerSubmission(testSubmissionTitle, testRecipient);

        bytes memory callData = abi.encodeCall(
            IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (testSubmissionTitle, newRecipient, nullifier)
        );

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        // Proof has wrong recipient
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            wrongRecipient, nullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash
        );

        userOp.signature = abi.encode(proof);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.RecipientMismatch.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_updateRoyaltyRecipient4337_with_nullifier_mismatch() public {
        bytes32 nullifier = bytes32(vm.randomUint());
        bytes32 wrongNullifier = bytes32(vm.randomUint());
        address testRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        // First register
        _registerSubmission(testSubmissionTitle, testRecipient);

        bytes memory callData = abi.encodeCall(
            IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (testSubmissionTitle, newRecipient, nullifier)
        );

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(address(royaltyAutoClaim), callData);

        // Proof has wrong nullifier
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            newRecipient, wrongNullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash
        );

        userOp.signature = abi.encode(proof);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.NullifierMismatch.selector)
            )
        );
        _handleUserOp(userOp);
    }

    /// ========================= Other operations =========================

    function testCannot_reviewSubmission_multiple_times() public {
        _registerSubmission(testSubmissionTitle, recipient);

        // First review should succeed via UserOperation
        _reviewSubmission4337(reviewer1Nullifier1, testSubmissionTitle, 20);

        // Second review from same nullifier should fail
        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (testSubmissionTitle, 40, reviewer1Nullifier1))
        );
        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(reviewer1Nullifier1, 40, testSubmissionTitle);
        userOp.signature = abi.encode(proof);

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyReviewed.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        _registerSubmission(testSubmissionTitle, recipient);
        _reviewSubmission4337(reviewer1Nullifier1, testSubmissionTitle, 20);
        _reviewSubmission4337(reviewer2Nullifier1, testSubmissionTitle, 40);

        // First claim should succeed
        _handleUserOp(
            _buildUserOp(
                recipientKey,
                address(royaltyAutoClaim),
                abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
            )
        );

        // Second claim should fail
        PackedUserOperation memory userOp = _buildUserOp(
            recipientKey,
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, (testSubmissionTitle))
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
            )
        );
        _handleUserOp(userOp);
    }

    function _reviewSubmission4337(uint256 nullifier, string memory title, uint16 royaltyLevel) internal {
        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.reviewSubmission, (title, royaltyLevel, nullifier))
        );

        ISemaphore.SemaphoreProof memory semaphoreProof = _createSemaphoreProof(nullifier, royaltyLevel, title);

        userOp.signature = abi.encode(semaphoreProof);

        _handleUserOp(userOp);
    }
}
