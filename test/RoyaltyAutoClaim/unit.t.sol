// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./BaseTest.t.sol";
import "../utils/MockV2.sol";
import {RejectEther} from "../utils/RejectEther.sol";

/*

forge test test/RoyaltyAutoClaim/unit.t.sol -vvvv --skip test/RoyaltyAutoClaim/integration.t.sol test/RoyaltyAutoClaim/e2e.t.sol

Test case order
(Find following keywords to quickly navigate)

ZK Email Functions
Owner Functions
Admin Functions
Reviewer Functions
Recipient Functions
View Functions
Internal Functions

*/

contract RoyaltyAutoClaim_Unit_Test is BaseTest {
    function setUp() public override {
        super.setUp();
    }

    function test_receive_and_fallback() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(proxy).call{value: 1 ether}("");
        assertTrue(success, "Should accept direct Ether transfer");
        assertEq(address(proxy).balance, 101 ether, "Proxy balance should increase"); // 100 ether from setUp + 1 ether
    }

    function testCannot_initialize_with_zero_addresses() public {
        RoyaltyAutoClaim newImpl = new RoyaltyAutoClaim();

        // Test zero owner
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (address(0), admin, address(token), mockEmailVerifier, mockSemaphore)
            )
        );

        // Test zero admin
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, address(0), address(token), mockEmailVerifier, mockSemaphore)
            )
        );

        // Test zero token
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(0), mockEmailVerifier, mockSemaphore))
        );

        // Test zero verifier
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, admin, address(token), IEmailVerifier(address(0)), mockSemaphore)
            )
        );

        // Test zero semaphore
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, admin, address(token), mockEmailVerifier, ISemaphore(address(0)))
            )
        );
    }

    // ======================================== ZK Email Functions ========================================

    // ======================================== registerSubmission ========================================

    function test_registerSubmission() public {
        _registerSubmission("test", recipient);
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, recipient, "Royalty recipient should be the recipient");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );
    }

    function testCannot_registerSubmission_invalid_proof() public {
        // Set mock to return false
        mockEmailVerifier.setMockVerifyResult(false);

        vm.expectRevert(IRoyaltyAutoClaim.InvalidProof.selector);
        _registerSubmission("test", recipient);

        // Reset mock
        mockEmailVerifier.setMockVerifyResult(true);
    }

    function testCannot_registerSubmission_if_the_submission_already_exists_or_is_claimed() public {
        _registerSubmission("test", recipient);

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyRegistered.selector));
        _registerSubmission("test", recipient);

        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert(); // submission is claimed
        _registerSubmission("test", recipient);
    }

    function testCannot_registerSubmission_with_empty_title() public {
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.EmptyString.selector));
        _registerSubmission("", vm.randomAddress());
    }

    function testCannot_registerSubmission_with_zero_address() public {
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        _registerSubmission("test", address(0));
    }

    function testCannot_registerSubmission_with_used_email_proof() public {
        bytes32 emailNullifier = bytes32(uint256(12345));

        // First registration with the email nullifier
        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(recipient, emailNullifier, TitleHashVerifierLib.OperationType.REGISTRATION, bytes32(0));
        royaltyAutoClaim.registerSubmission("test", proof);

        // Verify the email nullifier is marked as used
        assertTrue(royaltyAutoClaim.isEmailProofUsed(emailNullifier), "Email proof should be marked as used");

        // Second registration with the same nullifier should fail even with different title
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.EmailProofUsed.selector));
        royaltyAutoClaim.registerSubmission("test2", proof);

        // Third registration with a new nullifier should succeed
        TitleHashVerifierLib.EmailProof memory newProof = _createEmailProof(
            recipient, bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.REGISTRATION, bytes32(0)
        );
        royaltyAutoClaim.registerSubmission("test2", newProof);
    }

    function testCannot_registerSubmission_with_invalid_operation_type() public {
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            recipient, bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, bytes32(0)
        );
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidOperationType.selector));
        royaltyAutoClaim.registerSubmission("test", proof);
    }

    function testCannot_registerSubmission_if_not_called_by_entrypoint(
        address caller,
        address recipientAddress,
        bytes32 emailHash
    ) public {
        // Assume caller is not the entry point
        vm.assume(caller != ENTRY_POINT);
        vm.assume(recipientAddress != address(0));

        // Try to call the onlyEntryPoint version directly (not through EntryPoint)
        vm.prank(caller);
        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        royaltyAutoClaim.registerSubmission4337("test", recipientAddress, emailHash);
    }

    // ======================================== updateRoyaltyRecipient ========================================

    function test_updateRoyaltyRecipient() public {
        address originalRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        _registerSubmission("test", originalRecipient);
        _updateRoyaltyRecipient("test", newRecipient);
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, newRecipient, "Royalty recipient should be updated");
    }

    function testCannot_updateRoyaltyRecipient_invalid_proof() public {
        address originalRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();
        _registerSubmission("test", originalRecipient);

        // Set mock to return false
        mockEmailVerifier.setMockVerifyResult(false);

        vm.expectRevert(IRoyaltyAutoClaim.InvalidProof.selector);
        _updateRoyaltyRecipient("test", newRecipient);

        // Reset mock
        mockEmailVerifier.setMockVerifyResult(true);
    }

    function testCannot_updateRoyaltyRecipient_if_the_submission_is_claimed_or_not_exist() public {
        address recipient = vm.randomAddress();

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        _updateRoyaltyRecipient("test", recipient);

        vm.prank(admin);
        _registerSubmission("test", recipient);
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert();
        _updateRoyaltyRecipient("test", vm.randomAddress());
    }

    function testCannot_updateRoyaltyRecipient_with_same_address() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SameAddress.selector));
        _updateRoyaltyRecipient("test", recipient);
    }

    function testCannot_updateRoyaltyRecipient_with_used_email_proof() public {
        bytes32 emailNullifier = bytes32(vm.randomUint());

        // First registration with the email nullifier
        TitleHashVerifierLib.EmailProof memory regProof =
            _createEmailProof(recipient, emailNullifier, TitleHashVerifierLib.OperationType.REGISTRATION, bytes32(0));
        royaltyAutoClaim.registerSubmission("test", regProof);

        // Verify the email nullifier is marked as used
        assertTrue(royaltyAutoClaim.isEmailProofUsed(emailNullifier), "Email proof should be marked as used");

        // Try to update royalty recipient using the same nullifier should fail
        TitleHashVerifierLib.EmailProof memory updateProof = _createEmailProof(
            vm.randomAddress(), emailNullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, bytes32(0)
        );
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.EmailProofUsed.selector));
        royaltyAutoClaim.updateRoyaltyRecipient("test", updateProof);

        // Update with a new nullifier should succeed
        TitleHashVerifierLib.EmailProof memory newProof = _createEmailProof(
            vm.randomAddress(),
            bytes32(vm.randomUint()),
            TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE,
            bytes32(0)
        );
        royaltyAutoClaim.updateRoyaltyRecipient("test", newProof);
    }

    function testCannot_updateRoyaltyRecipient_with_invalid_operation_type() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        TitleHashVerifierLib.EmailProof memory updateProof = _createEmailProof(
            vm.randomAddress(), bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.REGISTRATION, bytes32(0)
        );
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidOperationType.selector));
        royaltyAutoClaim.updateRoyaltyRecipient("test", updateProof);
    }

    function testCannot_updateRoyaltyRecipient_if_not_called_by_entrypoint(
        address caller,
        address newRecipient,
        bytes32 emailHash
    ) public {
        // Assume caller is not the entry point
        vm.assume(caller != ENTRY_POINT);
        vm.assume(newRecipient != address(0));

        // First register a submission
        _registerSubmission("test", recipient);

        // Try to call the onlyEntryPoint version directly (not through EntryPoint)
        vm.prank(caller);
        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        royaltyAutoClaim.updateRoyaltyRecipient4337("test", newRecipient, emailHash);
    }

    // ======================================== Owner Functions ========================================

    function test_upgradeToAndCall() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();

        vm.prank(fake);
        vm.expectRevert();
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));

        vm.prank(owner);
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));
        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v2));
    }

    function test_transferOwnership() public {
        // Should fail if not owner
        vm.prank(fake);
        vm.expectRevert();
        royaltyAutoClaim.transferOwnership(newOwner);

        vm.prank(owner);
        royaltyAutoClaim.transferOwnership(newOwner);
        assertEq(royaltyAutoClaim.owner(), newOwner);
    }

    function testCannot_transferOwnership_if_zero_address() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.transferOwnership(address(0));
    }

    function test_changeAdmin() public {
        // Should fail if not owner
        vm.prank(fake);
        vm.expectRevert();
        royaltyAutoClaim.changeAdmin(newAdmin);

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.changeAdmin(address(0));

        vm.prank(owner);
        royaltyAutoClaim.changeAdmin(newAdmin);
        assertEq(royaltyAutoClaim.admin(), newAdmin);
    }

    function testCannot_changeAdmin_if_address_is_same() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SameAddress.selector));
        royaltyAutoClaim.changeAdmin(admin);
    }

    function test_changeRoyaltyToken() public {
        // Should fail if not owner
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.changeRoyaltyToken(address(newToken));

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.changeRoyaltyToken(address(0));

        vm.prank(owner);
        royaltyAutoClaim.changeRoyaltyToken(address(newToken));
        assertEq(royaltyAutoClaim.token(), address(newToken));
    }

    function testCannot_changeRoyaltyToken_if_address_is_same() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SameAddress.selector));
        royaltyAutoClaim.changeRoyaltyToken(address(token));
    }

    function testCannot_renounceOwnership() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.RenounceOwnershipDisabled.selector));
        royaltyAutoClaim.renounceOwnership();
    }

    function test_emergencyWithdraw_NATIVE_TOKEN() public {
        uint256 amount = 1 ether;
        uint256 ownerBalanceBefore = owner.balance;

        vm.prank(owner);
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, amount);
        assertEq(owner.balance, ownerBalanceBefore + amount);
    }

    function test_emergencyWithdraw_ERC20() public {
        uint256 amount = 1 ether;
        uint256 tokenBalanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        royaltyAutoClaim.emergencyWithdraw(address(token), amount);
        assertEq(token.balanceOf(owner), tokenBalanceBefore + amount);
    }

    function testCannot_emergencyWithdraw_if_not_owner() public {
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, 1 ether);

        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.emergencyWithdraw(address(token), 1 ether);
    }

    function testCannot_emergencyWithdraw_if_zero_amount() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAmount.selector));
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, 0);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAmount.selector));
        royaltyAutoClaim.emergencyWithdraw(address(token), 0);
    }

    function testCannot_emergencyWithdraw_if_zero_address() public {
        vm.prank(owner);
        vm.expectRevert();
        royaltyAutoClaim.emergencyWithdraw(address(0), 1 ether);
    }

    function testCannot_emergencyWithdraw_NATIVE_TOKEN_if_transfer_fails() public {
        // Deploy a contract that rejects ETH transfers as the new owner
        RejectEther rejectContract = new RejectEther();

        // Transfer ownership to the reject contract
        vm.prank(owner);
        royaltyAutoClaim.transferOwnership(address(rejectContract));

        // Try to emergency withdraw - should fail because the owner cannot receive ETH
        vm.prank(address(rejectContract));
        vm.expectRevert(); // The require(success) will cause a revert
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, 1 ether);
    }

    // ======================================== Admin Functions ========================================

    // ======================================== adminRegisterSubmission ========================================

    function test_adminRegisterSubmission() public {
        // Admin can register directly
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, recipient, "Royalty recipient should be the recipient");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );
    }

    function testCannot_adminRegisterSubmission_if_not_admin() public {
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);
    }

    function testCannot_adminRegisterSubmission_with_empty_title() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.EmptyString.selector));
        royaltyAutoClaim.adminRegisterSubmission("", recipient);
    }

    function testCannot_adminRegisterSubmission_with_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.adminRegisterSubmission("test", address(0));
    }

    function testCannot_adminRegisterSubmission_if_already_registered() public {
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyRegistered.selector));
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);
    }

    function test_adminRegisterSubmission_multiple_unique_titles(uint8 count) public {
        // Constrain count to reasonable range [1, 10]
        vm.assume(count > 0 && count <= 10);

        // Admin can register multiple submissions with unique titles
        for (uint256 i = 0; i < count; i++) {
            string memory title = string(abi.encodePacked("test", vm.toString(i)));

            vm.prank(admin);
            royaltyAutoClaim.adminRegisterSubmission(title, recipient);

            RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(title);
            assertEq(submission.royaltyRecipient, recipient, "Royalty recipient should match");
            assertEq(
                uint256(submission.status),
                uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
                "Submission status should be Registered"
            );
        }
    }

    // ======================================== adminUpdateRoyaltyRecipient ========================================

    function test_adminUpdateRoyaltyRecipient() public {
        // First register a submission
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        // Create a new recipient address
        address newRecipient = makeAddr("newRecipient");

        // Admin can update the recipient
        vm.prank(admin);
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", newRecipient);

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, newRecipient, "Royalty recipient should be updated");
    }

    function testCannot_adminUpdateRoyaltyRecipient_if_not_admin() public {
        // First register a submission
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        address newRecipient = makeAddr("newRecipient");

        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", newRecipient);
    }

    function testCannot_adminUpdateRoyaltyRecipient_if_not_registered() public {
        address newRecipient = makeAddr("newRecipient");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", newRecipient);
    }

    function testCannot_adminUpdateRoyaltyRecipient_with_zero_address() public {
        // First register a submission
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", address(0));
    }

    function testCannot_adminUpdateRoyaltyRecipient_with_same_address() public {
        // First register a submission
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SameAddress.selector));
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", recipient);
    }

    function test_adminUpdateRoyaltyRecipient_multiple_times() public {
        // First register a submission
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        // Update recipient multiple times
        for (uint256 i = 1; i <= 5; i++) {
            address newRecipient = makeAddr(string(abi.encodePacked("recipient", vm.toString(i))));

            vm.prank(admin);
            royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", newRecipient);

            RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
            assertEq(submission.royaltyRecipient, newRecipient, "Royalty recipient should be updated");
        }
    }

    function testCannot_adminUpdateRoyaltyRecipient_after_claimed() public {
        // Register and setup for claiming
        vm.prank(admin);
        royaltyAutoClaim.adminRegisterSubmission("test", recipient);

        // Add reviews
        _reviewSubmissionWithProof("test", 60, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 80, reviewer2Nullifier1);

        // Claim the royalty
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        // Try to update recipient after claim
        address newRecipient = makeAddr("newRecipient");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.adminUpdateRoyaltyRecipient("test", newRecipient);
    }

    // ================================== revokeSubmission ==================================
    function test_revokeSubmission() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        vm.prank(admin);
        royaltyAutoClaim.revokeSubmission("test");

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.NotExist),
            "Submission should be deleted"
        );
        assertEq(submission.royaltyRecipient, address(0), "Royalty recipient should be zero");
        assertEq(submission.reviewCount, 0, "Review count should be zero");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be zero");
    }

    function testCannot_revokeSubmission_if_not_admin() public {
        vm.prank(admin);
        _registerSubmission("test", vm.randomAddress());

        // Try to revoke as non-admin
        vm.prank(fake);
        vm.expectRevert();
        royaltyAutoClaim.revokeSubmission("test");
    }

    function testCannot_revokeSubmission_if_the_submission_is_claimed_or_not_exist() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.revokeSubmission("test");

        vm.prank(admin);
        _registerSubmission("test", recipient);
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert();
        royaltyAutoClaim.revokeSubmission("test");
    }

    // ================================== updateEmailVerifier ==================================

    function test_updateEmailVerifier() public {
        address newVerifier = vm.randomAddress();
        vm.prank(admin);
        royaltyAutoClaim.updateEmailVerifier(IEmailVerifier(newVerifier));
        assertEq(royaltyAutoClaim.emailVerifier(), newVerifier);
    }

    function testCannot_updateEmailVerifier_if_not_admin() public {
        address newVerifier = vm.randomAddress();
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.updateEmailVerifier(IEmailVerifier(newVerifier));
    }

    function testCannot_updateEmailVerifier_if_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.updateEmailVerifier(IEmailVerifier(address(0)));
    }

    // ================================== revokeEmail ==================================

    function test_revokeEmail() public {
        uint256 emailNumber = 12345;

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit IRoyaltyAutoClaim.EmailRevoked(emailNumber);
        royaltyAutoClaim.revokeEmail(emailNumber);

        assertTrue(royaltyAutoClaim.isEmailRevoked(emailNumber));
    }

    function testCannot_revokeEmail_if_not_admin() public {
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.revokeEmail(12345);
    }

    function testCannot_registerSubmission_with_revoked_email() public {
        uint256 emailNumber = 12345;

        // Revoke email number
        vm.prank(admin);
        royaltyAutoClaim.revokeEmail(emailNumber);

        // Create proof with revoked email number
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProofWithNumber(
            recipient,
            bytes32(vm.randomUint()),
            TitleHashVerifierLib.OperationType.REGISTRATION,
            bytes32(0),
            emailNumber
        );

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.RevokedEmail.selector, emailNumber));
        royaltyAutoClaim.registerSubmission("test", proof);
    }

    function testCannot_updateRoyaltyRecipient_with_revoked_email() public {
        // First register
        _registerSubmission("test", recipient);

        uint256 emailNumber = 67890;

        // Revoke email number
        vm.prank(admin);
        royaltyAutoClaim.revokeEmail(emailNumber);

        // Try to update with revoked email
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProofWithNumber(
            vm.randomAddress(),
            bytes32(vm.randomUint()),
            TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE,
            bytes32(0),
            emailNumber
        );

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.RevokedEmail.selector, emailNumber));
        royaltyAutoClaim.updateRoyaltyRecipient("test", proof);
    }

    function test_isEmailRevoked() public view {
        assertFalse(royaltyAutoClaim.isEmailRevoked(12345));
    }

    function test_revokeEmail_via_erc4337() public {
        uint256 emailNumber = 99999;

        PackedUserOperation memory userOp = _buildUserOp(
            adminKey, address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.revokeEmail, (emailNumber))
        );

        vm.expectEmit(true, false, false, false);
        emit IRoyaltyAutoClaim.EmailRevoked(emailNumber);
        _handleUserOp(userOp);

        assertTrue(royaltyAutoClaim.isEmailRevoked(emailNumber));
    }

    // ======================================== Reviewer Functions ========================================

    function test_reviewSubmission_with_semaphore_proof() public {
        _registerSubmission("test", recipient);

        // Test with different royalty levels
        uint16[] memory validLevels = new uint16[](4);
        validLevels[0] = royaltyAutoClaim.ROYALTY_LEVEL_20();
        validLevels[1] = royaltyAutoClaim.ROYALTY_LEVEL_40();
        validLevels[2] = royaltyAutoClaim.ROYALTY_LEVEL_60();
        validLevels[3] = royaltyAutoClaim.ROYALTY_LEVEL_80();

        for (uint256 i = 0; i < validLevels.length; i++) {
            string memory title = string(abi.encodePacked("test", vm.toString(i)));
            _registerSubmission(title, recipient);

            ISemaphore.SemaphoreProof memory proof =
                _createSemaphoreProof(reviewer1Nullifier1 + i, validLevels[i], title);

            royaltyAutoClaim.reviewSubmission(title, validLevels[i], proof);

            RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(title);
            assertEq(submission.reviewCount, 1);
            assertEq(submission.totalRoyaltyLevel, validLevels[i]);
            assertTrue(royaltyAutoClaim.hasReviewed(title, reviewer1Nullifier1 + i));
        }
    }

    function testCannot_reviewSubmission_if_the_submission_is_claimed_or_not_exist() public {
        // Test non-existent submission
        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(reviewer1Nullifier1, 20, "test");
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.reviewSubmission("test", 20, proof);

        // Setup a submission and get it to claimed state
        address recipient = vm.randomAddress();
        vm.prank(admin);
        _registerSubmission("test", recipient);

        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);

        // Claim the royalty
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        // Test reviewing a claimed submission
        ISemaphore.SemaphoreProof memory proof2 = _createSemaphoreProof(reviewer1Nullifier2, 20, "test");
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.reviewSubmission("test", 20, proof2);
    }

    function testCannot_reviewSubmission_with_invalid_semaphore_proof() public {
        _registerSubmission("test", recipient);

        // Set mock to return false
        MockSemaphore(address(mockSemaphore)).setMockVerifyResult(false);

        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(reviewer1Nullifier1, 20, "test");

        vm.expectRevert(IRoyaltyAutoClaim.InvalidSemaphoreProof.selector);
        royaltyAutoClaim.reviewSubmission("test", 20, proof);

        // Reset mock
        MockSemaphore(address(mockSemaphore)).setMockVerifyResult(true);
    }

    function testCannot_reviewSubmission_with_invalid_royalty_level() public {
        // Register submission
        vm.prank(admin);
        _registerSubmission("test", vm.randomAddress());

        // Try invalid royalty levels
        uint16[] memory invalidLevels = new uint16[](4);
        invalidLevels[0] = 0;
        invalidLevels[1] = 30;
        invalidLevels[2] = 100;
        invalidLevels[3] = 255;

        for (uint256 i = 0; i < invalidLevels.length; i++) {
            ISemaphore.SemaphoreProof memory proof =
                _createSemaphoreProof(reviewer1Nullifier1 + i, invalidLevels[i], "test");
            vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidRoyaltyLevel.selector, invalidLevels[i]));
            royaltyAutoClaim.reviewSubmission("test", invalidLevels[i], proof);
        }
    }

    function testCannot_reviewSubmission_multiple_times() public {
        _registerSubmission("test", recipient);

        uint256 nullifier = reviewer1Nullifier1;

        // First review succeeds
        _reviewSubmissionWithProof("test", 20, nullifier);

        // Second review with same nullifier fails
        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(nullifier, 40, "test");
        vm.expectRevert(IRoyaltyAutoClaim.AlreadyReviewed.selector);
        royaltyAutoClaim.reviewSubmission("test", 40, proof);
    }

    // ======================================== Recipient Functions ========================================

    function test_claimRoyalty_with_erc20() public {
        address recipient = vm.randomAddress();
        uint256 initialBalance = token.balanceOf(address(proxy));
        uint256 expectedRoyalty = 30 ether; // (20 + 40) / 2 = 30

        // Setup submission and reviews
        vm.prank(admin);
        _registerSubmission("test", recipient);
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);

        // Should fail if not recipient
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.claimRoyalty("test");

        // Claim royalty
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        // Verify state changes
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(
            uint256(submission.status), uint256(IRoyaltyAutoClaim.SubmissionStatus.Claimed), "Status should be Claimed"
        );
        assertEq(token.balanceOf(recipient), expectedRoyalty, "Recipient should receive correct royalty");
        assertEq(token.balanceOf(address(proxy)), initialBalance - expectedRoyalty, "Proxy balance should decrease");
    }

    function testCannot_claimRoyalty_if_not_recipient() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake));
        royaltyAutoClaim.claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_submission_not_registered() public {
        vm.expectRevert();
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("nonexistent");
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        address recipient = vm.randomAddress();

        // Setup submission and reviews
        vm.prank(admin);
        _registerSubmission("test", recipient);
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);

        // First claim should succeed
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");

        // Second claim should fail
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        royaltyAutoClaim.claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_not_enough_reviews() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_zero_royalty() public {
        vm.prank(admin);
        _registerSubmission("test", recipient);

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");
    }

    // ======================================== View Functions ========================================

    function test_isSubmissionClaimable() public {
        // Case 1: Submission does not exist
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test"), "Non-existent submission should not be claimable");

        // Case 2: Submission is registered but has no reviews
        vm.prank(admin);
        _registerSubmission("test", recipient);
        assertFalse(
            royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with no reviews should not be claimable"
        );

        // Case 3: Submission has one review (not enough)
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        assertFalse(
            royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with one review should not be claimable"
        );

        // Case 4: Submission has enough reviews (two or more)
        _reviewSubmissionWithProof("test", 40, reviewer2Nullifier1);
        assertTrue(royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with two reviews should be claimable");

        // Case 5: Submission is claimed (should not be claimable)
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty("test");
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test"), "Claimed submission should not be claimable");

        // Case 6: Submission is revoked
        vm.prank(admin);
        _registerSubmission("test2", recipient);
        vm.prank(admin);
        royaltyAutoClaim.revokeSubmission("test2");
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test2"), "Revoked submission should not be claimable");
    }

    function test_isAdmin() public view {
        assertTrue(royaltyAutoClaim.isAdmin(admin));
        assertFalse(royaltyAutoClaim.isAdmin(fake));
    }

    function test_isRecipient() public {
        string memory title = "test";
        address recipient = recipient;
        vm.prank(admin);
        _registerSubmission(title, recipient);
        assertTrue(royaltyAutoClaim.isRecipient(title, recipient));
        assertFalse(royaltyAutoClaim.isRecipient(title, fake));
    }

    function test_getRoyalty() public {
        string memory title = "test";
        vm.prank(admin);
        _registerSubmission(title, recipient);

        _reviewSubmissionWithProof(title, 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof(title, 40, reviewer2Nullifier1);

        // Expected: (20 + 40) / 2 = 30 ether
        assertEq(royaltyAutoClaim.getRoyalty(title), 30 ether, "Should calculate average of two reviews correctly");

        // Case 2: Three reviews with same level (all 20)
        string memory title2 = "test2";
        vm.prank(admin);
        _registerSubmission(title2, recipient);

        _reviewSubmissionWithProof(title2, 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof(title2, 20, reviewer2Nullifier1);
        _reviewSubmissionWithProof(title2, 20, reviewer1Nullifier2);

        // Expected: (20 + 20 + 20) / 3 = 20 ether
        assertEq(
            royaltyAutoClaim.getRoyalty(title2),
            20 ether,
            "Should calculate average of three identical reviews correctly"
        );

        // Case 3: No reviews (should return 0)
        string memory title3 = "test3";
        vm.prank(admin);
        _registerSubmission(title3, recipient);
        assertEq(royaltyAutoClaim.getRoyalty(title3), 0, "Should return 0 for submission with no reviews");

        // Case 4: Claimed submission (should still calculate correctly)
        vm.prank(recipient);
        royaltyAutoClaim.claimRoyalty(title); // Claim the first submission
        assertEq(royaltyAutoClaim.getRoyalty(title), 30 ether, "Should calculate correctly even after claiming");

        // Case 5: Non-existent submission (should return 0)
        assertEq(royaltyAutoClaim.getRoyalty("nonexistent"), 0, "Should return 0 for non-existent submission");
    }

    // ======================================== Semaphore-Specific Tests ========================================

    function test_reviewSubmission_same_identity_different_submissions() public {
        // Same reviewer can review different submissions (different scopes)
        _registerSubmission("test1", recipient);
        _registerSubmission("test2", recipient);

        // Review both with same identity but different nullifiers
        _reviewSubmissionWithProof("test1", 20, reviewer1Nullifier1);
        _reviewSubmissionWithProof("test2", 40, reviewer1Nullifier2);

        assertTrue(royaltyAutoClaim.hasReviewed("test1", reviewer1Nullifier1));
        assertTrue(royaltyAutoClaim.hasReviewed("test2", reviewer1Nullifier2));
    }

    function testCannot_reviewSubmission_with_message_mismatch() public {
        _registerSubmission("test", recipient);

        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(reviewer1Nullifier1, 20, "test");

        // Tamper with message
        proof.message = 40;

        vm.expectRevert(IRoyaltyAutoClaim.MessageMismatch.selector);
        royaltyAutoClaim.reviewSubmission("test", 20, proof);
    }

    function testCannot_reviewSubmission_with_scope_mismatch() public {
        _registerSubmission("test", recipient);

        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(reviewer1Nullifier1, 20, "test");

        // Tamper with scope
        proof.scope = uint256(keccak256(abi.encodePacked("wrong_title")));

        vm.expectRevert(IRoyaltyAutoClaim.ScopeMismatch.selector);
        royaltyAutoClaim.reviewSubmission("test", 20, proof);
    }

    function testCannot_reviewSubmission_if_not_called_by_entrypoint() public {
        _registerSubmission("test", recipient);

        // Try to call the onlyEntryPoint version directly
        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        royaltyAutoClaim.reviewSubmission4337("test", 20, reviewer1Nullifier1);
    }

    function test_hasReviewed() public {
        _registerSubmission("test", recipient);

        // Before review
        assertFalse(royaltyAutoClaim.hasReviewed("test", reviewer1Nullifier1));

        // After review
        _reviewSubmissionWithProof("test", 20, reviewer1Nullifier1);
        assertTrue(royaltyAutoClaim.hasReviewed("test", reviewer1Nullifier1));

        // Different nullifier not marked
        assertFalse(royaltyAutoClaim.hasReviewed("test", reviewer2Nullifier1));
    }

    function test_semaphore() public view {
        assertEq(address(royaltyAutoClaim.semaphore()), address(mockSemaphore));
    }

    function test_reviewerGroupId() public view {
        uint256 groupId = royaltyAutoClaim.reviewerGroupId();
        assertGt(groupId, 0, "Group ID should be set");
    }

    function test_entryPoint() public view {
        assertEq(address(royaltyAutoClaim.entryPoint()), address(ENTRY_POINT));
    }
}

