// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import "../utils/MockV2.sol";
import "../utils/AATest.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

contract RoyaltyAutoClaim_Integration_Test is AATest {
    address owner;
    uint256 ownerKey;

    address newOwner;
    uint256 newOwnerKey;

    address admin = vm.addr(2);
    address[] initialReviewers = new address[](3);

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;

    IERC20 token;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function setUp() public override {
        super.setUp();

        (owner, ownerKey) = makeAddrAndKey("owner");
        (newOwner, newOwnerKey) = makeAddrAndKey("newOwner");

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
    }

    function test_validateUserOp_owner_functions() public {
        // note: 這裡只驗證 validateUserOp 的資格，沒檢查 userOp 的執行，所以 zero address 交易雖成功，理論上 userop 要是失敗的
        bytes[] memory ownerCalls = new bytes[](5);
        ownerCalls[0] = abi.encodeCall(UUPSUpgradeable.upgradeToAndCall, (address(0), ""));
        ownerCalls[1] = abi.encodeCall(RoyaltyAutoClaim.changeAdmin, (address(0)));
        ownerCalls[2] = abi.encodeCall(RoyaltyAutoClaim.changeRoyaltyToken, (address(0)));
        ownerCalls[3] = abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (address(0)));
        ownerCalls[4] = abi.encodeCall(RoyaltyAutoClaim.emergencyWithdraw, (address(0), 0));

        // Should fail for non-owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(0xbeef, address(proxy), ownerCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
                )
            );
            handleUserOp(userOp);
        }

        // Should succeed for owner
        for (uint256 i = 0; i < ownerCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(ownerKey, address(proxy), ownerCalls[i]);
            handleUserOp(userOp);
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
            PackedUserOperation memory userOp = _buildUserOp(0xbeef, address(proxy), adminCalls[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IEntryPoint.FailedOpWithRevert.selector,
                    0,
                    "AA23 reverted",
                    abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
                )
            );
            handleUserOp(userOp);
        }

        // Should succeed for admin
        for (uint256 i = 0; i < adminCalls.length; i++) {
            PackedUserOperation memory userOp = _buildUserOp(2, address(proxy), adminCalls[i]); // admin's private key is 2
            handleUserOp(userOp);
        }
    }

    function test_validateUserOp_reviewer_functions() public {
        // Test Reviewer Functions
        bytes memory reviewerCall = abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20));

        // Should fail for non-reviewer
        PackedUserOperation memory userOp = _buildUserOp(0xbeef, address(proxy), reviewerCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        // Should succeed for reviewer
        userOp = _buildUserOp(3, address(proxy), reviewerCall); // reviewer's private key is 3
        handleUserOp(userOp);
    }

    function test_validateUserOp_public_functions() public {
        // Test public function (claimRoyalty)
        bytes memory publicCall = abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test"));

        // Should succeed for any address
        PackedUserOperation memory userOp = _buildUserOp(0xbeef, address(proxy), publicCall);
        handleUserOp(userOp);
    }

    function test_validateUserOp_unsupported_selector() public {
        // Test unsupported selector
        bytes4 unsupportedSelector = bytes4(keccak256("unsupportedFunction()"));
        bytes memory unsupportedCall = abi.encodePacked(unsupportedSelector);

        PackedUserOperation memory userOp = _buildUserOp(0xbeef, address(proxy), unsupportedCall);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.UnsupportSelector.selector, unsupportedSelector)
            )
        );
        handleUserOp(userOp);
    }

    function testCannot_validateUserOp_not_from_entrypoint() public {
        PackedUserOperation memory userOp;
        vm.expectRevert(IRoyaltyAutoClaim.NotFromEntryPoint.selector);
        royaltyAutoClaim.validateUserOp(userOp, bytes32(0), 0);
    }

    function testCannot_validateUserOp_with_paymaster() public {
        PackedUserOperation memory userOp =
            _buildUserOp(0xbeef, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));

        userOp.paymasterAndData = abi.encodePacked(vm.addr(0xdead), uint128(999_999), uint128(999_999));

        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(IRoyaltyAutoClaim.ForbiddenPaymaster.selector)
            )
        );
        handleUserOp(userOp);
    }

    function test_upgradeToAndCall() public {
        MockV2 v2 = new MockV2();

        PackedUserOperation memory userOp = _buildUserOp(
            0xbeef,
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
                abi.encodeWithSelector(IRoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        userOp = _buildUserOp(
            ownerKey,
            address(proxy),
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        handleUserOp(userOp);
        assertEq(address(uint160(uint256(vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2));
    }

    function test_transferOwnership() public {
        PackedUserOperation memory userOp =
            _buildUserOp(ownerKey, address(proxy), abi.encodeCall(OwnableUpgradeable.transferOwnership, (newOwner)));
        handleUserOp(userOp);

        assertEq(royaltyAutoClaim.owner(), newOwner);

        // transfer back to owner
        userOp =
            _buildUserOp(newOwnerKey, address(proxy), abi.encodeCall(OwnableUpgradeable.transferOwnership, (owner)));
        handleUserOp(userOp);
        assertEq(royaltyAutoClaim.owner(), owner);
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
        handleUserOp(userOp);
    }

    function testCannot_transferOwnership_if_zero_address() public {
        PackedUserOperation memory userOp =
            _buildUserOp(ownerKey, address(proxy), abi.encodeCall(RoyaltyAutoClaim.transferOwnership, (address(0))));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(IRoyaltyAutoClaim.ZeroAddress.selector)
        );
        handleUserOp(userOp);
    }

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
            // Create and execute UserOperation for review submission
            PackedUserOperation memory userOp = _buildUserOp(
                10 + i, // Use the same private key as the reviewer address
                address(proxy),
                abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", validLevels[i]))
            );
            handleUserOp(userOp);

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
        address submitter = vm.randomAddress();
        address reviewer = vm.addr(0xbeef);

        // Register reviewer
        address[] memory testReviewers = new address[](1);
        bool[] memory status = new bool[](1);
        testReviewers[0] = reviewer;
        status[0] = true;

        vm.prank(admin);
        royaltyAutoClaim.updateReviewers(testReviewers, status);

        // Register submission
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);

        // First review should succeed via UserOperation
        PackedUserOperation memory userOp =
            _buildUserOp(0xbeef, address(proxy), abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 20)));
        handleUserOp(userOp);

        // Second review from same reviewer should fail
        userOp = _buildUserOp(0xbeef, address(proxy), abi.encodeCall(RoyaltyAutoClaim.reviewSubmission, ("test", 40)));

        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0), address(proxy), userOp.nonce, abi.encodeWithSelector(IRoyaltyAutoClaim.AlreadyReviewed.selector)
        );
        handleUserOp(userOp);
    }

    function testCannot_claimRoyalty_if_already_claimed() public {
        address submitter = vm.addr(0xbeef);

        // Setup submission and reviews
        vm.prank(admin);
        royaltyAutoClaim.registerSubmission("test", submitter);
        vm.prank(initialReviewers[0]);
        royaltyAutoClaim.reviewSubmission("test", 20);
        vm.prank(initialReviewers[1]);
        royaltyAutoClaim.reviewSubmission("test", 40);

        // First claim should succeed via UserOperation
        PackedUserOperation memory userOp =
            _buildUserOp(0xbeef, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));
        handleUserOp(userOp);

        // Second claim should fail
        userOp = _buildUserOp(0xbeef, address(proxy), abi.encodeCall(RoyaltyAutoClaim.claimRoyalty, ("test")));
        vm.expectEmit(false, true, true, true);
        emit IEntryPoint.UserOperationRevertReason(
            bytes32(0),
            address(proxy),
            userOp.nonce,
            abi.encodeWithSelector(IRoyaltyAutoClaim.SubmissionNotClaimable.selector)
        );
        handleUserOp(userOp);
    }
}
