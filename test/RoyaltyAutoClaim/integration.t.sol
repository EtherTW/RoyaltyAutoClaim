// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../utils/MockV2.sol";
import "./BaseTest.t.sol";

contract RoyaltyAutoClaim_Integration_Test is BaseTest {
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
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(proxy), ownerCalls[i]);
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

        // Should succeed for owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(ownerKey, address(proxy), ownerCalls[i]);
            _handleUserOp(userOp);
        }
    }

    function test_validateUserOp_admin_functions() public {
        // Test Admin Functions
        bytes[] memory adminCalls = new bytes[](4);
        adminCalls[0] = abi.encodeCall(RoyaltyAutoClaim.updateReviewers, (new address[](0), new bool[](0)));
        adminCalls[1] = abi.encodeCall(RoyaltyAutoClaim.registerSubmission, ("test", address(0)));
        adminCalls[2] = abi.encodeCall(RoyaltyAutoClaim.updateRoyaltyRecipient, ("test", address(0)));
        adminCalls[3] = abi.encodeCall(RoyaltyAutoClaim.revokeSubmission, ("test"));

        // Should fail for non-admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(proxy), adminCalls[i]);
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

        // Should succeed for admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(adminKey, address(proxy), adminCalls[i]); // admin's private key is 2
            _handleUserOp(userOp);
        }
    }

    function test_validateUserOp_reviewer_functions() public {
        bytes memory reviewerCall = abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20));

        // Should fail for non-reviewer
        PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(proxy), reviewerCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fake)
            )
        );
        _handleUserOp(userOp);

        // Should succeed for reviewer1
        userOp = _buildUserOp(reviewer1Key, address(proxy), reviewerCall); // reviewer's private key is 3
        _handleUserOp(userOp);

        // Should succeed for reviewer2
        userOp = _buildUserOp(reviewer2Key, address(proxy), reviewerCall); // reviewer's private key is 3
        _handleUserOp(userOp);
    }

    function test_validateUserOp_public_functions() public {
        bytes memory publicCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test"));

        // Should succeed for any address
        PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(proxy), publicCall);
        _handleUserOp(userOp);
    }

    function test_validateUserOp_unsupported_selector() public {
        bytes4 unsupportedSelector = bytes4(keccak256("unsupportedFunction()"));
        bytes memory unsupportedCall = abi.encodePacked(unsupportedSelector);

        PackedUserOperation memory userOp = _buildUserOp(fakeKey, address(proxy), unsupportedCall);
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
        PackedUserOperation memory userOp =
            _buildUserOp(fakeKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));

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

    function test_upgradeToAndCall() public {
        MockV2 v2 = new MockV2();

        PackedUserOperation memory userOp = _buildUserOp(
            fakeKey,
            address(proxy),
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
            address(proxy),
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        _handleUserOp(userOp);
        assertEq(address(uint160(uint256(vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2));
    }

    function test_transferOwnership() public {
        PackedUserOperation memory userOp =
            _buildUserOp(ownerKey, address(proxy), abi.encodeCall(OwnableUpgradeable.transferOwnership, (newOwner)));
        _handleUserOp(userOp);

        assertEq(royaltyAutoClaim.owner(), newOwner);
    }

    function testCannot_transferOwnership_if_not_owner() public {
        (address fakeOwner, uint256 fakeOwnerKey) = makeAddrAndKey("fakeOwnerKey");
        PackedUserOperation memory userOp =
            _buildUserOp(fakeOwnerKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (fakeOwner)));
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, fakeOwner)
            )
        );
        _handleUserOp(userOp);
    }

    function testCannot_transferOwnership_if_zero_address() public {
        PackedUserOperation memory userOp =
            _buildUserOp(ownerKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (address(0))));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector)
        );
        _handleUserOp(userOp);
    }

    function test_reviewSubmission() public {
        _handleUserOp(
            _buildUserOp(
                adminKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.registerSubmission, ("test", submitter))
            )
        );

        // Add more reviewers for testing
        address[] memory testReviewers = new address[](4);
        uint256 randomUint = vm.randomUint();
        bool[] memory status = new bool[](4);
        for (uint256 i = 0; i < 4; i++) {
            testReviewers[i] = vm.addr(randomUint + i);
            status[i] = true;
        }

        _handleUserOp(
            _buildUserOp(
                adminKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.updateReviewers, (testReviewers, status))
            )
        );

        // Test all valid royalty levels with different reviewers
        uint16[] memory validLevels = new uint16[](4);
        validLevels[0] = 20;
        validLevels[1] = 40;
        validLevels[2] = 60;
        validLevels[3] = 80;

        uint256 expectedTotalLevel = 0;
        for (uint256 i = 0; i < validLevels.length; i++) {
            // reviewSubmission
            PackedUserOperation memory userOp = _buildUserOp(
                randomUint + i,
                address(proxy),
                abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", validLevels[i]))
            );
            _handleUserOp(userOp);

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

    function testCannot_reviewSubmission_multiple_times() public {
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        // First review should succeed via UserOperation
        PackedUserOperation memory userOp =
            _buildUserOp(reviewer1Key, address(proxy), abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20)));
        _handleUserOp(userOp);

        // Second review from same reviewer should fail
        userOp =
            _buildUserOp(reviewer1Key, address(proxy), abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 40)));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyReviewed.selector)
        );
        _handleUserOp(userOp);
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        // First claim should succeed via UserOperation
        _handleUserOp(_buildUserOp(fakeKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test"))));

        // Second claim should fail
        PackedUserOperation memory userOp =
            _buildUserOp(fakeKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        _handleUserOp(userOp);
    }
}
