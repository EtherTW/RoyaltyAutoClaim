// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import "../utils/MockV2.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*

    Test case order
    (Find following keywords to quickly navigate)

    Owner Functions
    Admin Functions
    Reviewer Functions
    Submitter Functions
    View Functions
    Internal Functions

*/

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

/// @dev for testing internal functions
contract RoyaltyAutoClaimHarness is RoyaltyAutoClaim {
    bytes32 private constant TRANSIENT_SIGNER_SLOT = 0xbbc49793e8d16b6166d591f0a7a95f88efe9e6a08bf1603701d7f0fe05d7d600;

    function exposed_getUserOpSigner() external view returns (address) {
        return _getUserOpSigner();
    }

    // Helper function to set transient storage for testing
    function setTransientSigner(address signer) external {
        assembly {
            tstore(TRANSIENT_SIGNER_SLOT, signer)
        }
    }
}

contract RoyaltyAutoClaim_Unit_Test is Test {
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address[] initialReviewers = new address[](3);

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;
    RoyaltyAutoClaimHarness harness;

    IERC20 token;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function setUp() public {
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

        // harness
        harness = new RoyaltyAutoClaimHarness();
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

    function test_receive_and_fallback() public {
        // Test direct Ether transfer
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
            abi.encodeCall(RoyaltyAutoClaim.initialize, (address(0), admin, address(token), initialReviewers))
        );

        // Test zero admin
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, address(0), address(token), initialReviewers))
        );

        // Test zero token
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        new RoyaltyAutoClaimProxy(
            address(newImpl), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(0), initialReviewers))
        );
    }

    // ======================================== Owner Functions ========================================

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

    function test_transferOwnership() public {
        address newOwner = vm.addr(0xbeef);

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        royaltyAutoClaim.transferOwnership(newOwner);

        // Should succeed when called by owner
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
        address newAdmin = vm.randomAddress();

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        royaltyAutoClaim.changeAdmin(newAdmin);

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.changeAdmin(address(0));

        // Should succeed when called by owner
        vm.prank(owner);
        royaltyAutoClaim.changeAdmin(newAdmin);
        assertEq(royaltyAutoClaim.admin(), newAdmin);
    }

    function test_changeRoyaltyToken() public {
        address newToken = vm.randomAddress();

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        royaltyAutoClaim.changeRoyaltyToken(newToken);

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.changeRoyaltyToken(address(0));

        // Should succeed when called by owner
        vm.prank(owner);
        royaltyAutoClaim.changeRoyaltyToken(newToken);
        assertEq(royaltyAutoClaim.token(), newToken);
    }

    function test_renounceOwnership() public {
        // Should always revert
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.RenounceOwnershipDisabled.selector));
        royaltyAutoClaim.renounceOwnership();
    }

    function test_emergencyWithdraw() public {
        uint256 amount = 1 ether;

        // Test native token withdrawal
        uint256 ownerBalanceBefore = owner.balance;

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, amount);

        // Should succeed when called by owner
        vm.prank(owner);
        royaltyAutoClaim.emergencyWithdraw(NATIVE_TOKEN, amount);
        assertEq(owner.balance, ownerBalanceBefore + amount);

        // Test ERC20 token withdrawal
        uint256 tokenBalanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        royaltyAutoClaim.emergencyWithdraw(address(token), amount);
        assertEq(token.balanceOf(owner), tokenBalanceBefore + amount);
    }

    // ======================================== Admin Functions ========================================

    function test_updateReviewers() public {
        address[] memory newReviewers = new address[](2);
        bool[] memory status = new bool[](2);

        newReviewers[0] = vm.addr(5);
        newReviewers[1] = vm.addr(6);
        status[0] = true;
        status[1] = false;

        // Should fail if not admin
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        royaltyAutoClaim.updateReviewers(newReviewers, status);

        // Should fail if arrays have different lengths
        bool[] memory invalidStatus = new bool[](1);
        invalidStatus[0] = true;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidArrayLength.selector));
        royaltyAutoClaim.updateReviewers(newReviewers, invalidStatus);

        // Should succeed when called by admin
        vm.prank(admin);
        royaltyAutoClaim.updateReviewers(newReviewers, status);

        // Verify the updates
        assertEq(royaltyAutoClaim.isReviewer(newReviewers[0]), true);
        assertEq(royaltyAutoClaim.isReviewer(newReviewers[1]), false);

        // Test removing an existing reviewer
        address[] memory existingReviewers = new address[](1);
        bool[] memory removeStatus = new bool[](1);
        existingReviewers[0] = initialReviewers[0];
        removeStatus[0] = false;

        vm.prank(admin);
        royaltyAutoClaim.updateReviewers(existingReviewers, removeStatus);
        assertEq(royaltyAutoClaim.isReviewer(initialReviewers[0]), false);
    }

    function testCannot_updateReviewers_if_array_length_is_0() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidArrayLength.selector));
        royaltyAutoClaim.updateReviewers(new address[](0), new bool[](0));
    }

    function test_registerSubmission() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be the submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(IRoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );
    }

    function testCannot_registerSubmission_if_the_submission_already_exists_or_is_claimed() public {
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        vm.prank(admin);
        vm.expectRevert(); // submission already exists
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert(); // submission is claimed
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());
    }

    function testCannot_registerSubmission_if_not_admin() public {
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());
    }

    function testCannot_registerSubmission_with_empty_title() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.EmptyTitle.selector));
        royaltyAutoClaim.registerSubmission("", vm.randomAddress());
    }

    function testCannot_registerSubmission_with_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector));
        royaltyAutoClaim.registerSubmission("test", address(0));
    }

    function test_updateRoyaltyRecipient() public {
        address originalRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        // Register submission first
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", originalRecipient);

        // Update recipient
        vm.prank(admin);
        royaltyAutoClaim.updateRoyaltyRecipient("test", newRecipient);

        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(submission.royaltyRecipient, newRecipient, "Royalty recipient should be updated");
    }

    function testCannot_updateRoyaltyRecipient_if_not_admin() public {
        // Register submission first
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        // Try to update as non-admin
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        royaltyAutoClaim.updateRoyaltyRecipient("test", vm.randomAddress());
    }

    function testCannot_updateRoyaltyRecipient_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        royaltyAutoClaim.updateRoyaltyRecipient("test", vm.randomAddress());

        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert();
        royaltyAutoClaim.updateRoyaltyRecipient("test", vm.randomAddress());
    }

    function test_revokeSubmission() public {
        address submitter = vm.randomAddress();

        // Register submission first
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        // Revoke submission
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
        // Register submission first
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        // Try to revoke as non-admin
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        royaltyAutoClaim.revokeSubmission("test");
    }

    function testCannot_revokeSubmission_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        royaltyAutoClaim.revokeSubmission("test");

        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);
        royaltyAutoClaim.claimRoyalty("test");

        vm.expectRevert();
        royaltyAutoClaim.revokeSubmission("test");
    }

    // ======================================== Reviewer Functions ========================================

    function test_reviewSubmission() public {
        address submitter = vm.randomAddress();

        // Register submission
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        // Add more reviewers for testing
        address[] memory testReviewers = new address[](4);
        bool[] memory status = new bool[](4);
        for (uint256 i = 0; i < 4; i++) {
            testReviewers[i] = vm.addr(10 + i);
            status[i] = true;
        }
        vm.prank(admin);
        royaltyAutoClaim.updateReviewers(testReviewers, status);

        // Test all valid royalty levels with different reviewers
        uint16[] memory validLevels = new uint16[](4);
        validLevels[0] = 20;
        validLevels[1] = 40;
        validLevels[2] = 60;
        validLevels[3] = 80;

        uint256 expectedTotalLevel = 0;
        for (uint256 i = 0; i < validLevels.length; i++) {
            vm.prank(testReviewers[i]);
            royaltyAutoClaim.reviewSubmission("test", validLevels[i]);

            expectedTotalLevel += validLevels[i];

            RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
            assertEq(submission.reviewCount, i + 1, "Review count should increment");
            assertEq(submission.totalRoyaltyLevel, expectedTotalLevel, "Total royalty level should be cumulative");

            // Verify hasReviewed is set to true for the reviewer
            assertTrue(
                royaltyAutoClaim.hasReviewed("test", testReviewers[i]), "hasReviewed should be true for reviewer"
            );

            // Verify hasReviewed is still false for unused reviewers
            for (uint256 j = i + 1; j < testReviewers.length; j++) {
                assertFalse(
                    royaltyAutoClaim.hasReviewed("test", testReviewers[j]),
                    "hasReviewed should be false for unused reviewers"
                );
            }
        }
    }

    function testCannot_reviewSubmission_if_the_submission_is_claimed_or_not_exist() public {
        // Test non-existent submission
        vm.prank(initialReviewers[0]);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.reviewSubmission("test", 20);

        // Setup a submission and get it to claimed state
        address submitter = vm.randomAddress();
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        // Claim the royalty
        royaltyAutoClaim.claimRoyalty("test");

        // Test reviewing a claimed submission
        vm.prank(initialReviewers[0]);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionStatusNotRegistered.selector));
        royaltyAutoClaim.reviewSubmission("test", 20);
    }

    function testCannot_reviewSubmission_if_not_reviewer() public {
        // Register submission
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        // Try to review as non-reviewer
        address nonReviewer = vm.addr(0xbeef);
        vm.prank(nonReviewer);
        vm.expectRevert();
        royaltyAutoClaim.reviewSubmission("test", 20);
    }

    function testCannot_reviewSubmission_with_invalid_royalty_level() public {
        // Register submission
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        // Try invalid royalty levels
        uint16[] memory invalidLevels = new uint16[](4);
        invalidLevels[0] = 0;
        invalidLevels[1] = 30;
        invalidLevels[2] = 100;
        invalidLevels[3] = 255;

        for (uint256 i = 0; i < invalidLevels.length; i++) {
            vm.prank(initialReviewers[0]);
            vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.InvalidRoyaltyLevel.selector, invalidLevels[i]));
            royaltyAutoClaim.reviewSubmission("test", invalidLevels[i]);
        }
    }

    function testCannot_reviewSubmission_multiple_times() public {
        // Register submission
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", vm.randomAddress());

        // First review should succeed
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);

        // Second review from same reviewer should fail
        vm.prank(initialReviewers[0]);
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyReviewed.selector));
        royaltyAutoClaim.reviewSubmission("test", 40);
    }

    // ======================================== Submitter Functions ========================================

    function test_claimRoyalty_with_erc20() public {
        address submitter = vm.randomAddress();
        uint256 initialBalance = token.balanceOf(address(proxy));
        uint256 expectedRoyalty = 30 ether; // (20 + 40) / 2 = 30

        // Setup submission and reviews
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        // Claim royalty
        royaltyAutoClaim.claimRoyalty("test");

        // Verify state changes
        RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions("test");
        assertEq(
            uint256(submission.status), uint256(IRoyaltyAutoClaim.SubmissionStatus.Claimed), "Status should be Claimed"
        );
        assertEq(token.balanceOf(submitter), expectedRoyalty, "Submitter should receive correct royalty");
        assertEq(token.balanceOf(address(proxy)), initialBalance - expectedRoyalty, "Proxy balance should decrease");
    }

    function testCannot_claimRoyalty_if_submission_not_registered() public {
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        royaltyAutoClaim.claimRoyalty("nonexistent");
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        address submitter = vm.randomAddress();

        // Setup submission and reviews
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        // First claim should succeed
        royaltyAutoClaim.claimRoyalty("test");

        // Second claim should fail
        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        royaltyAutoClaim.claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_not_enough_reviews() public {
        address submitter = vm.randomAddress();

        // Setup submission with only one review
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        royaltyAutoClaim.claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_zero_royalty() public {
        address submitter = vm.randomAddress();

        // Setup submission with zero royalty reviews
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        vm.expectRevert(abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector));
        royaltyAutoClaim.claimRoyalty("test");
    }

    // ======================================== View Functions ========================================

    function test_isSubmissionClaimable() public {
        address submitter = vm.randomAddress();

        // Case 1: Submission does not exist
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test"), "Non-existent submission should not be claimable");

        // Case 2: Submission is registered but has no reviews
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        assertFalse(
            royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with no reviews should not be claimable"
        );

        // Case 3: Submission has one review (not enough)
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        assertFalse(
            royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with one review should not be claimable"
        );

        // Case 4: Submission has enough reviews (two or more)
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);
        assertTrue(royaltyAutoClaim.isSubmissionClaimable("test"), "Submission with two reviews should be claimable");

        // Case 5: Submission is claimed (should not be claimable)
        royaltyAutoClaim.claimRoyalty("test");
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test"), "Claimed submission should not be claimable");

        // Case 6: Submission is revoked
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test2", submitter);
        vm.prank(admin);
        royaltyAutoClaim.revokeSubmission("test2");
        assertFalse(royaltyAutoClaim.isSubmissionClaimable("test2"), "Revoked submission should not be claimable");
    }

    function test_entryPoint() public view {
        assertEq(royaltyAutoClaim.entryPoint(), 0x0000000071727De22E5E9d8BAf0edAc6f37da032);
    }

    // ======================================== Internal Functions ========================================

    function test_getUserOpSigner() public {
        address expectedSigner = vm.addr(0xbeef);

        // Set up the test conditions
        vm.prank(ENTRY_POINT);
        harness.setTransientSigner(expectedSigner);

        // Test the function when called from EntryPoint
        vm.prank(ENTRY_POINT);
        address actualSigner = harness.exposed_getUserOpSigner();
        assertEq(actualSigner, expectedSigner, "Should return the correct signer address");
    }

    function testCannot_getUserOpSigner_if_not_from_entrypoint() public {
        address signer = vm.addr(0xbeef);
        harness.setTransientSigner(signer);

        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        harness.exposed_getUserOpSigner();
    }

    function testCannot_getUserOpSigner_if_signer_is_zero() public {
        // Don't set any signer, so it defaults to address(0)
        vm.prank(ENTRY_POINT);
        vm.expectRevert(IRoyaltyAutoClaim.ZeroAddress.selector);
        harness.exposed_getUserOpSigner();
    }
}
