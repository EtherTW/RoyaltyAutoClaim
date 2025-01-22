// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../src/RoyaltyAutoClaim.sol";
import "../src/RoyaltyAutoClaimProxy.sol";
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
    RoyaltyAutoClaimProxy proxy;
    IERC20 token;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function setUp() public override {
        super.setUp();

        reviewers[0] = vm.addr(3);
        reviewers[1] = vm.addr(4);

        token = new MockERC20(owner);

        royaltyAutoClaim = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
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

    function test_simple_flow() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(RoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 0 ether, "Royalty should be 0");

        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }

    // ======================================== Upgradeable functions ========================================

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

        PackedUserOperation memory userOp = buildUserOp(
            0xbeef,
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        userOp = buildUserOp(
            1,
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        handleUserOp(userOp);
        assertEq(address(uint160(uint256(vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2));
    }

    // ======================================== Owner Functions ========================================

    function test_changeAdmin() public {
        address newAdmin = vm.randomAddress();

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).changeAdmin(newAdmin);

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.ZeroAddress.selector));
        RoyaltyAutoClaim(address(proxy)).changeAdmin(address(0));

        // Should succeed when called by owner
        vm.prank(owner);
        RoyaltyAutoClaim(address(proxy)).changeAdmin(newAdmin);
        assertEq(RoyaltyAutoClaim(address(proxy)).admin(), newAdmin);
    }

    function test_changeRoyaltyToken() public {
        address newToken = vm.randomAddress();

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).changeRoyaltyToken(newToken);

        // Should fail if zero address
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.ZeroAddress.selector));
        RoyaltyAutoClaim(address(proxy)).changeRoyaltyToken(address(0));

        // Should succeed when called by owner
        vm.prank(owner);
        RoyaltyAutoClaim(address(proxy)).changeRoyaltyToken(newToken);
        assertEq(RoyaltyAutoClaim(address(proxy)).token(), newToken);
    }

    function test_renounceOwnership() public {
        // Should always revert
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.RenounceOwnershipDisabled.selector));
        RoyaltyAutoClaim(address(proxy)).renounceOwnership();
    }

    function test_emergencyWithdraw() public {
        uint256 amount = 1 ether;

        // Test native token withdrawal
        uint256 ownerBalanceBefore = owner.balance;

        // Should fail if not owner
        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).emergencyWithdraw(NATIVE_TOKEN, amount);

        // Should succeed when called by owner
        vm.prank(owner);
        RoyaltyAutoClaim(address(proxy)).emergencyWithdraw(NATIVE_TOKEN, amount);
        assertEq(owner.balance, ownerBalanceBefore + amount);

        // Test ERC20 token withdrawal
        uint256 tokenBalanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        RoyaltyAutoClaim(address(proxy)).emergencyWithdraw(address(token), amount);
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
        RoyaltyAutoClaim(address(proxy)).updateReviewers(newReviewers, status);

        // Should fail if arrays have different lengths
        bool[] memory invalidStatus = new bool[](1);
        invalidStatus[0] = true;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.ArrayLengthMismatch.selector));
        RoyaltyAutoClaim(address(proxy)).updateReviewers(newReviewers, invalidStatus);

        // Should succeed when called by admin
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).updateReviewers(newReviewers, status);

        // Verify the updates
        assertEq(RoyaltyAutoClaim(address(proxy)).isReviewer(newReviewers[0]), true);
        assertEq(RoyaltyAutoClaim(address(proxy)).isReviewer(newReviewers[1]), false);

        // Test removing an existing reviewer
        address[] memory existingReviewers = new address[](1);
        bool[] memory removeStatus = new bool[](1);
        existingReviewers[0] = reviewers[0];
        removeStatus[0] = false;

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).updateReviewers(existingReviewers, removeStatus);
        assertEq(RoyaltyAutoClaim(address(proxy)).isReviewer(reviewers[0]), false);
    }

    function test_registerSubmission() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be the submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(RoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );
    }

    function testCannot_registerSubmission_if_the_submission_already_exists_or_is_claimed() public {
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        vm.prank(admin);
        vm.expectRevert(); // submission already exists
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert(); // submission is claimed
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
    }

    function testCannot_registerSubmission_if_not_admin() public {
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
    }

    function testCannot_registerSubmission_with_empty_title() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.EmptyTitle.selector));
        RoyaltyAutoClaim(address(proxy)).registerSubmission("", vm.randomAddress());
    }

    function testCannot_registerSubmission_with_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.ZeroAddress.selector));
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", address(0));
    }

    function test_updateRoyaltyRecipient_success() public {
        address originalRecipient = vm.randomAddress();
        address newRecipient = vm.randomAddress();

        // Register submission first
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", originalRecipient);

        // Update recipient
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", newRecipient);

        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(submission.royaltyRecipient, newRecipient, "Royalty recipient should be updated");
    }

    function testCannot_updateRoyaltyRecipient_if_not_admin() public {
        // Register submission first
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        // Try to update as non-admin
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", vm.randomAddress());
    }

    function testCannot_updateRoyaltyRecipient_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", vm.randomAddress());

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", vm.randomAddress());
    }

    function test_revokeSubmission_success() public {
        address submitter = vm.randomAddress();

        // Register submission first
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        // Revoke submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");

        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(
            uint256(submission.status),
            uint256(RoyaltyAutoClaim.SubmissionStatus.NotExist),
            "Submission should be deleted"
        );
        assertEq(submission.royaltyRecipient, address(0), "Royalty recipient should be zero");
        assertEq(submission.reviewCount, 0, "Review count should be zero");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be zero");
    }

    function testCannot_revokeSubmission_if_not_admin() public {
        // Register submission first
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        // Try to revoke as non-admin
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");
    }

    function testCannot_revokeSubmission_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");
    }

    // ======================================== Reviewer Functions ========================================

    function test_reviewSubmission_success() public {
        address submitter = vm.randomAddress();

        // Register submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        // Add more reviewers for testing
        address[] memory testReviewers = new address[](4);
        bool[] memory status = new bool[](4);
        for (uint256 i = 0; i < 4; i++) {
            testReviewers[i] = vm.addr(10 + i);
            status[i] = true;
        }
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).updateReviewers(testReviewers, status);

        // Test all valid royalty levels with different reviewers
        uint16[] memory validLevels = new uint16[](4);
        validLevels[0] = 20;
        validLevels[1] = 40;
        validLevels[2] = 60;
        validLevels[3] = 80;

        uint256 expectedTotalLevel = 0;
        for (uint256 i = 0; i < validLevels.length; i++) {
            vm.prank(testReviewers[i]);
            RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", validLevels[i]);

            expectedTotalLevel += validLevels[i];

            RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
            assertEq(submission.reviewCount, i + 1, "Review count should increment");
            assertEq(submission.totalRoyaltyLevel, expectedTotalLevel, "Total royalty level should be cumulative");
        }
    }

    function testCannot_reviewSubmission_if_not_reviewer() public {
        // Register submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        // Try to review as non-reviewer
        address nonReviewer = vm.addr(0xbeef);
        vm.prank(nonReviewer);
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
    }

    function testCannot_reviewSubmission_with_invalid_royalty_level() public {
        // Register submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        // Try invalid royalty levels
        uint16[] memory invalidLevels = new uint16[](4);
        invalidLevels[0] = 0;
        invalidLevels[1] = 30;
        invalidLevels[2] = 100;
        invalidLevels[3] = 255;

        for (uint256 i = 0; i < invalidLevels.length; i++) {
            vm.prank(reviewers[0]);
            vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.InvalidRoyaltyLevel.selector, invalidLevels[i]));
            RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", invalidLevels[i]);
        }
    }

    function testCannot_reviewSubmission_multiple_times() public {
        // Register submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        // First review should succeed
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        // Second review from same reviewer should fail
        vm.prank(reviewers[0]);
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.AlreadyReviewed.selector));
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
    }

    function testCannot_reviewSubmission_multiple_times_4337() public {
        address submitter = vm.randomAddress();
        address reviewer = vm.addr(0xbeef);

        // Register reviewer
        address[] memory testReviewers = new address[](1);
        bool[] memory status = new bool[](1);
        testReviewers[0] = reviewer;
        status[0] = true;

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).updateReviewers(testReviewers, status);

        // Register submission
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        // First review should succeed via UserOperation
        PackedUserOperation memory userOp =
            buildUserOp(0xbeef, abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20)));
        handleUserOp(userOp);

        // Second review from same reviewer should fail
        userOp = buildUserOp(0xbeef, abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 40)));

        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(RoyaltyAutoClaim.AlreadyReviewed.selector)
        );
        handleUserOp(userOp);
    }

    // ======================================== Submitter Functions ========================================

    function test_claimRoyalty_with_erc20() public {
        address submitter = vm.randomAddress();
        uint256 initialBalance = token.balanceOf(address(proxy));
        uint256 expectedRoyalty = 30 ether; // (20 + 40) / 2 = 30

        // Setup submission and reviews
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        // Claim royalty
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        // Verify state changes
        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(
            uint256(submission.status), uint256(RoyaltyAutoClaim.SubmissionStatus.Claimed), "Status should be Claimed"
        );
        assertEq(token.balanceOf(submitter), expectedRoyalty, "Submitter should receive correct royalty");
        assertEq(token.balanceOf(address(proxy)), initialBalance - expectedRoyalty, "Proxy balance should decrease");
    }

    function test_claimRoyalty_with_native_token() public {
        // Change token to native ETH
        vm.prank(owner);
        RoyaltyAutoClaim(address(proxy)).changeRoyaltyToken(NATIVE_TOKEN);

        address submitter = vm.randomAddress();
        uint256 initialBalance = address(proxy).balance;
        uint256 expectedRoyalty = 30 ether; // (20 + 40) / 2 = 30

        // Setup submission and reviews
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        // Claim royalty
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        // Verify state changes
        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(
            uint256(submission.status), uint256(RoyaltyAutoClaim.SubmissionStatus.Claimed), "Status should be Claimed"
        );
        assertEq(address(submitter).balance, expectedRoyalty, "Submitter should receive correct royalty");
        assertEq(address(proxy).balance, initialBalance - expectedRoyalty, "Proxy balance should decrease");
    }

    function testCannot_claimRoyalty_if_submission_not_registered() public {
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.SubmissionNotExist.selector));
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("nonexistent");
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        address submitter = vm.randomAddress();

        // Setup submission and reviews
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        // First claim should succeed
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        // Second claim should fail
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.AlreadyClaimed.selector));
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_already_claimed_4337() public {
        address submitter = vm.addr(0xbeef);

        // Setup submission and reviews
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        // First claim should succeed via UserOperation
        PackedUserOperation memory userOp = buildUserOp(0xbeef, abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));
        handleUserOp(userOp);

        // Second claim should fail
        userOp = buildUserOp(0xbeef, abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(RoyaltyAutoClaim.AlreadyClaimed.selector)
        );
        handleUserOp(userOp);
    }

    function testCannot_claimRoyalty_if_not_enough_reviews() public {
        address submitter = vm.randomAddress();

        // Setup submission with only one review
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.NotEnoughReviews.selector));
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
    }

    function testCannot_claimRoyalty_if_zero_royalty() public {
        address submitter = vm.randomAddress();

        // Setup submission with zero royalty reviews
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.NotEnoughReviews.selector));
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
    }

    // ======================================== ERC-4337 ========================================

    function test_validateUserOp_owner_functions() public {
        // Test owner functions
        bytes[] memory ownerCalls = new bytes[](5);
        ownerCalls[0] = abi.encodeCall(UUPSUpgradeable.upgradeToAndCall, (address(0), ""));
        ownerCalls[1] = abi.encodeCall(RoyaltyAutoClaim.changeAdmin, (address(0)));
        ownerCalls[2] = abi.encodeCall(RoyaltyAutoClaim.changeRoyaltyToken, (address(0)));
        ownerCalls[3] = abi.encodeCall(OwnableUpgradeable.transferOwnership, (address(0)));
        ownerCalls[4] = abi.encodeCall(RoyaltyAutoClaim.emergencyWithdraw, (address(0), 0));

        // Should fail for non-owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = buildUserOp(0xbeef, ownerCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
                )
            );
            handleUserOp(userOp);
        }

        // Should succeed for owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = buildUserOp(1, ownerCalls[i]);
            handleUserOp(userOp);
        }
    }

    function test_validateUserOp_admin_functions() public {
        // Test admin functions
        bytes[] memory adminCalls = new bytes[](4);
        adminCalls[0] = abi.encodeCall(RoyaltyAutoClaim.updateReviewers, (new address[](0), new bool[](0)));
        adminCalls[1] = abi.encodeCall(RoyaltyAutoClaim.registerSubmission, ("test", address(0)));
        adminCalls[2] = abi.encodeCall(RoyaltyAutoClaim.updateRoyaltyRecipient, ("test", address(0)));
        adminCalls[3] = abi.encodeCall(RoyaltyAutoClaim.revokeSubmission, ("test"));

        // Should fail for non-admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = buildUserOp(0xbeef, adminCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
                )
            );
            handleUserOp(userOp);
        }

        // Should succeed for admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = buildUserOp(2, adminCalls[i]); // admin's private key is 2
            handleUserOp(userOp);
        }
    }

    function test_validateUserOp_reviewer_functions() public {
        // Test reviewer function
        bytes memory reviewerCall = abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20));

        // Should fail for non-reviewer
        PackedUserOperation memory userOp = buildUserOp(0xbeef, reviewerCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        // Should succeed for reviewer
        userOp = buildUserOp(3, reviewerCall); // reviewer's private key is 3
        handleUserOp(userOp);
    }

    function test_validateUserOp_public_functions() public {
        // Test public function (claimRoyalty)
        bytes memory publicCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test"));

        // Should succeed for any address
        PackedUserOperation memory userOp = buildUserOp(0xbeef, publicCall);
        handleUserOp(userOp);
    }

    function test_validateUserOp_unsupported_selector() public {
        // Test unsupported selector
        bytes4 unsupportedSelector = bytes4(keccak256("unsupportedFunction()"));
        bytes memory unsupportedCall = abi.encodePacked(unsupportedSelector);

        PackedUserOperation memory userOp = buildUserOp(0xbeef, unsupportedCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.UnsupportSelector.selector, unsupportedSelector)
            )
        );
        handleUserOp(userOp);
    }

    function buildUserOp(uint256 privateKey, bytes memory callData)
        internal
        view
        returns (PackedUserOperation memory)
    {
        PackedUserOperation memory userOp = createUserOp();
        userOp.sender = address(proxy);
        userOp.nonce = entryPoint.getNonce(address(proxy), 0);
        userOp.callData = callData;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(privateKey, ECDSA.toEthSignedMessageHash(entryPoint.getUserOpHash(userOp)));
        userOp.signature = abi.encodePacked(r, s, v);
        return userOp;
    }
}
