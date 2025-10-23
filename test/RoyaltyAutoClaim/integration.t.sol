// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../utils/MockV2.sol";
import "./BaseTest.t.sol";

/*

forge test test/RoyaltyAutoClaim/integration.t.sol -vvvv --skip test/RoyaltyAutoClaim/e2e.t.sol


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
    IRegistrationVerifier newRegistrationVerifier = IRegistrationVerifier(makeAddr("newRegistrationVerifier"));

    function setUp() public override {
        super.setUp();
    }

    function test_validateUserOp_owner_functions() public {
        // note: 這裡只驗證 validateUserOp 的資格，沒檢查 userOp 的執行，所以 zero address 交易雖成功，理論上 userop 要是失敗的
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
        bytes[] memory adminCalls = new bytes[](3);
        adminCalls[0] = abi.encodeCall(RoyaltyAutoClaim.updateReviewers, (new address[](0), new bool[](0)));
        adminCalls[1] = abi.encodeCall(RoyaltyAutoClaim.revokeSubmission, (testSubmissionTitle));
        adminCalls[2] = abi.encodeCall(RoyaltyAutoClaim.updateRegistrationVerifier, (newRegistrationVerifier));

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

        bytes memory reviewerCall = abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, (testSubmissionTitle, 20));

        // Should fail for non-reviewer
        PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), reviewerCall);
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
        userOp = _buildUserOp(fakeKey, address(royaltyAutoClaim), reviewerCall);
        // Put reviewer1 address but signed with fakeKey
        userOp.signature = _signUserOp(fakeKey, userOp, reviewer1);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
        _handleUserOp(userOp);

        // Should succeed for reviewer1
        userOp = _buildUserOp(reviewer1Key, address(royaltyAutoClaim), reviewerCall);
        _handleUserOp(userOp);

        // Should succeed for reviewer2
        userOp = _buildUserOp(reviewer2Key, address(royaltyAutoClaim), reviewerCall);
        _handleUserOp(userOp);
    }

    function test_validateUserOp_recipient_functions() public {
        _registerSubmission(testSubmissionTitle, recipient);

        _reviewSubmission(reviewer1Key, testSubmissionTitle, 20);
        _reviewSubmission(reviewer2Key, testSubmissionTitle, 40);

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

    // TODO
    // test_registerSubmission
    // test_updateRoyaltyRecipient

    function test_reviewSubmission() public {
        _registerSubmission(testSubmissionTitle, recipient);

        // Add more reviewers for testing
        uint256 numAddedReviewers = vm.randomUint(1, 10);
        address[] memory testReviewers = new address[](numAddedReviewers);
        uint256 randomUint = vm.randomUint();
        bool[] memory status = new bool[](numAddedReviewers);
        for (uint256 i = 0; i < numAddedReviewers; i++) {
            testReviewers[i] = vm.addr(randomUint + i);
            status[i] = true;
        }

        _handleUserOp(
            _buildUserOp(
                adminKey,
                address(royaltyAutoClaim),
                abi.encodeCall(RoyaltyAutoClaim.updateReviewers, (testReviewers, status))
            )
        );

        // Test all valid royalty levels with different reviewers
        uint16[] memory validLevels = new uint16[](4);
        validLevels[0] = royaltyAutoClaim.ROYALTY_LEVEL_20();
        validLevels[1] = royaltyAutoClaim.ROYALTY_LEVEL_40();
        validLevels[2] = royaltyAutoClaim.ROYALTY_LEVEL_60();
        validLevels[3] = royaltyAutoClaim.ROYALTY_LEVEL_80();

        uint256 numReviewed = 0;
        uint256 expectedTotalLevel = 0;
        for (uint256 i = 0; i < numAddedReviewers; i++) {
            bool willReview = vm.randomBool();
            if (!willReview) {
                continue;
            }

            // reviewSubmission
            uint16 reviewLevel = validLevels[vm.randomUint(0, 3)];
            _reviewSubmission(randomUint + i, testSubmissionTitle, reviewLevel);

            numReviewed++;
            expectedTotalLevel += reviewLevel;

            RoyaltyAutoClaim.Submission memory submission = royaltyAutoClaim.submissions(testSubmissionTitle);
            assertEq(submission.reviewCount, numReviewed, "Review count should increment");
            assertEq(submission.totalRoyaltyLevel, expectedTotalLevel, "Total royalty level should be cumulative");

            // Verify hasReviewed is set to true for the reviewer
            assertTrue(
                royaltyAutoClaim.hasReviewed(testSubmissionTitle, testReviewers[i]),
                "hasReviewed should be true for reviewer"
            );
        }
    }

    function testCannot_reviewSubmission_multiple_times() public {
        _registerSubmission(testSubmissionTitle, recipient);

        // First review should succeed via UserOperation
        _reviewSubmission(reviewer1Key, testSubmissionTitle, 20);

        // Second review from same reviewer should fail
        PackedUserOperation memory userOp = _buildUserOp(
            reviewer1Key,
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, (testSubmissionTitle, 40))
        );
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
        _reviewSubmission(reviewer1Key, testSubmissionTitle, 20);
        _reviewSubmission(reviewer2Key, testSubmissionTitle, 40);

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

    function _reviewSubmission(uint256 reviewerKey, string memory title, uint16 royaltyLevel) public {
        PackedUserOperation memory userOp = _buildUserOp(
            reviewerKey,
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, (title, royaltyLevel))
        );
        _handleUserOp(userOp);
    }
}
